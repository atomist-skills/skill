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

import { Octokit } from "@octokit/rest"; // eslint-disable-line @typescript-eslint/no-unused-vars

import { Contextual, EventContext } from "../handler/handler";
import { debug } from "../log/console";
import { AuthenticatedRepositoryId } from "../repository/id";
import { GitHubAppCredential, GitHubCredential } from "../secret/provider";
import { toArray } from "../util";
import { transactResponse } from "./transact";

const DefaultGitHubApiUrl = "https://api.github.com/";

export function api(
	id: Pick<
		AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
		"credential" | "apiUrl"
	>,
	ctx?: Contextual,
): Octokit {
	const url = id?.apiUrl || DefaultGitHubApiUrl;

	const { Octokit } = require("@octokit/rest"); // eslint-disable-line @typescript-eslint/no-var-requires

	const octokit = new Octokit({
		auth: id?.credential ? `token ${id.credential.token}` : undefined,
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
			info: debug,
			warn: debug,
			error: debug,
		},
	});

	// Add logging hook
	octokit.hook.after("request", async response => {
		debug("response", response);
	});

	if (ctx) {
		// Add hook to transact GitHub entities to Datalog
		octokit.hook.after("request", async (response, options) => {
			await transactResponse(response, options, ctx, octokit);
		});
	}
	return octokit;
}

export function formatCommitMarkers(
	ctx: EventContext,
	...tags: string[]
): string {
	return `

 [docker-scout:generated]
 [docker-scout-correlation-id:${ctx.event["execution-id"]}]${
		tags.length > 0 ? "\n" : ""
	}${tags.map(t => ` [${t}]`).join("\n")}`;
}

export function formatMarkers(ctx: EventContext, ...tags: string[]): string {
	const tx =
		ctx.event.context.subscription?.metadata?.["after-basis-t"] ||
		undefined;
	return `
<!--
  [docker-scout:generated]
  [docker-scout-workspace-id:${ctx.event["workspace-id"]}]${
		tx
			? `
  [docker-scout-tx:${tx}]`
			: ""
	}
  [docker-scout-correlation-id:${ctx.event["execution-id"]}]${
		tags.length > 0 ? "\n" : ""
	}${tags.map(t => `  [${t}]`).join("\n")}
-->`;
}

export function formatFooter(ctx: EventContext): string {
	// Do not format footer for DSO skills
	if (ctx.event.skill.configuration?.atomist?.policy) {
		return "";
	}

	const skillUrl =
		ctx.event.skill.configuration?.atomist?.skillUrl ||
		`https://go.atomist.com/catalog/skills/${ctx.event.skill.namespace}/${ctx.event.skill.name}`;
	return `	
---

<p align="center">
<sub>
<a href="${skillUrl}">${ctx.event.skill.namespace}/${
		ctx.event.skill.name
	}</a> \u00B7 ${toArray(ctx.event.skill.configuration || [])
		.map(
			c =>
				`<a href="${
					c?.atomist?.configurationUrl || c.url
				}">Configure</a>`,
		)
		.join("\u00B7")}
