/*
 * Copyright © 2022 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";
import * as fs from "fs-extra";

import { PushStrategy } from "../definition/parameter/definition";
import * as git from "../git/operation";
import { Contextual, HandlerStatus } from "../handler/handler";
import { debug } from "../log/console";
import { Project } from "../project/project";
import { AuthenticatedRepositoryId } from "../repository/id";
import * as status from "../status";
import { hash } from "../util";
import { truncateText } from "./check";
import {
	api,
	formatCommitMarkers,
	formatFooter,
	formatMarkers,
} from "./operation";

import uniq = require("lodash.uniq");

/**
 * Persist changes to a git repository back to the remote using the
 * provided [[PushStrategy]].
 *
 * @param ctx trigger context
 * @param project repository to act on
 * @param strategy push strategy
 * @param push push that triggered this activity
 * @param pullRequest details of pull request to create, if push strategy dictates
 * @param commit commit `message` for existing changes and project `editors` to
 *               to run on project; if editor returns a string, it is used as the
 *               commit message for the changes, otherwise the changes accumulate
 *               until an editor does return a string
 * @return skill handler return status
 */
export async function persistChanges(
	ctx: Contextual<any, any>,
	project: Project,
	strategy: PushStrategy,
	push: {
		branch: string;
		defaultBranch: string;
		author: { login: string; name?: string; email?: string };
	},
	pullRequest: {
		title: string;
		body: string;
		branch: string;
		labels?: string[];
		reviewers?: string[];
		assignReviewer?: boolean;
		draft?: boolean;
		update?: (
			sha: string,
			pullRequest: RestEndpointMethodTypes["pulls"]["get"]["response"]["data"],
		) => Promise<{
			title?: string;
			body?: string;
			labels?: string[];
			reviewers?: [];
		}>;
	},
	commit: {
		message?: string;
		editors?: git.CommitEditor[];
	},
): Promise<HandlerStatus> {
	const gitStatus = await git.status(project);
	if (gitStatus.isClean && (!commit?.editors || commit.editors.length < 1)) {
		return status.success(`No changes to push`);
	}
	const createPullRequest =
		strategy === "pr" ||
		(push.branch === push.defaultBranch &&
			(strategy === "pr_default" || strategy === "pr_default_commit"));
	const createCommit =
		strategy === "commit" ||
		(push.branch === push.defaultBranch && strategy === "commit_default") ||
		(push.branch !== push.defaultBranch &&
			strategy === "pr_default_commit");
	if (!createPullRequest && !createCommit) {
		return status
			.success(
				`Skipping because of selected push strategy (${strategy}), ` +
					`branch (${push.branch}), and default branch (${push.defaultBranch})`,
			)
			.hidden();
	}
	debug(
		`Attempting to persist changes with: ${JSON.stringify({
			strategy,
			push,
			pullRequest,
			commit,
		})}`,
	);

	const author = {
		name: push.author.name,
		email: push.author.email,
	};
	const slug = `${project.id.owner}/${project.id.repo}`;
	const commitMsg =
		addCommitMarkers(commit.message, ctx) ||
		`Updates from ${ctx.skill.namespace}/${ctx.skill.name}\n\n[atomist:generated]`;
	const repoUrl = `https://github.com/${slug}`;
	const branch = createPullRequest
		? pullRequest.branch ||
		  `atomist/${ctx.skill.name.toLowerCase()}-${Date.now()}`
		: push.branch;
	const changedFiles = await git.changedFiles(project);
	if (!gitStatus.isClean) {
		// Make sure we are on a branch before committing the changes
		await git.stash(project, { add: true });
		await git.ensureBranch(project, branch, !createPullRequest);
		await git.stashPop(project);
		await git.commit(project, commitMsg, author);
	} else {
		await git.ensureBranch(project, branch, !createPullRequest);
	}

	if (createPullRequest) {
		changedFiles.push(
			...(await git.editCommit(
				project,
				wrapWithCommitMarkers(commit.editors, ctx),
				commitMsg,
				author,
			)),
		);
		if (changedFiles.length === 0) {
			return status.success(`No changes to push`);
		} else {
			return await ensurePullRequest(
				ctx,
				project,
				{ ...pullRequest, branch, changedFiles },
				push,
			);
		}
	} else {
		if (commit.editors && commit.editors.length > 0) {
			await git.persistChanges({
				project,
				branch,
				editors: wrapWithCommitMarkers(commit.editors, ctx),
				message: commitMsg,
				author,
			});
		} else {
			await git.push(project, { branch });
		}
		return status.success(
			`Pushed changes to [${slug}/${branch}](${repoUrl})`,
		);
	}
}

/**
 * Ensure that a pull request defined by the arguments exists. If a
 * single pull request already exists in the repo for the same base
 * and change branch, the current proposed changes are compared to the
 * changes on the existing pull request. If the changes are the same,
 * this function does nothing. If the changes are different, the
 * changes are pushed and the pull request is updated. If no matching
 * pull request exists, the changes are pushed and a pull request is
 * created.
 *
 * @param ctx trigger context
 * @param project repository to act on
 * @param pullRequest details of pull request to create
 * @param push push that triggered this activity
 */
