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

import { error } from "../log";

export async function wid(workspaceId?: string): Promise<string> {
	let w = workspaceId || process.env.ATOMIST_WORKSPACE_ID;
	if (!w) {
		const cfgPath = path.join(
			os.homedir(),
			".atomist",
			"client.config.json",
		);
		if (await fs.pathExists(cfgPath)) {
			const cfg = await fs.readJson(cfgPath);
			w = cfg.workspaceIds[0];
		}
	}
	if (!w) {
		error(
			`No workspace id provided. Please pass --workspace or set 'ATOMIST_WORKSPACE_ID'.`,
		);
	}
	return w;
}

export async function apiKey(key?: string): Promise<string> {
	let apiKey = key || process.env.ATOMIST_API_KEY;
	if (!apiKey) {
		const cfgPath = path.join(
			os.homedir(),
			".atomist",
			"client.config.json",
		);
		if (await fs.pathExists(cfgPath)) {
			const cfg = await fs.readJson(cfgPath);
			apiKey = cfg.apiKey;
		}
	}
	if (!apiKey) {
		error(`No API key provided. Please set 'ATOMIST_API_KEY'.`);
	}
	return apiKey;
}
