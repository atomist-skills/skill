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
import * as assert from "power-assert";

import { execPromise, spawnPromise } from "../../lib/child_process";
import {
	checkout,
	ensureBranch,
	hasBranch,
	retryOptions,
} from "../../lib/git/operation";
import { determineBranch } from "../../lib/git/status";
import * as log from "../../lib/log/console";
import { guid } from "../../lib/util";

describe("operation", () => {
	let origDebug: any;
	before(() => {
		origDebug = Object.getOwnPropertyDescriptor(log, "debug");
		Object.defineProperty(log, "debug", {
			value: () => {
				return;
			},
		});
	});
	after(() => {
		if (origDebug) {
			Object.defineProperty(log, "debug", origDebug);
		}
	});

	describe("hasBranch", () => {
		/*
		it("finds existing branch", async () => {
			assert(await hasBranch(process.cwd(), "main"));
		});
		*/

		it("does not find non-existent branch", async () => {
			assert(
				!(await hasBranch(
					process.cwd(),
					`branch-that-does-not-exist-${guid()}`,
				)),
			);
		});
	});

	describe("ensureBranch", function (this: Mocha.Suite): void {
		this.timeout(20000);
		before(function (this: Mocha.Context): void {
			if (!process.env.SLOW_TESTS) {
				this.skip();
			}
		});
		const origin = "origin";
		let cwd: string | undefined;
		let tmp: string | undefined;
		const defaultBranch = "main";
		before(async () => {
			retryOptions.retries = 0;
			tmp = path.join(
				os.tmpdir(),
				`atm-skill-test-ensurebranch-${guid()}`,
			);
			await fs.ensureDir(tmp);
			const org = "atomisthqtest";
			const repo = "skill-ensurebranch-test";
			cwd = path.join(tmp, repo);
			const remoteResult = await execPromise("git", [
				"remote",
				"get-url",
				origin,
			]);
			const remote = remoteResult.stdout.trim();
			const cloneUrl = remote.replace(
				"atomist-skills/skill",
				`${org}/${repo}`,
			);
			await execPromise("git", [
				"clone",
				cloneUrl,
				cwd,
				"--branch=main",
				"--depth=2",
			]);
		});
		afterEach(async () => {
			await checkout(cwd, defaultBranch);
			await spawnPromise(
				"git",
				["reset", "--hard", `${origin}/${defaultBranch}`],
				{ cwd },
			);
		});
		const branches: string[] = [];
		after(async () => {
			retryOptions.retries = 4;
			for (const branch of branches) {
				const rv = await spawnPromise(
					"git",
					["push", "--delete", origin, branch],
					{ cwd },
				);
				if (rv.error) {
					console.log(
						`failed to delete branch ${branch}: ${rv.error.message}`,
					);
				} else if (rv.status !== 0) {
					console.log(
						`failed to delete branch ${branch}: ${rv.stderr}`,
					);
				}
			}
			if (tmp) {
				await fs.remove(tmp);
			}
		});

		it("creates non-existent branch locally", async () => {
			const b = `atomist/delete-test-branch-${guid()}`;
			assert(!(await hasBranch(cwd, b)));
			await ensureBranch(cwd, b, false);
			assert(await hasBranch(cwd, b));
			assert((await determineBranch(cwd)) === b);
			assert(
				(await spawnPromise("git", ["fetch", origin, b], { cwd }))
					.status !== 0,
			);
		});

		it("checks out local branch", async () => {
			const b = `atomist/delete-test-branch-${guid()}`;
			await execPromise("git", ["checkout", "-b", b], { cwd });
			const n = path.join(cwd, `local-file-${guid()}`);
			await fs.writeFile(n, "test local file");
			await execPromise("git", ["add", n], { cwd });
			await execPromise(
				"git",
				[
					"commit",
					"--no-gpg-sign",
					"--no-verify",
					"--message=Add local file",
				],
				{ cwd },
			);
			await checkout(cwd, defaultBranch);
			assert(!fs.existsSync(n));
			await ensureBranch(cwd, b, false);
			assert((await determineBranch(cwd)) === b);
			assert(fs.existsSync(n));
		});

		it("creates non-existent branch locally and remotely", async () => {
			const b = `atomist/delete-test-branch-${guid()}`;
			branches.push(b);
			await ensureBranch(cwd, b, true);
			assert(await hasBranch(cwd, b));
			assert((await determineBranch(cwd)) === b);
			assert(
				(await spawnPromise("git", ["fetch", origin, b], { cwd }))
					.status === 0,
			);
			const refResult = await execPromise(
				"git",
				["rev-parse", "--abbrev-ref", `${b}@{upstream}`],
				{ cwd },
			);
			assert(refResult.stdout.trim() === `${origin}/${b}`);
		});

		it("checks out a remote branch and sets upstream", async () => {
			const b = "existing-remote-1";
			const r = path.join(cwd, "some-file.txt");
			assert(!fs.existsSync(r));
			await ensureBranch(cwd, b, true);
			assert(await hasBranch(cwd, b));
			assert((await determineBranch(cwd)) === b);
			assert(fs.existsSync(r));
			const refResult = await execPromise(
				"git",
				["rev-parse", "--abbrev-ref", `${b}@{upstream}`],
				{ cwd },
			);
			assert(refResult.stdout.trim() === `${origin}/${b}`);
		});

		it("checks out local branch and pushes remotely", async () => {
			const b = `atomist/delete-test-branch-${guid()}`;
			branches.push(b);
			await execPromise("git", ["checkout", "-b", b], { cwd });
			const n = path.join(cwd, `local-file-${guid()}`);
			await fs.writeFile(n, "test local file");
			await execPromise("git", ["add", n], { cwd });
			await execPromise(
				"git",
				[
					"commit",
					"--no-gpg-sign",
					"--no-verify",
					"--message=Add local file",
				],
				{ cwd },
			);
			await checkout(cwd, defaultBranch);
			assert(!fs.existsSync(n));
			await ensureBranch(cwd, b, true);
			assert((await determineBranch(cwd)) === b);
			assert(fs.existsSync(n));
			assert(
				(await spawnPromise("git", ["fetch", origin, b], { cwd }))
					.status === 0,
			);
			const refResult = await execPromise(
				"git",
				["rev-parse", "--abbrev-ref", `${b}@{upstream}`],
				{ cwd },
			);
			assert(refResult.stdout.trim() === `${origin}/${b}`);
		});

		it("ensures current branch with remote", async () => {
			const f = path.join(cwd, "default");
			assert(fs.existsSync(f));
			await execPromise("git", ["reset", "--hard", `${origin}/main~1`], {
				cwd,
			});
			assert(!fs.existsSync(f));
			await ensureBranch(cwd, defaultBranch, true);
			assert((await determineBranch(cwd)) === defaultBranch);
			assert(fs.existsSync(f));
			const refResult = await execPromise(
				"git",
				["rev-parse", "--abbrev-ref", `${defaultBranch}@{upstream}`],
				{ cwd },
			);
			assert(refResult.stdout.trim() === `${origin}/${defaultBranch}`);
		});
	});
});
