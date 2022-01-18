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

import { execPromise, spawnPromise } from "../child_process";
import { debug } from "../log/index";
import { Project } from "../project/project";
import { cwd } from "../project/util";
import { runStatusIn, Status } from "./status";
import forOwn = require("lodash.forown");

/** Default name of default git remote. */
const origin = "origin";

/**
 * Git push options.  See git-push(1) for more information.
 */
export interface GitPushOptions {
	follow_tags?: boolean;
	force?: boolean;
	force_with_lease?: boolean | string;
	quiet?: boolean;
	verbose?: boolean;

	branch?: string;
}

/**
 * Init a new Git repository
 */
export async function init(projectOrCwd: Project | string): Promise<void> {
	await execPromise("git", ["init"], { cwd: cwd(projectOrCwd) });
}

/**
 * Return status information about a Git repository
 */
export async function status(projectOrCwd: Project | string): Promise<Status> {
	return runStatusIn(cwd(projectOrCwd));
}

/** Default retry options for git operations. */
export const retryOptions = {
	retries: 5,
	factor: 2,
	minTimeout: 500,
	maxTimeout: 5000,
	randomize: true,
};

export type CommitEditor = (
	pd: Project | string,
) => Promise<string | undefined>;

/** Argument to [[persistChanges]]. */
export interface PersistChangesArgs {
	/**
	 * Project containing or path to cloned git repository.
	 */
	project: Project | string;
	/**
	 * Branch to commit to. If it does not exist, it is created. See
	 * [[ensureBranch]] for details.
	 */
	branch: string;
	/**
	 * Functions that make changes to the project. If a function
	 * returns a string, that string is used as the commit message for
	 * the changes the function made. If a function returns
	 * `undefined`, committing is deferred until a subsequent function
	 * returns a string. If there are uncommitted changes when all
	 * editors have been run, [[message]] is used as the commit
	 * message for the remaining changes.
	 */
	editors: CommitEditor[];
	/**
	 * If there are uncommitted changes after all [[editors]] have
	 * run, this is used as the commit message. If [[message]] is not
	 * provided and there are changes to commit, a default message is
	 * used.
	 */
	message?: string;
	/** Git commit author information. */
	author?: { login?: string; email?: string };
	/** Options to supply to `git push`. */
	options?: GitPushOptions;
}

/**
 * Execute editors on a project, commit, and then push the commit(s) to
 * the remote. Effort is made to ensure success. The git status should
 * be clean, i.e., have no uncommited changes, when calling this
 * function.
 */
export async function persistChanges(args: PersistChangesArgs): Promise<void> {
	if (!args.editors || args.editors.length < 1) {
		throw new Error(`No project editors provided`);
	}

	const dir = cwd(args.project);
	const stat = await status(dir);
	if (!stat.isClean) {
		throw new Error(`Git project is not clean`);
	}

	const branch = args.branch;
	await ensureBranch(args.project, branch, true);

	await (
		await import("p-retry")
	)(async () => {
		await execPromise("git", ["fetch", origin, branch], { cwd: dir });
		await execPromise("git", ["reset", "--hard", `${origin}/${branch}`], {
			cwd: dir,
		});

		await editCommit(args.project, args.editors, args.message, args.author);

		await push(args.project, { ...args.options, branch });
	}, retryOptions);
}

/** [[_ensureBranch]] with retry. */
export async function ensureBranch(
	projectOrCwd: Project | string,
	branch: string,
	sync: boolean,
): Promise<void> {
	await (
		await import("p-retry")
	)(async () => _ensureBranch(projectOrCwd, branch, sync), retryOptions);
}

/**
 *
 * Ensure a branch exists locally and check it out. The behavior
 * depends on the value of `sync`.
 *
 * If `sync` is `true`, the local branch will be reset to its remote
 * counterpart, if it exists. If the remote branch does not exist,
 * then the local branch, which may have just been created, is pushed
 * to the remote and set as the upstream.
 *
 * If `sync` is `false` and the branch exists locally, use it. If
 * branch does not exist locally, create it. Any existing remote
 * branch is ignored.
 *
 * Since most skills clone only a single branch, this function updates
 * the remote.origin.fetch configuration to map all remote branches to
 * local branches, instead of just the cloned branch.
 *
 * @param projectOrCwd local git repository clone
 * @param branch branch to ensure exists
 * @param sync ensure local branch and its remote are in sync
 */
