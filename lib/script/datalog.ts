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
import * as yaml from "js-yaml";
import * as path from "path";

import { createDatalogClient } from "../datalog/client";
import { Skill } from "../payload";
import { guid } from "../util";
import { AtomistSkillInput } from "./skill_input";
import { apiKey, wid } from "./skill_register";

export async function query(args: {
	cwd: string;
	query: string;
	config?: string;
	workspace?: string;
	parse: boolean;
	tx?: number;
}): Promise<void> {
	const skill: Skill = {
		id: guid(),
	} as any;

	if (args.config) {
		const content = (
			await fs.readFile(path.join(args.cwd, ".atomist", "skill.yaml"))
		).toString();
		const atomistYaml: { skill: AtomistSkillInput } = yaml.load(
			content,
		) as any;
		skill.name = atomistYaml.skill.name;
		skill.namespace = atomistYaml.skill.namespace;
		skill.version = atomistYaml.skill.version;
		skill.configuration = {
			name: args.config,
		} as any;
	}

	const client = createDatalogClient(await apiKey(), {
		workspaceId: await wid(args.workspace),
		correlationId: guid(),
		skill,
		onComplete: undefined,
		trigger: undefined,
		message: undefined,
		credential: undefined,
		http: undefined,
	});

	const query = (
		await fs.readFile(path.join(args.cwd, args.query))
	).toString();
	const result = await client.query(query, {
		configurationName: args.config,
		tx: args.tx,
		mode: !args.parse ? "raw" : undefined,
	});
	if (args.parse) {
		console.log(JSON.stringify(result));
	} else {
		console.log(result);
	}
}
