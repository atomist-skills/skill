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

import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import { Octokit } from "@octokit/rest";

import { entity, entityRef } from "../datalog/util";
import { Contextual } from "../handler/handler";
import { warn } from "../log/console";
import { handleError, loggingErrorHandler } from "../util";

/**
 * Transact Datalog entities when Octokit responses come in
 */
export interface ResponseTransactor<I, O> {
	/**
	 * Check if this transactor instance supports the
	 * Octokit request and response
	 */
	supports: (
		response: O,
		options: { method: string; url: string },
	) => boolean;

	/**
	 * Transact entities
	 */
	transact: (
		response: O,
		options: { method: string; url: string } & I,
		ctx: Contextual<any, any>,
		gh: Octokit,
	) => Promise<void>;
}

/**
 * Transact pull request entities on creation
 */
export const PullRequestTransactor: ResponseTransactor<
	| RestEndpointMethodTypes["pulls"]["create"]["parameters"]
	| RestEndpointMethodTypes["pulls"]["update"]["parameters"],
	| RestEndpointMethodTypes["pulls"]["create"]["response"]
	| RestEndpointMethodTypes["pulls"]["update"]["response"]
> = {
	supports: (response, options) =>
		(response.status === 201 &&
			options.method === "POST" &&
			options.url === "/repos/{owner}/{repo}/pulls") ||
		(response.status === 200 &&
			options.method === "PATCH" &&
			options.url === "/repos/{owner}/{repo}/pulls/{pull_number}"),
	transact: async (response, options, ctx) => {
		const pr = response.data;
		const repoEntity = entity("git/repo", {
			"sourceId": pr.base.repo.id.toString(),
			"git.provider/url": "https://github.com",
		});
		const gitUserEntity = entity("git/user", {
			"login": pr.user.login,
			"git.provider/url": "https://github.com",
		});
		const sourceBranchEntity = entity("git/ref", {
			"name": pr.head.ref,
			"repo": entityRef(repoEntity),
			"type": ":git.ref.type/branch",
			"git.provider/url": "https://github.com",
		});
		const destinationBranchEntity = entity("git/ref", {
			"name": pr.base.ref,
			"repo": entityRef(repoEntity),
			"type": ":git.ref.type/branch",
			"git.provider/url": "https://github.com",
		});
		const prEntity = entity("github/pullrequest", {
			"sourceId": pr.id.toString(),
			"git.provider/url": "https://github.com",
			"title": pr.title,
			"body": pr.body,
			"number": pr.number,
			"url": pr.url,
			"state": pr.state,
			"repo": entityRef(repoEntity),
			"author": entityRef(gitUserEntity),
			"sourceBranch": entityRef(sourceBranchEntity),
			"destinationBranch": entityRef(destinationBranchEntity),
			"merged": pr.merged,
		});
		await ctx.datalog.transact([
			repoEntity,
			gitUserEntity,
			sourceBranchEntity,
			destinationBranchEntity,
			prEntity,
		]);
	},
};

/**
 * Transact check run and check suite entities
 * on CheckRun creation and updates
 */
export const CheckRunTransactor: ResponseTransactor<
	| RestEndpointMethodTypes["checks"]["create"]["parameters"]
	| RestEndpointMethodTypes["checks"]["update"]["parameters"],
	| RestEndpointMethodTypes["checks"]["create"]["response"]
	| RestEndpointMethodTypes["checks"]["update"]["response"]
> = {
	supports: (response, options) =>
		((response.status as any) === 201 &&
			options.method === "POST" &&
			options.url === "/repos/{owner}/{repo}/check-runs") ||
		((response.status as any) === 200 &&
			options.method === "PATCH" &&
			options.url === "/repos/{owner}/{repo}/check-runs/{check_run_id}"),
	transact: async (response, options, ctx, gh) => {
		const check = response.data;
		const repo = (
			await gh.repos.get({
				owner: options.owner,
				repo: options.repo,
			})
		).data;
		const repoEntity = entity("git/repo", {
			"sourceId": repo.id.toString(),
			"git.provider/url": "https://github.com",
		});
		const commitEntity = entity("git/commit", {
			"sha": check.head_sha,
			"repo": entityRef(repoEntity),
			"git.provider/url": "https://github.com",
		});
		const checksuiteEntity = entity("github/checksuite", {
			"sourceId": check.check_suite.id.toString(),
			"commit": entityRef(commitEntity),
			"repo": entityRef(repoEntity),
			"appSlug": check.app.slug,
			"appId": check.app.id,
			"git.provider/url": "https://github.com",
		});
		const checkrunEntity = entity("github/checkrun", {
			"sourceId": check.id.toString(),
			"checksuite": entityRef(checksuiteEntity),
			"git.provider/url": "https://github.com",
			"externalId": check.external_id,
			"name": check.name,
			"status": `:github.checkrun.status/${check.status}`,
			"conclusion": check.conclusion
				? `:github.checkrun.conclusion/${check.conclusion}`
				: undefined,
		});
		await ctx.datalog.transact([
			repoEntity,
			commitEntity,
			checksuiteEntity,
			checkrunEntity,
		]);
	},
};

const Transactors: ResponseTransactor<any, any>[] = [
	// CheckRunTransactor,
	PullRequestTransactor,
];

/**
 * Iterate over all ResponseTransactor instances and
 * transact entities for all supporting transactors
 */
export async function transactResponse(
	response: any, // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
	options: { method: string; url: string },
	ctx: Contextual<any, any>,
	gh: Octokit,
): Promise<void> {
	for (const transactor of Transactors.filter(t =>
		t.supports(response, options),
	)) {
		await handleError(
			() => transactor.transact(response, options, ctx, gh),
			loggingErrorHandler(warn),
		);
	}
}