async function _ensureBranch(
	projectOrCwd: Project | string,
	branch: string,
	sync: boolean,
): Promise<void> {
	const dir = cwd(projectOrCwd);
	const opts = { cwd: dir };
	await execPromise(
		"git",
		[
			"config",
			`remote.${origin}.fetch`,
			`+refs/heads/*:refs/remotes/${origin}/*`,
		],
		opts,
	);
	const localExists = await hasBranch(dir, branch);
	const fetchResult = await spawnPromise(
		"git",
		["fetch", origin, branch],
		opts,
	);
	const remoteExists = fetchResult.status === 0;
	debug(
		`Ensuring branch ${branch}: sync=${sync} ` +
			`localExists=${localExists} remoteExists=${remoteExists}`,
	);
	const checkoutArgs = ["checkout", branch];
	const createArgs = ["checkout", "-b", branch];
	if (sync) {
		if (remoteExists) {
			await execPromise("git", checkoutArgs, opts);
			await execPromise(
				"git",
				["reset", "--hard", `${origin}/${branch}`],
				opts,
			);
		} else if (localExists) {
			await execPromise("git", checkoutArgs, opts);
		} else {
			await execPromise("git", createArgs, opts);
		}
		await execPromise("git", ["push", "--set-upstream", origin, branch], {
			cwd: dir,
		});
	} else {
		if (localExists) {
			await execPromise("git", checkoutArgs, opts);
		} else {
			await execPromise("git", createArgs, opts);
		}
	}
}

/**
 * Run a series of project editing functions. If a function returns a
 * string and there are uncommitted changes, the returned string is
 * used as the commit message. If an edit function returns
 * `undefined`, no commit is made prior to running the next edit
 * function. If there are uncommitted changes after all editors are
 * run, they are committed with `message` as the commit message, or a
 * generic commit message if `message` is not provided.
 *
 * @param projectOrCwd project or directory of repository
 * @param editors functions that make changes to the repository
 * @param message commit message to use for uncommitted changes
 * @param author commit author information
 * @return list of changed files, a file may appear more than once if it is
 *         changed by multiple editor functions
 */
export async function editCommit(
	projectOrCwd: Project | string,
	editors: CommitEditor[],
	message?: string,
	author?: { login?: string; email?: string },
): Promise<string[]> {
	const files: string[] = [];
	for (const editor of editors || []) {
		const msg = await editor(projectOrCwd);
		files.push(...(await changedFiles(projectOrCwd)));
		if (msg && !(await status(projectOrCwd)).isClean) {
			await commit(projectOrCwd, msg, author);
		}
	}
	if (!(await status(projectOrCwd)).isClean) {
		const msg =
			message || `Updates from Atomist skill\n\n[atomist:generated]`;
		await commit(projectOrCwd, msg, author);
	}
	return files;
}

/**
 * `git add .` and `git commit -m MESSAGE`
 */
export async function commit(
	projectOrCwd: Project | string,
	message: string,
	options: { name?: string; email?: string } = {},
): Promise<void> {
	const dir = cwd(projectOrCwd);
	await execPromise("git", ["add", "."], { cwd: dir });
	const botName = "Atomist Bot";
	const botEmail = "bot@atomist.com";
	const env = {
		...process.env,
		GIT_AUTHOR_NAME: botName,
		GIT_AUTHOR_EMAIL: botEmail,
		GIT_COMMITTER_NAME: options.name || botName,
		GIT_COMMITTER_EMAIL: options.email || botEmail,
	};
	await execPromise(
		"git",
		["commit", "-m", message, "--no-verify", "--no-gpg-sign", "--signoff"],
		{ cwd: dir, env },
	);
}

/**
 * Check out a git ref. If checking out a commit SHA, the repo will be
 * in a detached head state. The ref must already exist.
 */
export async function checkout(
	projectOrCwd: Project | string,
	ref: string,
): Promise<void> {
	await execPromise("git", ["checkout", ref, "--"], {
		cwd: cwd(projectOrCwd),
	});
}

/**
 * Revert all changes since last commit
 */
export async function revert(projectOrCwd: Project | string): Promise<void> {
	await execPromise("git", ["clean", "-dfx"], { cwd: cwd(projectOrCwd) });
	await execPromise("git", ["checkout", "--", "."], {
		cwd: cwd(projectOrCwd),
	});
}

