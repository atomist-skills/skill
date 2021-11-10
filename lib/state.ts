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

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { CommandContext, Contextual, EventContext } from "./handler/handler";
import { debug } from "./log/console";
import { guid, handleError, isPrimitive, toArray } from "./util";

export async function hydrate<T>(
	configurationName: string,
	ctx: Contextual<any, any>,
	options?: { value?: T; ttl?: number; global?: boolean },
): Promise<T> {
	const key = stateKey(configurationName, ctx, options?.global);
	try {
		const stateFile = await ctx.storage.retrieve(key, {
			ttl: options?.ttl,
		});
		const state = await fs.readJson(stateFile);
		return {
			...(options?.value || ({} as T)),
			...state,
		};
	} catch (e) {
		return options?.value || ({} as T);
	}
}

export async function save(
	state: Record<string, any>,
	configurationName: string,
	ctx: Contextual<any, any>,
	options?: { global?: boolean },
): Promise<void> {
	const key = stateKey(configurationName, ctx, options?.global);
	try {
		const targetFilePath = path.join(os.tmpdir() || "/tmp", guid());
		await fs.ensureDir(path.dirname(targetFilePath));
		await fs.writeJson(targetFilePath, state);
		await ctx.storage.store(key, targetFilePath);
	} catch (e) {
		debug(`Failed to save state: ${e.message}`);
	}
}

function stateKey(
	configurationName: string,
	ctx: Contextual<any, any>,
	global?: boolean,
): string {
	return `state/${global ? "global" : ctx.workspaceId}/${
		ctx.skill.namespace
	}/${ctx.skill.name}/${configurationName
		.replace(/[^a-zA-Z0-9-_/]/g, "")
		.toLowerCase()}.json`;
}

export function cachify<
	T extends (
		ctx: EventContext<any, any> | CommandContext<any>,
		...args: any
	) => Promise<any>,
>(
	func: T,
	options?: {
		resolver?: (...args: any) => string;
		ttl?: number;
		global?: boolean;
		// Memoize the result for a given period before going off and retrieving
		// it from the caching backend again
		memoize?: boolean;
	},
): T {
	if (!func.name) {
		throw new Error("cachify does not support anonymous functions");
	}
	const cache = options?.memoize
		? new Map<string, { ttl: number; value: T }>()
		: undefined;
	const memoizeTtl = Math.floor(options.ttl / 4);
	return (async (ctx: EventContext<any, any>, ...args: any) => {
		let key;
		if (options?.resolver) {
			key = options.resolver(...args);
		} else {
			key = args.reduce((p, c) => {
				if (isPrimitive(c)) {
					return `${p}_${c.toString()}`;
				} else {
					return p;
				}
			}, func.name || "cachify");
		}
		const resultKey = `${toArray(
			ctx.configuration,
		)[0].name.toLowerCase()}/${key.toLowerCase()}`;
		// debug(`cachify starting '${resultKey}'`);

		if (options?.memoize) {
			const cacheEntry = cache.get(resultKey);
			if (cacheEntry?.ttl > Date.now()) {
				// debug(`cachify memoize hit '${resultKey}'`);
				return cacheEntry.value;
			}
		}

		const old = await hydrate(resultKey, ctx, {
			value: { result: undefined },
			ttl: options?.ttl,
			global: options?.global,
		});
		// debug(`cachify hydrate result '${resultKey}'`);

		if (old.result) {
			const cacheResult = JSON.parse(old.result);
			if (options?.memoize) {
				cache.set(resultKey, {
					ttl: Date.now() + memoizeTtl,
					value: cacheResult,
				});
			}
			// debug(`cachify hydrate hit '${resultKey}'`);
			return cacheResult;
		}
		const result = await func(ctx, ...args);
		// debug(`cachify wrapped function returned '${resultKey}'`);

		await handleError(() =>
			save({ result: JSON.stringify(result) }, resultKey, ctx, {
				global: options?.global,
			}),
		);
		// debug(`cachify result stored '${resultKey}'`);

		if (options?.memoize) {
			cache.set(resultKey, {
				ttl: Date.now() + memoizeTtl,
				value: result,
			});
		}
		return result;
	}) as any;
}
