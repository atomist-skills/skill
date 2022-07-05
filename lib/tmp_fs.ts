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

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { EventContext } from "./handler/handler";
import { guid } from "./util";

export async function createDir(
	ctx: EventContext,
	options?: string | { name?: string; path?: string },
): Promise<string> {
	if (typeof options === "string") {
		options = { name: options };
	}
	const tmpDir =
		options?.path || path.join(os.tmpdir(), options?.name || guid());
	await fs.ensureDir(tmpDir);
	ctx.onComplete({
		name: `tmp dir ${tmpDir}`,
		callback: async () => {
			await fs.remove(tmpDir);
		},
	});
	return tmpDir;
}

export async function createFilePath(
	ctx: EventContext,
	name?: string,
): Promise<string> {
	return createFile(ctx, { name });
}

export async function createFile(
	ctx: EventContext,
	options?: { path?: string; name?: string; content?: string },
): Promise<string> {
	const tmpPath = options?.path
		? options.path
		: path.join(os.tmpdir(), options?.name || guid());
	ctx.onComplete({
		name: `tmp file ${tmpPath}`,
		callback: async () => {
			await fs.remove(tmpPath);
		},
	});
	await fs.ensureDir(path.dirname(tmpPath));
	if (options?.content) {
		await fs.writeFile(tmpPath, options.content);
	}
	return tmpPath;
}
