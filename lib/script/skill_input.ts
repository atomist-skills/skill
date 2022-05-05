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

import { toEDNStringFromSimpleObject } from "edn-data";
import * as fs from "fs-extra";
import * as path from "path";

import { internalParameters } from "../definition/parameter/definition";
import { Skill } from "../definition/skill";
import { namedDatalog, namedGraphQl } from "../definition/subscription/named";
import { error, info } from "../log";
import { withGlobMatches } from "../project/util";
import { handleError, handlerLoader } from "../util";
import { createYamlSkillInput, defaults } from "./skill_container";
import map = require("lodash.map");
import merge = require("lodash.merge");

export type Maybe<T> = T | null;

export type Scalars = {
	ID: string;
	String: string;
	Boolean: boolean;
	Int: number;
	Float: number;
};

/** Start: registration inputs */
export type AtomistSkillInput = {
	artifacts: AtomistSkillArtifactsInput;
	author: Scalars["String"];
	branchId: Scalars["String"];
	categories?: Maybe<Array<AtomistSkillCategoryKey>>;
	commands?: Maybe<Array<AtomistChatCommandInput>>;
	commitSha: Scalars["String"];
	description: Scalars["String"];
	dispatchStyle?: Maybe<AtomistSkillEventDispatchStyle>;
	displayName?: Maybe<Scalars["String"]>;
	homepageUrl: Scalars["String"];
	iconUrl: Scalars["String"];
	integration?: Maybe<Scalars["Boolean"]>;
	ingesters?: Maybe<Array<Scalars["String"]>>;
	license: Scalars["String"];
	longDescription: Scalars["String"];
	maxConfigurations?: Maybe<Scalars["Int"]>;
	name: Scalars["String"];
	namespace: Scalars["String"];
	parameters?: Maybe<Array<AtomistSkillParameterSpecInput>>;
	readme?: Maybe<Scalars["String"]>;
	repoId: Scalars["String"];
	resourceProviders?: Maybe<Array<AtomistSkillResourceProviderSpecInput>>;
	subscriptions?: Maybe<Array<Scalars["String"]>>;
	technologies?: Maybe<Array<AtomistSkillTechnology>>;
	version: Scalars["String"];
	videoUrl?: Maybe<Scalars["String"]>;
	datalogSubscriptions?: Maybe<
		Array<{ name?: string; query?: string; limit?: number }>
	>;
	schemata?: Maybe<Array<{ name: string; schema: string }>>;
};

export type AtomistSkillArtifactsInput = {
	docker?: Maybe<Array<AtomistDockerSkillArtifactInput>>;
	gcf?: Maybe<Array<AtomistGcfSkillArtifactInput>>;
};

export type AtomistDockerSkillArtifactInput = {
	args?: Maybe<Array<Scalars["String"]>>;
	command?: Maybe<Array<Scalars["String"]>>;
	env?: Maybe<Array<AtomistSkillEnvVariableInput>>;
	image: Scalars["String"];
	name: Scalars["ID"];
	workingDir?: Maybe<Scalars["String"]>;
};

export type AtomistSkillEnvVariableInput = {
	name: Scalars["String"];
	value: Scalars["String"];
};

export type AtomistGcfSkillArtifactInput = {
	entryPoint: Scalars["String"];
	memory?: Maybe<Scalars["Int"]>;
	name: Scalars["ID"];
	runtime: AtomistSkillRuntime;
	timeout?: Maybe<Scalars["Int"]>;
	url: Scalars["String"];
};

export enum AtomistSkillRuntime {
	Nodejs10 = "nodejs10",
	Nodejs12 = "nodejs12",
	Nodejs14 = "nodejs14",
	Python37 = "python37",
	Go113 = "go113",
}

export enum AtomistSkillCategoryKey {
	Chat = "CHAT",
	CodeMaintenance = "CODE_MAINTENANCE",
	DevOps = "DEVOPS",
	DevSecOps = "DEVSECOPS",
	RepoManagement = "REPO_MANAGEMENT",
	Security = "SECURITY",
}

export type AtomistChatCommandInput = {
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	name: Scalars["String"];
	pattern: Scalars["String"];
};

