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
import * as path from "path";

import { AtomistSkillCategoryKey as Category } from "../script/skill_input";
export { Category };

export enum Technology {
	Java = "JAVA",
	Maven = "MAVEN",
	Docker = "DOCKER",
	JavaScript = "JAVASCRIPT",
	NPM = "NPM",
	Leiningen = "LEIN",
	Clojure = "CLOJURE",
	Kubernetes = "KUBERNETES",
}

export enum Platform {
	NodeJs10 = "nodejs10",
	NodeJs12 = "nodejs12",
	NodeJs14 = "nodejs14",
	Python37 = "python37",
	Python38 = "python38",
	Go113 = "go113",
	Java11 = "java11",
}

export interface SkillRuntime {
	entryPoint?: string;
	platform?: Platform;
	url?: string;
	memory?: number;
	timeout?: number;
}

export interface SkillPackage {
	bundle?: boolean;
	minify?: boolean;
	sourceMaps?: boolean;
}

export interface SkillContainer {
	image: string;
	args?: string[];
	command?: string[];
	env?: Array<{ name: string; value: string }>;
	workingDir?: string;
	resources?: {
		limit?: {
			cpu: number;
			memory: number;
		};
		request?: {
			cpu: number;
			memory: number;
		};
	};
}

export interface ResourceProvider {
	description?: string;
	displayName?: string;
	maxAllowed?: number;
	minRequired?: number;
	typeName: string;
}

export enum ParameterVisibility {
	Hidden = "hidden",
	Advanced = "advanced",
	Normal = "normal",
}

export enum LineStyle {
	Single = "single",
	Multiple = "multiple",
}

export interface Parameter<T, D = any> {
	type: T;
	defaultValue?: D;
	description: string;
	displayName?: string;
	required: boolean;
	visibility?: ParameterVisibility;
}

export type BooleanParameter = Parameter<ParameterType.Boolean, boolean>;

export interface ChatChannelParameterValue {
	channelName: string;
	channelId: string;
	chatTeamId: string;
	resourceProviderId: string;
}

export interface ChatChannelsParameter
	extends Omit<
		Parameter<ParameterType.ChatChannels, ChatChannelParameterValue[]>,
		"defaultValue"
	> {
	maxAllowed?: number;
	minRequired?: number;
}

export interface FloatParameter extends Parameter<ParameterType.Float, number> {
	maximum?: number;
	minimum?: number;
	placeHolder?: string;
}

export interface IntParameter extends Parameter<ParameterType.Int, number> {
	maximum?: number;
	minimum?: number;
	placeHolder?: string;
}

export interface MultiChoiceParameter
	extends Omit<Parameter<ParameterType.MultiChoice>, "defaultValue"> {
	defaultValues?: string[];
	maxAllowed?: number;
	minRequired?: number;
	options: Array<{
		description?: string;
		text: string;
		value: string;
	}>;
}

export interface SingleChoiceParameter
	extends Parameter<ParameterType.SingleChoice, string> {
	maxAllowed?: number;
	minRequired?: number;
	options: Array<{
		description?: string;
		text: string;
		value: string;
	}>;
}

export type RepoFilterParameter = Omit<
	Parameter<ParameterType.RepoFilter>,
	"defaultValue" | "visibility"
>;

export interface WebhookParameter
	extends Omit<Parameter<ParameterType.Webhook>, "defaultValue"> {
	maxAllowed?: number;
	minRequired?: number;
}

export type ScheduleParameter = Parameter<ParameterType.Schedule, string>;

export interface StringParameter
	extends Parameter<ParameterType.String, string> {
	lineStyle?: LineStyle;
	pattern?: string;
	placeHolder?: string;
}

export interface SecretParameter
	extends Omit<Parameter<ParameterType.Secret>, "defaultValue"> {
	lineStyle?: LineStyle;
}

export interface StringArrayParameter
	extends Parameter<ParameterType.StringArray, string[]> {
	maxAllowed?: number;
	minRequired?: number;
	pattern?: string;
}

export interface Named {
	name: string;
	namespace?: string;
}

export interface Metadata extends Required<Named> {
	version?: string;

	author: string;
	displayName: string;
	description: string;
	longDescription: string;
	readme?: string;
	license: string;

	categories?: Category[];
	technologies?: Technology[];

