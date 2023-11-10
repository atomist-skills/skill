/*
 * Copyright © 2023 Atomist, Inc.
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

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { Check, CreateCheck, createCheck as raiseCheck } from "../github/check";
import { api } from "../github/operation";
import { error } from "../log/console";
import { mapSubscription } from "../map";
import { prepareStatus } from "../message";
import { CloneOptions } from "../project/clone";
import { Project } from "../project/project";
import {
	AuthenticatedRepositoryId,
	gitHubComRepository,
	RepositoryId,
} from "../repository/id";
import { gitHubAppToken } from "../secret/resolver";
import { failure, success } from "../status";
import { createStorageProvider } from "../storage/provider";
import { createFile } from "../tmp_fs";
import { guid, isStaging, replacer } from "../util";
import {
	EventContext,
	EventHandler,
	HandlerStatus,
	MappingEventHandler,
} from "./handler";

export function wrapEventHandler(eh: EventHandler): EventHandler {
	return async ctx => {
		const meh = eh as any as MappingEventHandler;
		if (typeof meh !== "function" && meh.map && meh.handle) {
			const data = meh.map(ctx.data);
			return meh.handle({
				...ctx,
				data,
			});
		}

		if (Array.isArray(ctx.data)) {
			const results = [];
			for (const event of ctx.data) {
				try {
					const result = await eh({ ...ctx, data: event });
					if (result) {
						results.push(result);
					}
				} catch (e) {
					error(`Error occurred: ${e.stack}`);
					results.push(prepareStatus(e, ctx));
				}
			}
			let reason;
			if (results.some(r => r.visibility !== "hidden")) {
				reason = results
					.filter(r => r.visibility !== "hidden")
					.map(r => r.reason)
					.join(", ");
			} else {
				reason = results.map(r => r.reason).join(", ");
			}
			return {
				code: results.reduce((p, c) => {
					if (c.code !== 0) {
						return c.code;
					} else {
						return 0;
					}
				}, 0),
				reason,
				visibility: results.some(r => r.visibility !== "hidden")
					? undefined
					: "hidden",
			};
		} else {
			return eh(ctx);
		}
	};
}

/**
 * Transform the incoming edn subscription result into a JavaScript object.
 */
export function transform<E = any, C = any>(
	handle: EventHandler<E, C>,
): EventHandler<E, C> {
	return async (ctx: EventContext<any, C>) => {
		const data = mapSubscription(ctx.data);
		return handle({
			...ctx,
			data,
		});
	};
}

export function transformData<T = any>(data: any): T {
	return mapSubscription<T>(data);
}

export type ChainedHandler<D, C, S> = (
	context: EventContext<D, C> & { chain: S },
) => Promise<void | HandlerStatus>;

/**
 * Chain a series of [[ChainedHandler]]s until the first one
 * returns a [[HandlerStatus]].
 */
export function chain<D, C, S = any>(
	...handlers: Array<ChainedHandler<D, C, S>>
): EventHandler<D, C> {
	return async (ctx: EventContext<D, C> & { chain: S }) => {
		ctx.chain = {} as any;
		for (const handler of handlers) {
			const result = await handler(ctx);
			if (result) {
				return result;
			}
		}
		return undefined;
	};
}

export function all<D, C, S = any>(
	...handlers: Array<ChainedHandler<D, C, S>>
): EventHandler<D, C> {
	return async (ctx: EventContext<D, C> & { chain: S }) => {
		ctx.chain = {} as any;
		const results = [];
		for (const handler of handlers) {
			const result = await handler(ctx);
			if (result) {
				results.push(result);
			}
		}
		let reason;
		if (results.some(r => r.visibility !== "hidden")) {
			reason = results
				.filter(r => r.visibility !== "hidden")
				.map(r => r.reason)
				.join(", ");
		} else {
			reason = results.map(r => r.reason).join(", ");
		}
		return {
			code: results.reduce((p, c) => {
				if (c.code !== 0) {
					return c.code;
				} else {
					return 0;
				}
			}, 0),
			reason,
			visibility: results.some(r => r.visibility !== "hidden")
				? undefined
				: "hidden",
		};
	};
}

export type CreateRepositoryId<D, C> = (
	ctx: EventContext<D, C>,
) => Pick<RepositoryId, "sourceId" | "owner" | "repo" | "sha" | "branch">;

