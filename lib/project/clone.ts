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

import * as os from "os";
import * as path from "path";

import { execPromise } from "../child_process";
import { debug } from "../log";
import { AuthenticatedRepositoryId } from "../repository/id";
import { guid } from "../util";

export const ClonePath = path.join(os.tmpdir(), "atm-clone");

export interface CloneOptions {
	/**
	 * If this is true, the implementation should keep the directory at least
	 * for the duration of the current process. If it's false, persistence can be treated
	 * in any way.
	 */
	keep?: boolean;

	/**
	 * If this is true, always make a full clone.
	 * If it's false, and we want the master branch, and we're cloning into a transient
	 * place, then clone with `--depth 1` to save time.
	 */
	alwaysDeep?: boolean;

	/**
	 * If we are not doing a deep clone (alwaysDeep is false),
	 * then the default is to clone only one branch.
	 * Set noSingleBranch to true to clone the tips of all branches instead.
	 * This passes `--no-single-branch` to `git clone`.
	 * If alwaysDeep is true, this option has no effect.
	 */
	noSingleBranch?: boolean;

	/**
	 * Set this to the number of commits that should be cloned into the transient
	 * place. This only applies when alwaysDeep is set to false.
	 */
	depth?: number;

	/**
	 * If you really want the SHA, not the tip of the branch that we've checked out,
	 * then request a detached HEAD at that SHA.
	 */
	detachHead?: boolean;

	/**
	 * Path to clone into
	 */
	path?: string;

	/**
	 * If set to true symlinks will be cloned as links; if set to false (default)
	 * symlinks are cloned as small files instead.
	 */
	symLinks?: boolean;

	/**
	 * If set to true checking out the provided ref will be attempted (default).
	 */
	checkout?: boolean;
}

export async function doClone(
	id: AuthenticatedRepositoryId<any>,
	options: CloneOptions = {},
): Promise<string> {
	debug(
		`Cloning repository '${id.owner}/${id.repo}', branch '${
			id.branch
		}', sha '${id.sha}' and options '${JSON.stringify(options)}'`,
	);
	const sha = id.sha || "HEAD";
	const repoDir = options.path || path.join(ClonePath, guid());
	const url = id.cloneUrl();
	const cloneBranch = id.branch;
	const cloneArgs = ["clone", url, repoDir];

	// Set the global symlink flag on git according to our options; this defaults to false to err on the safe side
	await execPromise("git", [
		"config",
		"--global",
		"core.symlinks",
		options.symLinks !== undefined ? `${options.symLinks}` : "false",
	]);

	// If we wanted a deep clone, just clone it
	if (!options.alwaysDeep) {
		// If we didn't ask for a deep clone, then default to cloning only the tip of the default branch.
		// the cloneOptions let us ask for more commits than that
		cloneArgs.push(
			"--depth",
			(options.depth && options.depth > 0 ? options.depth : 1).toString(
				10,
			),
		);
		if (cloneBranch) {
			// if not cloning deeply, be sure we clone the right branch
			cloneArgs.push("--branch", cloneBranch);
		}
		if (options.noSingleBranch) {
			cloneArgs.push("--no-single-branch");
		}
	}
	// Note: branch takes preference for checkout because we might be about to commit to it.
	// If you want to be sure to land on your SHA, set opts.detachHead to true.
	// Or don't, but then call status() on the returned project to check whether the branch is still at the SHA you wanted.
	const checkoutRef = options.detachHead ? sha : id.branch || sha;

	const retryOptions = {
		retries: 4,
		factor: 2,
		minTimeout: 100,
		maxTimeout: 500,
		randomize: false,
	};
	await (
		await import("p-retry")
	)(() => execPromise("git", cloneArgs), retryOptions);

	if (options.checkout !== false) {
		try {
			await execPromise("git", ["checkout", checkoutRef, "--"], {
				cwd: repoDir,
			});
		} catch (err) {
			// When the head moved on and we only cloned with depth; we might have to do a full clone to get to the commit we want
			debug(
				`Ref ${checkoutRef} not in cloned history. Attempting full clone`,
			);
			await execPromise("git", ["fetch", "--unshallow"], {
				cwd: repoDir,
			});
			await execPromise("git", ["checkout", checkoutRef, "--"], {
				cwd: repoDir,
			});
		}
	}
	return repoDir;
}