	homepageUrl: string;
	repositoryUrl: string;
	iconUrl: string;
	videoUrl?: string;

	integration?: boolean;
}

export enum ParameterType {
	Boolean = "boolean",
	ChatChannels = "chatChannels",
	Float = "float",
	Int = "int",
	MultiChoice = "multiChoice",
	SingleChoice = "singleChoice",
	RepoFilter = "repoFilter",
	Schedule = "schedule",
	String = "string",
	Secret = "secret",
	StringArray = "stringArray",
	Webhook = "webhook",
}

export type ParametersIndexType = string;
export type ParametersType = {
	[key in ParametersIndexType]?:
		| number
		| boolean
		| string
		| number
		| string[];
};

export interface Configuration<PARAMS extends ParametersType = any> {
	maxConfigurations?: number;

	runtime?: SkillRuntime;

	containers?: Record<string, SkillContainer>;

	package?: SkillPackage;

	parameters?: Record<
		keyof PARAMS,
		| BooleanParameter
		| FloatParameter
		| IntParameter
		| MultiChoiceParameter
		| SingleChoiceParameter
		| RepoFilterParameter
		| ScheduleParameter
		| StringParameter
		| StringArrayParameter
		| ChatChannelsParameter
		| WebhookParameter
		| SecretParameter
	>;

	resourceProviders?: Record<string, ResourceProvider>;
}

export interface Command {
	name: string;
	displayName?: string;
	description: string;
	pattern: RegExp;
}

export enum CapabilityScope {
	Ingestion = "ingestion",
	Configuration = "configuration",
	Subscription = "subscription",
}

export interface Operations {
	commands?: Command[];

	subscriptions?: string[];

	datalogSubscriptions?: Array<{
		name?: string;
		query?: string;
		limit?: number;
	}>;

	schemata?: Array<{ name: string; schema: string }>;

	capabilities?: {
		provides?: Array<{ name: string; namespace: string }>;
		requires?: Array<{
			description?: string;
			displayName?: string;
			maxAllowed?: number;
			minRequired?: number;
			name: string;
			namespace?: string;
			scopes: CapabilityScope[];
			usage: string;
		}>;
	};
}

export type Skill<PARAMS extends ParametersType> = Metadata &
	Configuration<PARAMS> &
	Operations;

export function packageJson(path = "package.json"): Partial<Metadata> {
	try {
		const pj = require(path); // eslint-disable-line @typescript-eslint/no-var-requires
		const name = pj.name?.split("/");
		return {
			name: name ? (name?.length === 2 ? name[1] : name[0]) : undefined,
			namespace: name
				? name?.length === 2
					? name[0].replace(/@/g, "")
					: undefined
				: undefined,
			displayName: pj.displayName || pj.description,
			author: typeof pj.author === "string" ? pj.author : pj.author?.name,
			license: pj.license,
			categories: pj.categories || pj.keywords,
			technologies: pj.technologies,
			homepageUrl: pj.homepage,
			repositoryUrl:
				typeof pj.repository === "string"
					? pj.repository
					: pj.repository?.url,
			iconUrl: pj.icon ? pj.icon : undefined,
		};
	} catch (e) {
		return {} as any;
	}
}

export type SkillInput<PARAMS extends ParametersType> = Partial<Metadata> &
	Configuration<PARAMS> &
	Operations;

export async function skill<PARAMS = any>(
	skill: SkillInput<PARAMS> | Promise<SkillInput<PARAMS>>,
): Promise<Skill<PARAMS>> {
	// Get the directory of the calling script
	let cwd = process.cwd();
	try {
		throw new Error();
	} catch (e) {
		const stack = (await import("stack-trace")).parse(e);
		cwd = path.dirname(stack[1].getFileName());
	}

	// Merge in an existing skill.yaml file from the root of the project
	const skillYamlPath = path.join(cwd, "skill.yaml");
	let skillYaml: any = {};
	if (await fs.pathExists(skillYamlPath)) {
		const yaml = await import("js-yaml");
		skillYaml = yaml.load((await fs.readFile(skillYamlPath)).toString());
		if (skillYaml.skill) {
			skillYaml = skillYaml.skill;
		}
	}

	return {
		...packageJson(path.join(cwd, "package.json")),
		...(skillYaml || {}),
		...(await skill),
	};
}