export function createRef<D, C>(
	id: CreateRepositoryId<D, C>,
): ChainedHandler<D, C, { id?: AuthenticatedRepositoryId<any> }> {
	return async ctx => {
		const repositoryId: AuthenticatedRepositoryId<any> =
			typeof id === "function" ? id(ctx) : (id as any);
		if (!repositoryId.credential) {
			// eslint-disable-next-line deprecation/deprecation
			const credential = await ctx.credential.resolve(
				gitHubAppToken(repositoryId),
			);
			ctx.chain.id = gitHubComRepository({ ...repositoryId, credential });
		} else {
			ctx.chain.id = gitHubComRepository({ ...repositoryId });
		}
	};
}

export type CreateCloneOptions<D, C> = (
	ctx: EventContext<D, C>,
) => CloneOptions;

export function cloneRef<D, C>(
	options?: CloneOptions | CreateCloneOptions<D, C>,
): ChainedHandler<
	D,
	C,
	{ id?: AuthenticatedRepositoryId<any>; project?: Project }
> {
	return async ctx => {
		if (!ctx.chain.id) {
			return failure(
				"'id' missing in chain. Make sure to include 'createRef' in handler chain",
			);
		}
		ctx.chain.project = await ctx.project.clone(
			ctx.chain.id,
			typeof options === "function" ? options(ctx) : options,
		);
		return undefined;
	};
}

export type CreateFileCloneOptions<D, C> = (
	ctx: EventContext<D, C>,
) => string[];

export function cloneFiles<D, C>(
	options: string[] | CreateFileCloneOptions<D, C>,
): ChainedHandler<
	D,
	C,
	{ id?: AuthenticatedRepositoryId<any>; project?: Project }
> {
	return async ctx => {
		if (!ctx.chain.id) {
			return failure(
				"'id' missing in chain. Make sure to include 'createRef' in handler chain",
			);
		}
		const gh = api(ctx.chain.id);

		const paths: string[] =
			typeof options === "function" ? options(ctx) : options;

		const projectPath =
			process.env.ATOMIST_HOME || path.join(os.tmpdir(), guid());
		await fs.ensureDir(projectPath);
		ctx.chain.project = await ctx.project.load(ctx.chain.id, projectPath);

		for (const p of paths) {
			const fileResponse = (
				await gh.repos.getContent({
					owner: ctx.chain.id.owner,
					repo: ctx.chain.id.repo,
					ref: ctx.chain.id.sha || ctx.chain.id.branch,
					path: p,
				})
			).data as { content?: string };
			const fp = ctx.chain.project.path(p);
			await fs.ensureDir(path.dirname(fp));
			await fs.writeFile(fp, Buffer.from(fileResponse.content, "base64"));
		}
		return undefined;
	};
}

export type CreateCheckOptions<D, C> = (
	ctx: EventContext<D, C>,
) => Omit<CreateCheck, "sha"> | Promise<Omit<CreateCheck, "sha">>;

export function createCheck<D, C>(
	options: Omit<CreateCheck, "sha"> | CreateCheckOptions<D, C>,
): ChainedHandler<
	D,
	C,
	{ id?: AuthenticatedRepositoryId<any>; check?: Check }
> {
	return async ctx => {
		if (!ctx.chain.id) {
			return failure(
				"'id' missing in chain. Make sure to include 'createRef' in handler chain",
			);
		}
		const optsToUse =
			typeof options === "function" ? await options(ctx) : options;
		try {
			ctx.chain.check = await raiseCheck(ctx, ctx.chain.id, {
				sha: ctx.chain.id.sha,
				...optsToUse,
			});
		} catch (e) {
			if (e.status === 403) {
				return success(
					"Repository not accessible with installation token",
				).hidden();
			} else {
				throw e;
			}
		}
		return undefined;
	};
}

export function dedupe<E, C>(): EventHandler<E, C> {
	return async ctx => {
		if (process.env.ATOMIST_SKIP_DEDUPE) {
			return undefined;
		}

		const correlationId = ctx.correlationId;
		const workspaceId = ctx.workspaceId;
		const name = isStaging()
			? "atm-staging-cloud-run-dedupe"
			: "atm-prod-cloud-run-dedupe";
		const key = `correlation_ids/${ctx.skill.namespace}/${ctx.skill.name}/${ctx.name}/${correlationId}`;
		const storage = createStorageProvider(workspaceId, name);

		try {
			await storage.retrieve(key);
			return success(
				"Duplicate correlation-id detected. Aborting...",
			).hidden();
		} catch (e) {
			const p = await createFile(ctx, {
				content: JSON.stringify(ctx.trigger, replacer),
			});
			await storage.store(key, p);
			return undefined;
		}
	};
}