export enum AtomistSkillEventDispatchStyle {
	Single = "single",
	Multiple = "multiple",
}

export enum AtomistSkillParameterVisiblity {
	Hidden = "hidden",
	Advanced = "advanced",
	Normal = "normal",
}

export type AtomistSkillParameterSpecInput = {
	boolean?: Maybe<AtomistSkillBooleanParameterSpecInput>;
	chatChannels?: Maybe<AtomistSkillChatChannelsParameterSpecInput>;
	float?: Maybe<AtomistSkillFloatParameterSpecInput>;
	int?: Maybe<AtomistSkillIntParameterSpecInput>;
	multiChoice?: Maybe<AtomistSkillMultiChoiceParameterSpecInput>;
	repoFilter?: Maybe<AtomistSkillRepoFilterParameterSpecInput>;
	schedule?: Maybe<AtomistSkillScheduleParameterSpecInput>;
	secret?: Maybe<AtomistSkillSecretParameterSpecInput>;
	singleChoice?: Maybe<AtomistSkillSingleChoiceParameterSpecInput>;
	string?: Maybe<AtomistSkillStringParameterSpecInput>;
	stringArray?: Maybe<AtomistSkillStringArrayParameterSpecInput>;
};

export type AtomistSkillBooleanParameterSpecInput = {
	defaultValue?: Maybe<Scalars["Boolean"]>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	name: Scalars["String"];
	required: Scalars["Boolean"];
};

