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

import { Octokit } from "@octokit/rest"; // eslint-disable-line @typescript-eslint/no-unused-vars

import { Contextual } from "../handler/handler";
import { debug, error, info, warn } from "../log/console";
import { AuthenticatedRepositoryId } from "../repository/id";
import { GitHubAppCredential, GitHubCredential } from "../secret/provider";
import { toArray } from "../util";

const DefaultGitHubApiUrl = "https://api.github.com/";

export function api(
	id: Pick<
		AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
		"credential" | "apiUrl"
	>,
): Octokit {
	const url = id.apiUrl || DefaultGitHubApiUrl;

	const { Octokit } = require("@octokit/rest"); // eslint-disable-line @typescript-eslint/no-var-requires
	const { throttling } = require("@octokit/plugin-throttling"); // eslint-disable-line @typescript-eslint/no-var-requires
	const { retry } = require("@octokit/plugin-retry"); // eslint-disable-line @typescript-eslint/no-var-requires
	const ConfiguredOctokit = Octokit.plugin(throttling, retry);

	return new ConfiguredOctokit({
		auth: `token ${id.credential.token}`,
		baseUrl: url.endsWith("/") ? url.slice(0, -1) : url,
		throttle: {
			onRateLimit: (retryAfter: any, options: any): boolean => {
				console.warn(
					`Request quota exhausted for request '${options.method} ${options.url}'`,
				);

				if (options.request.retryCount === 0) {
					// only retries once
					console.debug(`Retrying after ${retryAfter} seconds!`);
					return true;
				}
				return false;
			},
			onAbuseLimit: (retryAfter: any, options: any): void => {
				console.warn(
					`Abuse detected for request '${options.method} ${options.url}'`,
				);
			},
		},
		log: {
			debug: debug,
			info: info,
			warn: warn,
			error: error,
		},
	});
}

export function formatMarkers(
	ctx: Contextual<any, any>,
	...tags: string[]
): string {
	return `
<!--
  [atomist:generated]
  [atomist-skill:${ctx.skill.namespace}/${ctx.skill.name}]
  [atomist-version:${ctx.skill.version}]
  [atomist-configuration:${toArray(ctx.configuration)
		.map(c => c.name)
		.join(",")}]
  [atomist-workspace-id:${ctx.workspaceId}]
  [atomist-correlation-id:${ctx.correlationId}]${
		tags.length > 0 ? "\n" : ""
	}${tags.map(t => `  [${t}]`).join("\n")}
-->`;
}

export function formatFooter(ctx: Contextual<any, any>): string {
	return `
---

<sub>Skill: [\`${ctx.skill.namespace}/${ctx.skill.name}@${
		ctx.skill.version
	}\`](https://go.atomist.com/catalog/skills/${ctx.skill.namespace}/${
		ctx.skill.name
	}) \u00B7 Configuration: ${toArray(ctx.configuration)
		.map(c => `[\`${c.name}\`](${c.url})`)
		.join("\u00B7")}</sub>`;
}

export async function convergeLabel(
	id: AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
	name: string,
	color: string,
	description?: string,
): Promise<void> {
	try {
		await api(id).issues.updateLabel({
			name,
			color,
			description,
			repo: id.repo,
			owner: id.owner,
		});
	} catch (err) {
		await api(id).issues.createLabel({
			name,
			color,
			description,
			repo: id.repo,
			owner: id.owner,
		});
	}
}
