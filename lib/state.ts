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

import { Contextual } from "./handler/handler";
import { warn } from "./log/console";
import { guid } from "./util";

export async function hydrate<T>(
	configurationName: string,
	ctx: Contextual<any, any>,
	value?: T,
): Promise<T> {
	const key = stateKey(configurationName, ctx);
	try {
		const stateFile = await ctx.storage.retrieve(key);
		const state = await fs.readJson(stateFile);
		return {
			...(value || ({} as T)),
			...state,
		};
	} catch (e) {
		return value || ({} as T);
	}
}

export async function save(
	state: Record<string, any>,
	configurationName: string,
	ctx: Contextual<any, any>,
): Promise<void> {
	const key = stateKey(configurationName, ctx);
	try {
		const targetFilePath = path.join(os.tmpdir() || "/tmp", guid());
		await fs.ensureDir(path.dirname(targetFilePath));
		await fs.writeJson(targetFilePath, state);
		await ctx.storage.store(key, targetFilePath);
	} catch (e) {
		warn(`Failed to save state: ${e.message}`);
	}
}

function stateKey(
	configurationName: string,
	ctx: Contextual<any, any>,
): string {
	return `state/${ctx.workspaceId}/${ctx.skill.namespace}/${
		ctx.skill.name
	}/${configurationName.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase()}.json`;
}