/**
 * Push all changes to the remote
 */
export async function push(
	projectOrCwd: Project | string,
	options?: GitPushOptions,
): Promise<void> {
	await (
		await import("p-retry")
	)(async () => _push(projectOrCwd, options), retryOptions);
}

/** Internal push functionality without retry. See [[push]]. */
async function _push(
	projectOrCwd: Project | string,
	options?: GitPushOptions,
): Promise<void> {
	const gitPushArgs = ["push"];
	const branch = options?.branch;
	const dir = cwd(projectOrCwd);

	forOwn(options, (v, k) => {
		if (k !== "branch") {
			const opt = k.replace(/_/g, "-");
			if (typeof v === "boolean") {
				if (v === false) {
					gitPushArgs.push(`--no-${opt}`);
				} else {
					gitPushArgs.push(`--${opt}`);
				}
			} else if (typeof v === "string") {
				gitPushArgs.push(`--${opt}=${v}`);
			}
		}
	});

	if (branch) {
		gitPushArgs.push("--set-upstream", origin, branch);
	} else {
		gitPushArgs.push(origin);
	}

	try {
		await execPromise("git", gitPushArgs, { cwd: dir });
	} catch (e) {
		debug("Push failed. Attempting pull and rebase");
		const fetchArgs = ["fetch", origin];
		if (branch) {
			fetchArgs.push(branch);
		}
		await execPromise("git", fetchArgs, { cwd: dir });
		const rebaseArgs = ["rebase"];
		if (branch) {
			rebaseArgs.push(`${origin}/${branch}`);
		}
		try {
			await execPromise("git", rebaseArgs, { cwd: dir });
		} catch (er) {
			debug("Rebase failed, aborting");
			await execPromise("git", ["rebase", "--abort"], { cwd: dir });
			throw er;
		}
		await execPromise("git", gitPushArgs, { cwd: dir });
	}
}

/**
 * Create branch from current HEAD.
 */
export async function createBranch(
	projectOrCwd: Project | string,
	name: string,
): Promise<void> {
	await execPromise("git", ["checkout", "-b", name], {
		cwd: cwd(projectOrCwd),
	});
}

/**
 * Check if a branch exists.
 */
export async function hasBranch(
	projectOrCwd: Project | string,
	name: string,
): Promise<boolean> {
	const result = await execPromise("git", ["branch", "--list", name], {
		cwd: cwd(projectOrCwd),
	});
	return result.stdout.replace("*", "").trim() === name;
}

/** Set git user name and email. */
export async function setUserConfig(
	project: Project,
	name = "Atomist Bot",
	email = "bot@atomist.com",
): Promise<void> {
	await project.exec("git", ["config", "user.name", name]);
	await project.exec("git", ["config", "user.email", email]);
}

/**
 * Return changed files, including untracked file.
 */
export async function changedFiles(
	projectOrCwd: Project | string,
): Promise<string[]> {
	const changedFiles = (
		await execPromise("git", ["diff", "--name-only"], {
			cwd: cwd(projectOrCwd),
		})
	).stdout
		.split("\n")
		.map(f => f.trim())
		.filter(f => !!f && f.length > 0);
	const untrackedFiles = (
		await execPromise(
			"git",
			["ls-files", "--exclude-standard", "--others"],
			{ cwd: cwd(projectOrCwd) },
		)
	).stdout
		.split("\n")
		.map(f => f.trim())
		.filter(f => !!f && f.length > 0);
	return [...changedFiles, ...untrackedFiles].sort();
}

export async function stash(
	projectOrCwd: Project | string,
	options?: { add: boolean },
): Promise<void> {
	if (options?.add) {
		await execPromise("git", ["add", "."], { cwd: cwd(projectOrCwd) });
	}
	await execPromise("git", ["stash"], { cwd: cwd(projectOrCwd) });
}

export async function stashPop(projectOrCwd: Project | string): Promise<void> {
	await execPromise("git", ["stash", "pop"], { cwd: cwd(projectOrCwd) });
}

export async function headChangedFiles(
	projectOrCwd: Project | string,
): Promise<string[]> {
	return (
		await execPromise("git", ["diff", "--name-only", "HEAD~1"], {
			cwd: cwd(projectOrCwd),
		})
	).stdout
		.split("\n")
		.map(f => f.trim())
		.filter(f => !!f && f.length > 0);
}
