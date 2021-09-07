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

import { SpawnSyncOptions } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";

import {
	execPromise,
	ExecPromiseResult,
	spawnPromise,
	SpawnPromiseOptions,
	SpawnPromiseReturns,
	WritableLog,
} from "../child_process";
import { init, setUserConfig } from "../git";
import { debug, info } from "../log";
import { AuthenticatedRepositoryId } from "../repository/id";
import { handleError } from "../util";
import { CloneOptions, doClone } from "./clone";

export type Spawn = (
	cmd: string,
	args?: string[],
	opts?: SpawnPromiseOptions & { level?: "debug" | "info" },
) => Promise<SpawnPromiseReturns>;
export type Exec = (
	cmd: string,
	args?: string[],
	opts?: SpawnSyncOptions,
) => Promise<ExecPromiseResult>;

/** Git repository project */
export interface Project<C = any> {
	id: AuthenticatedRepositoryId<C>;

	path(...elements: string[]): string;

	spawn: Spawn;
	exec: Exec;
}

/** Create a [[Project]] from an existing local directory */
export async function load<C>(
	id: AuthenticatedRepositoryId<C>,
	baseDir: string,
	options: { userConfig: boolean } = { userConfig: true },
): Promise<Project<C>> {
	const project: Project<C> = {
		id,
		path: (...elements: string[]): string =>
			path.join(baseDir, ...(elements || [])),
		spawn: (cmd, args, opts): Promise<SpawnPromiseReturns> =>
			spawnPromise(cmd, args, {
				log: log(opts?.level),
				cwd: baseDir,
				...(opts || {}),
			}),
		exec: (cmd, args, opts): Promise<ExecPromiseResult> =>
			execPromise(cmd, args, { cwd: baseDir, ...(opts || {}) }),
	};
	if (!(await fs.pathExists(baseDir))) {
		await fs.ensureDir(baseDir);
	}
	if (!(await fs.pathExists(path.join(baseDir, ".git")))) {
		await init(baseDir);
	}
	if (options?.userConfig) {
		await handleError(() => setUserConfig(project));
	}
	return project;
}

/** Clone a repository to create a [[Project]] */
export async function clone<C>(
	id: AuthenticatedRepositoryId<C>,
	options?: CloneOptions,
): Promise<Project<C>> {
	const baseDir = await doClone(id, options);
	const project: Project<C> = {
		id,
		path: (...elements: string[]): string =>
			path.join(baseDir, ...(elements || [])),
		spawn: (cmd, args, opts): Promise<SpawnPromiseReturns> =>
			spawnPromise(cmd, args, {
				log: log(opts?.level),
				cwd: baseDir,
				...(opts || {}),
			}),
		exec: (cmd, args, opts): Promise<ExecPromiseResult> =>
			execPromise(cmd, args, { cwd: baseDir, ...(opts || {}) }),
	};
	await handleError(() => setUserConfig(project));
	return project;
}

function log(level = "debug"): WritableLog {
	let cb;
	switch (level) {
		case "debug":
			cb = debug;
			break;
		case "info":
			cb = info;
			break;
		default:
			cb = debug;
			break;
	}
	return {
		write: (msg: string): void => {
			let line = msg;
			if (line.endsWith("\n")) {
				line = line.slice(0, -1);
			}
			const lines = line.split("\n");
			lines.forEach(l => cb(l.trimRight()));
		},
	};
}
