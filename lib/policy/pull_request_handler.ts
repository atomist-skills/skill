/*
 * Copyright © 2021 Atomist, Inc.
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

import { truncateText } from "../github/check";
import {
	api,
	ContentEditor,
	editContent,
	EditContentError,
	EditContentErrorCode,
	formatFooter,
	formatMarkers,
} from "../github/operation";
import { EventContext, EventHandler, Status } from "../handler/handler";
import { chain, createRef, CreateRepositoryId } from "../handler/util";
import { AuthenticatedRepositoryId } from "../repository/id";
import * as status from "../status";
import { hash } from "../util";
import map = require("lodash.map");

import uniq = require("lodash.uniq");

export interface PullRequestHandlerResponse<S, C, D = string> {
	commit: {
		editors: ContentEditor<D>[];
		branch: string;
	};
	pullRequest: (
		ctx: EventContext<S, C> & {
			chain: {
				id: AuthenticatedRepositoryId<any>;
			};
		},
		detail: D[],
	) => Promise<{
		title: string;
		body: string;
		labels?: string[];
		reviewers?: string[];
		assignReviewer?: boolean;
	}>;
}

/**
 * Event handler implementation that can raise pull requests without
 * the need for cloning a repository.
 */
export function pullRequestHandler<S, C, D = string>(parameters: {
	when?: (ctx: EventContext<S, C>) => Status | undefined;
	id: CreateRepositoryId<S, C>;
	execute: (
		ctx: EventContext<S, C> & {
			chain: {
				id: AuthenticatedRepositoryId<any>;
			};
		},
	) => Promise<Status | PullRequestHandlerResponse<S, C, D>>;
}): EventHandler<S, C> {
	return chain<
		S,
		C,
		{
			id: AuthenticatedRepositoryId<any>;
			files?: Array<{ path: string; content: string }>;
		}
	>(
		async ctx => {
			if (parameters.when) {
				return parameters.when(ctx);
			}
			return undefined;
		},
		createRef<S, C>(parameters.id),
		async ctx => {
			const executeResult = await parameters.execute(ctx);
			if ((executeResult as Status).state !== undefined) {
				return executeResult as Status;
			}

			const result = executeResult as PullRequestHandlerResponse<S, C, D>;

			const gh = api(ctx.chain.id);

			let editResult;
			try {
				editResult = await editContent<D>(
					{
						credential: ctx.chain.id.credential,
						owner: ctx.chain.id.owner,
						repo: ctx.chain.id.repo,
						sha: ctx.chain.id.sha,
						base: ctx.chain.id.branch,
						head: result.commit.branch,
						force: true,
					},
					...result.commit.editors,
				);
			} catch (e) {
				if (e instanceof EditContentError) {
					if (e.code === EditContentErrorCode.InvalidSha) {
						return status.completed(`Branch moved on`);
					} else if (e.code === EditContentErrorCode.InvalidRef) {
						return status.completed(`Ref not found`);
					}
				}
				throw e;
			}

			if (editResult.sha !== ctx.chain.id.sha) {
				const pullRequest = await result.pullRequest(
					ctx,
					editResult.details,
				);

				const files = map(editResult.files, (v, k) => k).sort();
				const hashes: Array<{ path: string; hash: string }> = [];
				for (const file of files) {
					const content = editResult.files[file];
					hashes.push({ path: file, hash: hash(content) });
				}
				const diffHash = hash(hashes);

				const slug = `${ctx.chain.id.owner}/${ctx.chain.id.repo}`;
				const repoUrl = `https://github.com/${slug}`;
				const body = (text: string) =>
					truncateText(`${text.trim()}

---

${files.length === 1 ? "File" : "Files"} changed:

${files
	.map(
		f =>
			`-   [\`${f}\`](https://github.com/${ctx.chain.id.owner}/${ctx.chain.id.repo}/blob/${result.commit.branch}/${f})`,
	)
	.join("\n")}

<!-- atomist:hide -->
${formatFooter(ctx)}
<!-- atomist:show -->

${formatMarkers(ctx, `atomist-diff:${diffHash}`)}
`);

				const openPrs = await gh.paginate(gh.pulls.list, {
					owner: ctx.chain.id.owner,
					repo: ctx.chain.id.repo,
					state: "open",
					base: ctx.chain.id.branch,
					head: `${ctx.chain.id.owner}:${result.commit.branch}`,
				});
				const newPr = openPrs.length !== 1;
				const pr = newPr
					? (
							await gh.pulls.create({
								owner: ctx.chain.id.owner,
								repo: ctx.chain.id.repo,
								title: pullRequest.title,
								body: body(pullRequest.body),
								base: ctx.chain.id.branch,
								head: result.commit.branch,
							})
					  ).data
					: (
							await gh.pulls.update({
								owner: ctx.chain.id.owner,
								repo: ctx.chain.id.repo,
								pull_number: openPrs[0].number,
								title: pullRequest.title,
								body: body(pullRequest.body),
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
						owner: ctx.chain.id.owner,
						repo: ctx.chain.id.repo,
						issue_number: pr.number,
						labels: uniq([
							...existingLabels,
							...pullRequest.labels,
						]),
					});
				}

				return status.completed(
					`Pushed changes to [${slug}/${
						result.commit.branch
					}](${repoUrl}) and ${newPr ? "raised" : "updated"} [#${
						pr.number
					}](${pr.html_url})`,
				);
			} else {
				return status.completed(`No changes to push`);
			}
		},
	) as EventHandler<S, C>;
}