</sub>
</p>`;
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

export enum BlobMode {
	File = "100644",
	Executable = "100755",
}

export type ContentEditor<D> = (
	read: (path: string) => Promise<{ path: string; content: string }>,
	write: (
		path: string,
		content: string,
		mode?: BlobMode, // 100644 for file, 100755 for executable
	) => void,
) => Promise<
	| {
			commit: {
				message: string;
				author?: {
					name: string;
					email: string;
				};
			};
			detail?: D[];
	  }
	| undefined
>;

export async function editContent<D>(
	parameters: {
		credential: { token: string };
		owner: string;
		repo: string;
		sha: string;
		base?: string;
		head?: string;
		force?: boolean;
	},
	...editors: ContentEditor<D>[]
): Promise<{
	sha: string;
	files: Record<string, { content: string; mode?: BlobMode }>;
	details: D[];
}> {
	if (
		!parameters ||
		!parameters.credential ||
		!parameters.credential.token ||
		!parameters.owner ||
		!parameters.repo ||
		!parameters.sha
	) {
		throw new EditContentError(
			EditContentErrorCode.InvalidParameters,
			"Required parameter missing",
		);
	}

	// Internal file cache
	const files: Record<string, { content: string; mode?: BlobMode }> = {};
	const details: D[] = [];
	const gh = api({
		credential: { token: parameters.credential.token, scopes: [] },
	});

	// Verify that the base branch hasn't moved on
	let ref;
	if (parameters.base) {
		try {
			ref = (
				await gh.git.getRef({
					owner: parameters.owner,
					repo: parameters.repo,
					ref: `heads/${parameters.base}`,
				})
			).data;
		} catch (e) {
			throw new EditContentError(
				EditContentErrorCode.InvalidRef,
				`Failed to read ref '${parameters.base}'`,
			);
		}
		if (parameters.sha !== ref.object.sha) {
			throw new EditContentError(
				EditContentErrorCode.InvalidSha,
				`Ref '${parameters.base}' points to different commit '${ref.object.sha}'`,
			);
		}
	}

	const read = async (path: string) => {
		validatePath(path);
		if (!files[path]) {
			try {
				const response = (
					await gh.repos.getContent({
						owner: parameters.owner,
						repo: parameters.repo,
						ref: parameters.sha,
						path,
					})
				).data as { content?: string };
				files[path] = {
					content: Buffer.from(response.content, "base64").toString(),
				};
			} catch (e) {
				files[path] = { content: undefined };
			}
		}
		return {
			path,
			content: files[path].content,
		};
	};
	const write =
		(fileCache: Record<string, { content: string; mode?: BlobMode }>) =>
		(path, content, mode?) => {
			validatePath(path);
			if (content === undefined) {
				throw new EditContentError(
					EditContentErrorCode.InvalidContent,
					"Content required",
				);
			}
			fileCache[path] = {
				content,
				mode,
			};
		};

	let sha = parameters.sha;
	let commit;
	for (const editor of editors) {
		const fileCache = {};
		const editResult = await editor(read, write(fileCache));
		// Nothing to do
		if (!editResult) {
			continue;
		}
		const message = editResult.commit.message;
		const author = editResult.commit.author;
		details.push(...(editResult.detail || []));

		// Persist changes
		const blobs = [];
		for (const path of Object.keys(fileCache)) {
			const file = fileCache[path];

			// Make changes visible to next editor
			files[path] = {
				content: file.content,
				mode: file.mode || files[file.path]?.mode,
			};

			const blob = (
				await gh.git.createBlob({
					owner: parameters.owner,
					repo: parameters.repo,
					content: Buffer.from(file.content).toString("base64"),
					encoding: "base64",
				})
			).data;

			blobs.push({
				path,
				type: "blob",
				mode: files[path].mode || BlobMode.File,
				sha: blob.sha,
			});
		}

		const tree = (
			await gh.git.createTree({
				owner: parameters.owner,
				repo: parameters.repo,
				base_tree: sha,
				tree: blobs,
			})
		).data;

		commit = (
			await gh.git.createCommit({
				owner: parameters.owner,
				repo: parameters.repo,
				parents: [sha],
				tree: tree.sha,
				author: {
					name: author?.name || "Atomist Bot",
					email: author?.email || "bot@atomist.com",
				},
				message,
			})
		).data;
		sha = commit.sha;
	}

	if (commit) {
		// Update the ref
		const refName = parameters.head || parameters.base;
		try {
			await gh.git.createRef({
				owner: parameters.owner,
				repo: parameters.repo,
				ref: `refs/heads/${refName}`,
				sha: commit.sha,
			});
		} catch (e) {
			await gh.git.updateRef({
				owner: parameters.owner,
				repo: parameters.repo,
				ref: `heads/${refName}`,
				sha: commit.sha,
				force:
					// Never attempt a force push on main or master branch; only on our branches
					parameters.head && refName.startsWith("docker/")
						? parameters.force
						: false,
			});
		}
	}

	return {
		sha,
		files,
		details,
	};
}

export enum EditContentErrorCode {
	InvalidPath = "INVALID_PATH",
	InvalidContent = "INVALID_CONTENT",
	InvalidRef = "INVALID_REF",
	InvalidSha = "INVALID_SHA",
	InvalidParameters = "INVALID_PARAMETERS",
}

export class EditContentError extends Error {
	constructor(
		public readonly code: EditContentErrorCode,
		public readonly message: string,
	) {
		super(message);
	}
}

export function validatePath(name: string): void {
	if (!name) {
		throw new EditContentError(
			EditContentErrorCode.InvalidPath,
			`Path required`,
		);
	} else if (!/^(?![/])[a-zA-Z0-9+_#/.-]+$/.test(name)) {
		throw new EditContentError(
			EditContentErrorCode.InvalidPath,
			`Invalid path '${name}' provided`,
		);
	}
}