async function ensurePullRequest(
	ctx: Contextual<any, any>,
	project: Project,
	pullRequest: {
		title: string;
		body: string;
		branch: string;
		changedFiles: string[];
		labels?: string[];
		reviewers?: string[];
		assignReviewer?: boolean;
		draft?: boolean;
		update?: (
			sha: string,
			pullRequest: RestEndpointMethodTypes["pulls"]["get"]["response"]["data"],
		) => Promise<{
			title?: string;
			body?: string;
			labels?: string[];
			reviewers?: [];
		}>;
	},
	push: {
		author: { login: string };
		branch: string;
	},
): Promise<HandlerStatus> {
	const gh = api(project.id, ctx);

	const files = uniq(pullRequest.changedFiles).sort();
	const hashes: Array<{ path: string; hash: string }> = [];
	for (const file of files) {
		const content = (await fs.readFile(project.path(file))).toString(
			"base64",
		);
		hashes.push({ path: file, hash: hash(content) });
	}
	const diffHash = hash(hashes);

	const slug = `${project.id.owner}/${project.id.repo}`;
	const repoUrl = `https://github.com/${slug}`;
	const body = (text: string) =>
		truncateText(`${text.trim()}

---

${files.length === 1 ? "File" : "Files"} changed:

${files
	.map(
		f =>
			`-   [\`${f}\`](https://github.com/${project.id.owner}/${project.id.repo}/blob/${pullRequest.branch}/${f})`,
	)
	.join("\n")}

<!-- atomist:hide -->
${formatFooter(ctx)}
<!-- atomist:show -->

${formatMarkers(ctx, `atomist-diff:${diffHash}`)}
`);

	const openPrs = await gh.paginate(gh.pulls.list, {
		owner: project.id.owner,
		repo: project.id.repo,
		state: "open",
		base: push.branch,
		head: `${project.id.owner}:${pullRequest.branch}`,
	});
	const newPr = openPrs.length !== 1;
	let pushRequired = true;
	if (!newPr) {
		const body = openPrs[0].body;
		const diffRegexp = /\[atomist-diff:([^\]]*)\]/;
		const diffMatch = diffRegexp.exec(body);
		if (diffMatch?.[1] === diffHash) {
			pushRequired = false;
		}
	}
	if (pushRequired) {
		await git.push(project, { branch: pullRequest.branch, force: true });
	}
	let pr = newPr
		? (
				await gh.pulls.create({
					owner: project.id.owner,
					repo: project.id.repo,
					title: pullRequest.title,
					body: body(pullRequest.body),
					base: push.branch,
					head: pullRequest.branch,
					draft: pullRequest.draft,
				})
		  ).data
		: (
				await gh.pulls.update({
					owner: project.id.owner,
					repo: project.id.repo,
					pull_number: openPrs[0].number,
					title: pullRequest.title,
					body: body(pullRequest.body),
					draft: pullRequest.draft,
				})
		  ).data;
	if (pullRequest.labels?.length > 0) {
		// Remove prefixed labels that are getting set explicitly
		const prefixes = uniq(
			pullRequest.labels
				.filter(p => p.includes(":"))
				.map(p => p.split(":")[0] + ":"),
		);
		const existingLabels = (pr.labels || [])
			.map(l => l.name)
			.filter(l => !prefixes.some(p => l.startsWith(p)));

		await gh.issues.update({
			owner: project.id.owner,
			repo: project.id.repo,
			issue_number: pr.number,
			labels: uniq([...existingLabels, ...pullRequest.labels]),
		});
	}
	if (
		!pullRequest.labels?.includes("auto-merge:on-check-success") &&
		(pullRequest.assignReviewer !== false ||
			pullRequest.reviewers?.length > 0)
	) {
		const reviewers = [...(pullRequest.reviewers || [])];
		if (
			pullRequest.assignReviewer !== false &&
			pr.user?.login !== push.author.login
		) {
			reviewers.push(push.author.login);
		}
		await gh.pulls.requestReviewers({
			owner: project.id.owner,
			repo: project.id.repo,
			pull_number: pr.number,
			reviewers: reviewers
				.filter(r => !!r)
				.filter(r => r !== "atomist[bot]")
				.filter(r => r !== "atomist-bot"),
		});
	}
	if (pullRequest.update) {
		let sha;
		if (!pushRequired) {
			sha = openPrs[0].head.sha;
		} else {
			sha = (await git.status(project)).sha;
		}
		// Re-read the PR as there might have been some external modifications
		pr = (
			await gh.pulls.get({
				owner: project.id.owner,
				repo: project.id.repo,
				pull_number: pr.number,
			})
		).data;
		const update = await pullRequest.update(sha, pr);
		if (
			update.title ||
			update.body ||
			update.labels?.length > 0 ||
			update.reviewers?.length > 0
		) {
			await gh.issues.update({
				owner: project.id.owner,
				repo: project.id.repo,
				issue_number: pr.number,
				title: update.title || pr.title,
				body: body(update.body),
				labels: uniq([
					...(update.labels || []),
					...(pr.labels || []).map(l => l.name),
				]),
			});
			if (update.reviewers?.length > 0) {
				await gh.pulls.requestReviewers({
					owner: project.id.owner,
					repo: project.id.repo,
					pull_number: pr.number,
					reviewers: uniq([
						...(pr.requested_reviewers || []).map(r => r.login),
						...update.reviewers
							.filter(r => !!r)
							.filter(r => r !== "atomist[bot]")
							.filter(r => r !== "atomist-bot"),
					]),
				});
			}
		}
	}

	if (pushRequired) {
		return status.success(
			`Pushed changes to [${slug}/${
				pullRequest.branch
			}](${repoUrl}) and ${newPr ? "raised" : "updated"} [#${
				pr.number
			}](${pr.html_url})`,
		);
	} else {
		return status.success(
			`No changes pushed to ` +
				`[${slug}/${pullRequest.branch}](${repoUrl})` +
				` because [#${pr.number}](${pr.html_url}) is up to date`,
		);
	}
}

