/*
 * Copyright © 2026 Atomist, Inc.
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

import * as assert from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

import { Platform } from "../../lib/definition/skill";
import { createYamlSkillInput } from "../../lib/script/skill_container";
import {
	AtomistSkillRuntime,
	createJavaScriptSkillInput,
} from "../../lib/script/skill_input";

async function createGitProject(): Promise<string> {
	const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "skill-input-"));
	execFileSync("git", ["init"], { cwd });
	execFileSync(
		"git",
		[
			"remote",
			"add",
			"origin",
			"https://github.com/atomist-skills/example-skill.git",
		],
		{
			cwd,
		},
	);
	return cwd;
}

describe("skill input", () => {
	it("should expose newer Node.js runtimes", () => {
		assert.deepStrictEqual(
			Object.values(AtomistSkillRuntime).filter(v =>
				v.startsWith("nodejs"),
			),
			[
				"nodejs10",
				"nodejs12",
				"nodejs14",
				"nodejs16",
				"nodejs18",
				"nodejs20",
				"nodejs22",
			],
		);
		assert.strictEqual(Platform.NodeJs22, "nodejs22");
	});

	it("should default generated JavaScript skills to nodejs22", async () => {
		const cwd = await createGitProject();
		await fs.writeFile(path.join(cwd, "index.js"), "exports.Skill = {};\n");

		const input = await createJavaScriptSkillInput(cwd, true);

		assert.strictEqual(
			input.artifacts.gcf[0].runtime,
			AtomistSkillRuntime.Nodejs22,
		);
	});

	it("should default generated YAML skills to nodejs22", async () => {
		const cwd = await createGitProject();

		const input = await createYamlSkillInput(cwd, true);

		assert.strictEqual(
			input.artifacts.gcf[0].runtime,
			AtomistSkillRuntime.Nodejs22,
		);
	});
});
