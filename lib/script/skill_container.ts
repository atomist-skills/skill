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

import { spawnPromise } from "../child_process";
import { packageJson } from "../definition/skill";
import { namedDatalog } from "../definition/subscription/named";
import { info } from "../log";
import { globFiles, withGlobMatches } from "../project/util";
import { AtomistSkillInput, AtomistSkillRuntime, content } from "./skill_input";
import merge = require("lodash.merge");

export async function defaults(
	cwd: string,
): Promise<Partial<AtomistSkillInput>> {
	const originUrl = await spawnPromise(
		"git",
		["config", "--get", "remote.origin.url"],
		{ cwd },
	);
	const giturl = (await import("git-url-parse"))(originUrl.stdout.trim());
	let description = `Atomist Skill registered from ${giturl.owner}/${giturl.name}`;
	let longDescription = description;
	let readme = description;

	if (await fs.pathExists(path.join(cwd, "README.md"))) {
		const readmeContent = (
			await fs.readFile(path.join(cwd, "README.md"))
		).toString();
		const descriptionRegexp =
			/<!---atomist-skill-description:start--->([\s\S]*)<!---atomist-skill-description:end--->/gm;
		const descriptionMatch = descriptionRegexp.exec(readmeContent);
		if (descriptionMatch) {
			description = descriptionMatch[1].trim();
			longDescription = description;
		}
		const longDescriptionRegexp =
			/<!---atomist-skill-long_description:start--->([\s\S]*)<!---atomist-skill-long_description:end--->/gm;
		const longDescriptionMatch = longDescriptionRegexp.exec(readmeContent);
		if (longDescriptionMatch) {
			longDescription = longDescriptionMatch[1].trim();
		}
		const readmeRegexp =
			/<!---atomist-skill-readme:start--->([\s\S]*)<!---atomist-skill-readme:end--->/gm;
		const readmeMatch = readmeRegexp.exec(readmeContent);
		if (readmeMatch) {
			readme = readmeMatch[1].trim();
		}
	}

	let iconUrl = `https://github.com/${giturl.owner}.png`;
	const icons = await globFiles(cwd, "**/icon.svg");
	if (icons.length > 0) {
		const iconFile = (await fs.readFile(path.join(cwd, icons[0]))).toString(
			"base64",
		);
		iconUrl = `data:image/svg+xml;base64,${iconFile}`;
	}

	return {
		name: giturl.name,
		namespace: giturl.owner === "atomist-skills" ? "atomist" : giturl.owner,
		displayName: giturl.name,
		author: giturl.owner === "atomist-skills" ? "Atomist" : giturl.owner,
		description,
		longDescription,
		readme,
		iconUrl,
		homepageUrl: `https://github.com/${giturl.owner}/${giturl.name}`,
		license: "Apache-2.0",
	};
}

export async function createYamlSkillInput(
	cwd: string,
	artifacts: boolean,
): Promise<AtomistSkillInput> {
	info(`Generating skill metadata...`);

	let is = await defaults(cwd);

	if (await fs.pathExists(path.join(cwd, "package.json"))) {
		const pj: any = packageJson(path.join(cwd, "package.json"));
		is = merge({}, is, pj);
	}

	if (await fs.pathExists(path.join(cwd, "skill.yaml"))) {
		const doc: any = yaml.load(
			(await fs.readFile(path.join(cwd, "skill.yaml"))).toString(),
		);
		is = merge({}, is, doc.skill ? doc.skill : doc);
	}

	const rc = content(cwd);

	const subscriptions = [];
	for (const subscription of is.subscriptions || [
		"file://**/graphql/subscription/*.graphql",
	]) {
		const subs = (await rc(subscription)).map(s =>
			s
				.replace(/\$\{namespace\}/g, is.namespace)
				.replace(/\$\{name\}/g, is.name),
		);
		subscriptions.push(...subs);
	}

	const datalogSubscriptions = [];
	datalogSubscriptions.push(
		...(await withGlobMatches<{
			name: string;
			query: string;
			limit?: number;
		}>(cwd, "**/datalog/subscription/*.edn", async file => {
			const filePath = path.join(cwd, file);
			const fileName = path.basename(filePath);
			const extName = path.extname(fileName);
			return {
				query: (await fs.readFile(path.join(cwd, file))).toString(),
				name: fileName.replace(extName, ""),
			};
		})),
	);
	datalogSubscriptions.forEach(dl => {
		if (dl.query.startsWith("@")) {
			dl.query = namedDatalog(dl.query);
		}
	});
	(is.datalogSubscriptions || []).forEach(d => {
		const eds = datalogSubscriptions.find(ds => d.name === ds.name);
		if (eds) {
			eds.query = d.query;
			eds.limit = d.limit;
		} else {
			datalogSubscriptions.push(d);
		}
	});
	const schemata = [...(is.schemata || [])];
	if (schemata.length === 0) {
		schemata.push(
			...(await withGlobMatches<{ name: string; schema: string }>(
				cwd,
				"**/datalog/schema/*.{json,edn}",
				async file => {
					const filePath = path.join(cwd, file);
					const fileName = path.basename(filePath);
					const extName = path.extname(fileName);
					const schema = (
						await fs.readFile(path.join(cwd, file))
					).toString();
					return {
						schema,
						name: fileName.replace(extName, ""),
					};
				},
			)),
		);
	}

	const y: Omit<AtomistSkillInput, "commitSha" | "branchId" | "repoId"> = {
		...(is as any),
		readme: is.readme
			? Buffer.from(is.readme).toString("base64")
			: undefined,
		subscriptions,
		datalogSubscriptions,
		schemata,
	};

	if (!y.longDescription) {
		y.longDescription = y.description;
	}

	if (artifacts) {
		if (!y.artifacts?.docker) {
			const gcf = y.artifacts?.gcf?.[0];
			y.artifacts = {
				gcf: [
					{
						entryPoint: gcf?.entryPoint || "entryPoint",
						memory: gcf?.memory || 256,
						timeout: gcf?.timeout || 60,
						runtime: gcf?.runtime || AtomistSkillRuntime.Nodejs14,
						name: "gcf",
						url: undefined,
					},
				],
			};
		}
	} else {
		delete y.artifacts;
	}

	return y as any;
}