/**
 * Close any existing pull requests in project matching the provided
 * base and head branch.
 *
 * @param ctx trigger context
 * @param project repository to act on
 * @param base pull request base branch
 * @param head pull request branch
 * @param comment comment to create when closing pull requests
 */
export async function closePullRequests(
	ctx: Contextual<any, any>,
	project: Project,
	base: string,
	head: string,
	comment: string,
): Promise<void> {
	const gh = api(project.id, ctx);
	const openPrs = await gh.paginate(gh.pulls.list, {
		owner: project.id.owner,
		repo: project.id.repo,
		state: "open",
		base,
		head: `${project.id.owner}:${head}`,
	});

	for (const openPr of openPrs) {
		await gh.issues.createComment({
			owner: project.id.owner,
			repo: project.id.repo,
			issue_number: openPr.number,
			body: `${comment.trim()}

${formatMarkers(ctx)}`,
		});
		await gh.pulls.update({
			owner: project.id.owner,
			repo: project.id.repo,
			pull_number: openPr.number,
			state: "closed",
		});
	}
}

const OpenPullRequestByShaQuery = `query openPullRequestBySha($sha: String!, $owner: String!, $repo: String!) {
  PullRequest(state: "open") {
    number
    url
    repo(owner: $owner, name: $repo) {
      owner
      name
    }
    head(sha: $sha) @required {
      sha
    }
    comments {
      commentId
      body
    }
  }
}`;

interface OpenPullRequestByShaResponse {
	PullRequest: Array<{
		number: number;
		url: string;
		repo: {
			owner: string;
			name: string;
		};
		head: {
			sha: string;
		};
		comments: Array<{
			commentId: string;
			body: string;
		}>;
	}>;
}

interface OpenPullRequestByShaVariables {
	sha: string;
	owner: string;
	repo: string;
}

export async function commentPullRequest(
	ctx: Contextual<any, any>,
	id: AuthenticatedRepositoryId<any>,
	comment: ((pr: { url: string; number: number }) => string) | string,
	type: string,
): Promise<void> {
	const openPrs = await ctx.graphql.query<
		OpenPullRequestByShaResponse,
		OpenPullRequestByShaVariables
	>(OpenPullRequestByShaQuery, {
		sha: id.sha,
		owner: id.owner,
		repo: id.repo,
	});
	if (openPrs?.PullRequest?.length > 0) {
		const openPr = openPrs.PullRequest[0];
		const existingComment = (openPr.comments || []).find(
			c =>
				c.body.includes(
					`[atomist-skill:${ctx.skill.namespace}/${ctx.skill.name}]`,
				) && c.body.includes(`[atomist-comment-type:${type}]`),
		);
		const body = typeof comment === "function" ? comment(openPr) : comment;
		if (existingComment) {
			await api(id).issues.updateComment({
				owner: id.owner,
				repo: id.repo,
				comment_id: +existingComment.commentId,
				body: `${body}

${formatMarkers(ctx, `atomist-comment-type:${type}`)}`,
			});
		} else {
			await api(id).issues.createComment({
				owner: id.owner,
				repo: id.repo,
				issue_number: openPr.number,
				body: `${body}

${formatMarkers(ctx, `atomist-comment-type:${type}`)}`,
			});
		}
	}
}

export function addCommitMarkers(
	msg: string,
	ctx: Contextual<any, any>,
): string {
	if (!msg) {
		return msg;
	}
	if (!msg.includes("[atomist:generated]")) {
		return `${msg.trim()}${formatCommitMarkers(ctx)}`;
	} else {
		return msg;
	}
}

function wrapWithCommitMarkers(
	editors: git.CommitEditor[],
	ctx: Contextual<any, any>,
): git.CommitEditor[] {
	if (editors?.length > 0) {
		return editors.map(e => async pd => {
			return addCommitMarkers(await e(pd), ctx);
		});
	} else {
		return editors;
	}
}