export type AtomistSkillChatChannelsParameterSpecInput = {
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	maxAllowed?: Maybe<Scalars["Int"]>;
	minRequired?: Maybe<Scalars["Int"]>;
	name: Scalars["String"];
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillFloatParameterSpecInput = {
	defaultValue?: Maybe<Scalars["Float"]>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	maximum?: Maybe<Scalars["Float"]>;
	minimum?: Maybe<Scalars["Float"]>;
	name: Scalars["String"];
	placeHolder?: Maybe<Scalars["String"]>;
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillIntParameterSpecInput = {
	defaultValue?: Maybe<Scalars["Int"]>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	maximum?: Maybe<Scalars["Int"]>;
	minimum?: Maybe<Scalars["Int"]>;
	name: Scalars["String"];
	placeHolder?: Maybe<Scalars["String"]>;
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillMultiChoiceParameterSpecInput = {
	defaultValues?: Maybe<Array<Scalars["String"]>>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	maxAllowed?: Maybe<Scalars["Int"]>;
	minRequired?: Maybe<Scalars["Int"]>;
	name: Scalars["String"];
	options?: Maybe<Array<AtomistSkillChoiceInput>>;
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillChoiceInput = {
	description?: Maybe<Scalars["String"]>;
	text: Scalars["String"];
	value: Scalars["String"];
};

export type AtomistSkillRepoFilterParameterSpecInput = {
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	name: Scalars["String"];
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillScheduleParameterSpecInput = {
	defaultValue?: Maybe<Scalars["String"]>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	name: Scalars["String"];
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillSingleChoiceParameterSpecInput = {
	defaultValue?: Maybe<Scalars["String"]>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	name: Scalars["String"];
	options?: Maybe<Array<AtomistSkillChoiceInput>>;
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillStringParameterSpecInput = {
	defaultValue?: Maybe<Scalars["String"]>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	lineStyle?: Maybe<AtomistSkillStringParameterLineStyle>;
	name: Scalars["String"];
	pattern?: Maybe<Scalars["String"]>;
	placeHolder?: Maybe<Scalars["String"]>;
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillSecretParameterSpecInput = {
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	lineStyle?: Maybe<AtomistSkillStringParameterLineStyle>;
	name: Scalars["String"];
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export enum AtomistSkillStringParameterLineStyle {
	Single = "single",
	Multiple = "multiple",
}

export type AtomistSkillStringArrayParameterSpecInput = {
	defaultValue?: Maybe<Array<Maybe<Scalars["String"]>>>;
	description: Scalars["String"];
	displayName?: Maybe<Scalars["String"]>;
	maxAllowed?: Maybe<Scalars["Int"]>;
	minRequired?: Maybe<Scalars["Int"]>;
	name: Scalars["String"];
	pattern?: Maybe<Scalars["String"]>;
	required: Scalars["Boolean"];
	visibility?: Maybe<AtomistSkillParameterVisiblity>;
};

export type AtomistSkillResourceProviderSpecInput = {
	description?: Maybe<Scalars["String"]>;
	maxAllowed?: Maybe<Scalars["Int"]>;
	minRequired?: Maybe<Scalars["Int"]>;
	name: Scalars["String"];
	typeName: Scalars["String"];
};

export enum AtomistSkillTechnology {
	Java = "JAVA",
	Maven = "MAVEN",
	Docker = "DOCKER",
	Javascript = "JAVASCRIPT",
	Npm = "NPM",
	Lein = "LEIN",
	Clojure = "CLOJURE",
	Kubernetes = "KUBERNETES",
}

export async function createJavaScriptSkillInput(
	cwd: string,
	genArtifacts: boolean,
	name = "index.js",
): Promise<AtomistSkillInput> {
	const p = path.join(cwd, name);
	info(`Generating skill metadata...`);

	const is: Skill = merge(
		{},
		await defaults(cwd),
		{
			parameters: {
				...internalParameters(),
			},
		},
		await handleError<Skill>(
			async () => await (await import(p)).Skill,
			() => {
				error(`Error loading '${p}'`);
				return {} as any;
			},
		),
	);

	if (!is) {
		throw new Error(`Failed to load exported Skill constant from '${p}'`);
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
		if (d.query?.startsWith("@")) {
			d.query = namedDatalog(d.query);
		}
		const eds = datalogSubscriptions.find(ds => d.name === ds.name);
		if (eds) {
			eds.query = d.query ? d.query : eds.query;
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
					let schema = (
						await fs.readFile(path.join(cwd, file))
					).toString();
					if (file.endsWith(".json")) {
						schema = toEDNStringFromSimpleObject(
							JSON.parse(schema),
						);
					}
					return {
						schema,
						name: fileName.replace(extName, ""),
					};
				},
			)),
		);
	}

	const artifacts: any = {};
	if (genArtifacts) {
		if (!is.containers) {
			artifacts.gcf = [
				{
					entryPoint: is.runtime?.entryPoint || "entryPoint",
					memory: is.runtime?.memory || 512,
					timeout: is.runtime?.timeout || 60,
					runtime:
						(is.runtime?.platform as any) ||
						AtomistSkillRuntime.Nodejs14,
					name: "gcf",
					url: undefined,
				},
			];
		} else {
			artifacts.docker = map(is.containers, (v, k) => ({
				name: k,
				...v,
			}));
		}
	}

	const y: Omit<AtomistSkillInput, "commitSha" | "branchId" | "repoId"> = {
		name: is.name,
		namespace: is.namespace,
		displayName: is.displayName,
		version: is.version,
		author: is.author,
		description: is.description,
		longDescription: is.longDescription,
		license: is.license,
		categories: is.categories as any,
		technologies: is.technologies as any,
		homepageUrl: is.homepageUrl,
		iconUrl: await icon(cwd, is.iconUrl),
		videoUrl: is.videoUrl,

		readme: is.readme
			? Buffer.from(is.readme).toString("base64")
			: undefined,

		maxConfigurations: is.maxConfigurations,

		artifacts,

		resourceProviders: map(is.resourceProviders || {}, (v, k) => ({
			name: k,
			displayName: v.displayName,
			typeName: v.typeName,
			description: v.description,
			minRequired: v.minRequired,
			maxAllowed: v.maxAllowed,
		})),

		parameters: map(is.parameters || {}, (v, k) => {
			const type = v.type;
			delete v.type;
			return {
				[type]: {
					name: k,
					...v,
				},
			};
		}),

		commands: (is.commands || []).map(c => ({
			name: c.name,
			displayName: c.displayName,
			description: c.description,
			pattern: c.pattern.source,
		})),

		subscriptions,
		datalogSubscriptions,
		schemata,
		capabilities: is.capabilities,
	} as any;

	if (!y.longDescription) {
		y.longDescription = y.description;
	}

	return y as any;
}

export async function validateSkillInput(
	cwd: string,
	s: AtomistSkillInput,
	options: { validateHandlers: boolean } = { validateHandlers: true },
): Promise<void> {
	const errors = [];

	// Check required fields
	const requiredFields = [
		"name",
		"namespace",
		"description",
		"longDescription",
		"author",
		"homepageUrl",
		"iconUrl",
		"license",
	];
	for (const requiredField of requiredFields) {
		if (!s[requiredField]) {
			errors.push(`Required field '${requiredField}' missing`);
		}
	}

	// Check categories against schema
	for (const category of s.categories || []) {
		if (!Object.values(AtomistSkillCategoryKey).includes(category as any)) {
			errors.push(`Category '${category}' invalid`);
		}
	}

	// Check technologies against schema
	for (const technology of s.technologies || []) {
		if (
			!Object.values(AtomistSkillTechnology).includes(technology as any)
		) {
			errors.push(`Technology '${technology}' invalid`);
		}
	}

	if (options.validateHandlers) {
		// Validate commands
		for (const command of s.commands || []) {
			await handleError(
				async () => {
					const p = await handlerLoader(`commands/${command.name}`);
					if (!p) {
						errors.push(
							`Registered command '${command.name}' can't be found`,
						);
					}
				},
				async err => {
					errors.push(
						`Registered command '${command.name}' can't be found: ${err.message}`,
					);
				},
			);
		}

		// Validate subscriptions
		for (const subscription of s.subscriptions || []) {
			const match = subscription.match(/subscription\s([^\s({]+)[\s({]/);
			if (match) {
				const operationName = match[1];
				await handleError(
					async () => {
						const p = await handlerLoader(
							`events/${operationName}`,
						);
						if (!p) {
							errors.push(
								`Registered event handler '${operationName}' can't be found`,
							);
						}
					},
					async err => {
						errors.push(
							`Registered event handler '${operationName}' can't be found: ${err.message}`,
						);
					},
				);
			}
		}
	}

	if (errors.length > 0) {
		error(`Skill metadata contains errors:
${errors.map(e => `        - ${e}`).join("\n")}`);
		throw new Error(`Failed to generate skill metadata`);
	}
}

export async function generateSkill(
	cwd: string,
	validate: boolean,
	artifacts: boolean,
): Promise<void> {
	let s;
	let forceValidate = validate;
	if (forceValidate === undefined) {
		forceValidate = await fs.pathExists(path.join(cwd, "package.json"));
	}
	if (await fs.pathExists(path.join(cwd, "skill.js"))) {
		s = await createJavaScriptSkillInput(cwd, artifacts, "skill.js");
		await validateSkillInput(cwd, s, { validateHandlers: forceValidate });
	} else {
		s = await createYamlSkillInput(cwd, artifacts);
		await validateSkillInput(cwd, s, { validateHandlers: forceValidate });
	}
	await writeSkillYaml(cwd, s);
}

export async function writeSkillYaml(
	cwd: string,
	skill: AtomistSkillInput,
): Promise<void> {
	const p = path.join(cwd, ".atomist", "skill.yaml");
	await fs.ensureDir(path.dirname(p));
	const yaml = await import("js-yaml");
	const content = yaml.dump(
		{
			apiVersion: 1,
			skill,
		},
		{ skipInvalid: true },
	);
	await fs.writeFile(p, content);
	info(`Written skill metadata to '${p}'`);
}

export function content(cwd: string): (key: string) => Promise<string[]> {
	return async (key: string): Promise<string[]> => {
		if (!key) {
			return [];
		}
		if (key.startsWith("file://")) {
			const pattern = key.slice(7);
			return withGlobMatches<string>(cwd, pattern, async file => {
				return (await fs.readFile(path.join(cwd, file))).toString();
			});
		} else if (key.startsWith("@")) {
			return [namedGraphQl(key)];
		} else {
			return [key];
		}
	};
}

export async function icon(cwd: string, key: string): Promise<string> {
	if (!key) {
		return undefined;
	}

	if (key.startsWith("file://")) {
		const data = await content(cwd)(key);
		if (data?.length > 0) {
			return `data:image/svg+xml;base64,${Buffer.from(data[0]).toString(
				"base64",
			)}`;
		} else {
			return undefined;
		}
	} else {
		return key;
	}
}
