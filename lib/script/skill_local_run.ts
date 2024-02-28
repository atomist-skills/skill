import * as proc from "child_process";
import { parseEDNString, toEDNStringFromSimpleObject } from "edn-data";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import * as dt from "luxon";
import * as os from "os";
import * as path from "path";
import * as Pusher from "pusher-js";

import { createHttpClient } from "../http";
import { info, warn } from "../log";
import { Project, withGlobMatches } from "../project";
import { createProjectLoader } from "../project/loader";
import { defaults } from "./skill_container";
import { AtomistSkillInput } from "./skill_input";

import merge = require("lodash.merge");
import kebabCase = require("lodash.kebabcase");

export const SKILL_ENVIRONMENTS = ["staging", "prod"] as const;
export type EnvironmentKey = typeof SKILL_ENVIRONMENTS[number];
interface EnvironmentProps {
	skills: {
		url: string;
	};
	pusher: {
		url: string;
		appKey: string;
	};
	dockerHub: {
		host: string; // to determine which credential store to use
		index: string; // to request credentials from the store
		login: string; // to auth against
	};
}
const ENVIRONMENTS: Record<EnvironmentKey, EnvironmentProps> = {
	staging: {
		skills: {
			url: "https://api.scout-stage.docker.com/v1",
		},
		pusher: {
			url: "https://api.scout-stage.docker.com/pusher/skills/channel/auth",
			appKey: "06c3da0f7d1f0601872d",
		},
		dockerHub: {
			host: "registry-1-stage.docker.io",
			index: "https://registry-1-stage.docker.io/v1/",
			login: "https://hub-stage.docker.com/v2/users/login",
		},
	},
	prod: {
		skills: {
			url: "https://api.scout.docker.com/v1",
		},
		pusher: {
			url: "https://api.scout.docker.com/pusher/skills/channel/auth",
			appKey: "e7f313cb5f6445399f58",
		},
		dockerHub: {
			host: "index.docker.io",
			index: "https://index.docker.io/v1/",
			login: "https://hub.docker.com/v2/users/login",
		},
	},
};

export interface LocalRunOptions {
	cwd: string;
	organization: string;
	url: string;
	env: EnvironmentKey;
	verbose: boolean;
	skill?: string;
	namespace?: string;
}

type AtomistSkillConfigYaml = Array<{
	name: string;
	enabled: boolean;
	parameters: AtomistSkillInput["parameters"];
}>;

interface SkillConfiguration {
	displayName: string;
	name: string;
	etag: string;
	parameters: {
		name: string;
		type: string;
		value: unknown;
	}[];
	enabled: boolean;
}
interface ConfiguredSkill {
	configurations: SkillConfiguration[];
}

async function configureSkill(
	skill: AtomistSkillInput,
	skillConfigYaml: AtomistSkillConfigYaml,
	options: LocalRunOptions,
	token: string,
) {
	info(
		`Configuring skill %s/%s in %s`,
		skill.namespace,
		skill.name,
		options.organization,
	);

	const env = ENVIRONMENTS[options.env];
	const url = `${env.skills.url}/organizations/${options.organization}/skills/namespaces/${skill.namespace}/names/${skill.name}/configurations`;

	const configResponse = await createHttpClient().get(url, {
		headers: {
			"Authorization": `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	});
	if (configResponse.status >= 300) {
		throw new Error(
			`Fetching configurations from ${url} returned unexpected status ${
				configResponse.status
			}: ${await configResponse.text()}`,
		);
	}

	const configuredSkill: ConfiguredSkill =
		(await configResponse.json()) as ConfiguredSkill;
	const existingConfiguration = configuredSkill.configurations?.[0];
	const createNew = existingConfiguration === undefined;

	const configureUrl = createNew
		? url
		: `${url}/${existingConfiguration.name}`;
	const body = JSON.stringify({
		displayName: createNew
			? `${os.userInfo().username}@${os.hostname()} - ${
					skillConfigYaml?.[0]?.name
			  }`
			: existingConfiguration.displayName,
		name: createNew ? "local_configured_skill" : existingConfiguration.name,
		etag: existingConfiguration?.etag,
		enabled: true,
		version: skill.version,
		parameters: skillConfigYaml?.[0]?.parameters || [],
	});
	const configureResponse = await createHttpClient().request(configureUrl, {
		method: createNew ? "POST" : "PATCH",
		headers: {
			"Authorization": `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body,
	});
	if (configureResponse.status >= 300) {
		info("Failing request body: %s", body);
		throw new Error(
			`Storing ${createNew ? "new " : ""}configuration ${
				createNew
					? "local_configured_skill"
					: existingConfiguration.name
			} to ${url} returned unexpected status ${
				configureResponse.status
			}: ${await configureResponse.text()}.`,
		);
	}

	const updatedConfiguration: SkillConfiguration =
		(await configureResponse.json()) as SkillConfiguration;
	for (const param of updatedConfiguration.parameters) {
		const url = param?.value?.[0]?.url;
		if (url) {
			info(`Webhook url %s`, url);
		}
	}
}

async function registerSkill(
	wd: string,
	options: LocalRunOptions,
	token: string,
) {
	let skill: any = await defaults(wd);

	const p = await createProjectLoader().load({} as any, wd, {
		userConfig: false,
	});

	let skillConfigYaml: AtomistSkillConfigYaml;
	const configDefs =
		(await getYamlFile<AtomistSkillConfigYaml>(p, "skill.config.yaml"))
			?.docs || [];
	if (configDefs.length !== 0) {
		if (configDefs.length > 1) {
			info(
				"Multiple entries were found in skill.config.yaml, only using the first one.",
			);
		}
		skillConfigYaml = configDefs[0];
	}

	// load skill.yaml from project (at this point it can be the container filesystem or repo contents)
	let skillYaml: any;
	const skillDefs = await getYamlFile<AtomistYaml>(p, "skill.yaml");
	if (!skillDefs) {
		throw new Error("skill.yaml not found");
	} else if (skillDefs.docs.length === 0) {
		throw new Error("skill.yaml contains no skill definitions");
	} else if (skillDefs.docs.length === 1) {
		if (options.skill) {
			warn("Ignoring --skill as there is only definition in skill.yaml");
		}
		skillYaml = skillDefs.docs[0].skill;
	} else {
		if (!options.skill) {
			throw new Error(
				"Expected a single document in skill.yaml, but multiple were found. Use --skill to specify the skill name to run.",
			);
		}
		skillYaml = skillDefs.docs.find(
			s => s.skill.name === options.skill,
		)?.skill;
		if (!skillYaml) {
			throw new Error(
				`Skill ${options.skill} was not found in skill.yaml`,
			);
		}
	}

	if (options.namespace) {
		skillYaml.namespace = options.namespace;
	}

	skill = merge(skill, skillYaml, {});

	skill.name = `${skill.name}-${os.userInfo().username}`;
	skill.version = `0.0.1-${dt.DateTime.fromJSDate(new Date()).toFormat(
		"yyyyLLddHHmmss",
	)}`;
	skill.apiVersion = "v2";
	await inlineDatalogResources(p, skill);
	sanitizeSkillInput(skill);

	info(`Registering skill %s/%s`, skill.namespace, skill.name);

	const env = ENVIRONMENTS[options.env];
	const url = `${env.skills.url}/organizations/${options.organization}/skills:register`;
	const body = JSON.stringify(skill);
	const response = await createHttpClient().post(url, {
		headers: {
			"Authorization": `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body,
	});
	if (response.status >= 300) {
		info("Failing request body: %s", body);
		throw new Error(
			`Registration to ${url} returned unexpected status ${
				response.status
			}: ${await response.text()}.`,
		);
	}

	// registration updates the etag,
	// which we can race on if we go straight to configure
	await new Promise<void>(resolve => setTimeout(() => resolve(), 1500));

	return { skill, skillConfigYaml };
}

export async function skillLocalRun(options: LocalRunOptions): Promise<any> {
	const lock: { locked: boolean; timestamp?: number } = { locked: false };

	if (!options.verbose) {
		process.env.ATOMIST_LOG_LEVEL = "info";
	} else {
		(Pusher as any).logToConsole = true;
	}

	const token = await getHubToken(options.env);
	const wd = options.cwd || process.cwd();

	const { skill, skillConfigYaml } = await registerSkill(wd, options, token);
	await configureSkill(skill, skillConfigYaml, options, token);

	//const watcher =
	fs.watch(wd, { recursive: true }, async (event, filename) => {
		if (
			(["skill.yaml", "skill.config.yaml"].includes(filename) ||
				filename.startsWith("datalog/")) &&
			!filename.endsWith("~")
		) {
			info("Change to %s detected", filename);
			lock.timestamp = Date.now();
		}
	});
	//watcher.close();

	setInterval(async () => {
		const ts = lock.timestamp;
		if (ts < Date.now() - 5 * 1000 && !lock.locked) {
			lock.locked = true;
			info("Updating skill registration");
			try {
				const { skill, skillConfigYaml } = await registerSkill(
					wd,
					options,
					token,
				);
				await configureSkill(skill, skillConfigYaml, options, token);
			} catch (e) {
				warn("Error updating skill");
			} finally {
				if (lock.timestamp === ts) {
					lock.timestamp = undefined;
				}
				lock.locked = false;
			}
		}
	}, 500).unref();

	info(
		`Listening for subscriptions %s/%s %s`,
		skill.namespace,
		skill.name,
		options.organization,
	);

	const env = ENVIRONMENTS[options.env];
	const pusher = new (Pusher as any)(env.pusher.appKey, {
		cluster: "mt1",
		channelAuthorization: {
			endpoint: env.pusher.url,
			headers: {
				Authorization: `Bearer ${token}`,
			},
		} as any,
	});

	const channel = pusher.subscribe(
		`private-encrypted-${options.organization.toLowerCase()}_${
			skill.namespace
		}_${skill.name}`,
	);
	channel.bind("scout:execution_trigger", async data => {
		await handlePusherEvent(data, options.url);
	});
	channel.bind("scout:sync_request", async wrapper => {
		// for sync requests they come in wrapped in a trigger object
		const event = parseEDNString(wrapper, {
			mapAs: "object",
			keywordAs: "string",
			listAs: "array",
		}) as any;
		const data = toEDNStringFromSimpleObject(event["trigger"]);

		await handlePusherEvent(data, options.url);
	});
	return new Promise<any>(() => {
		// intentionally left empty
	});
}

export interface AtomistYaml {
	skill: any;
}

export async function getYamlFile<D = any>(
	project: Project,
	name: string,
): Promise<{ name: string; content: string; docs: D[] } | undefined> {
	if (await fs.pathExists(project.path(name))) {
		const content = (await fs.readFile(project.path(name))).toString();
		const docs: D[] = yaml.loadAll(content) as D[];
		return {
			name,
			content,
			docs,
		};
	}
	return undefined;
}

export async function inlineDatalogResources(
	p: Project,
	skill: AtomistSkillInput,
): Promise<void> {
	const datalogSubscriptions = [];
	datalogSubscriptions.push(
		...(await withGlobMatches<{
			name: string;
			query: string;
			limit?: number;
		}>(p, "datalog/subscription/*.edn", async file => {
			const filePath = p.path(file);
			const fileName = path.basename(filePath);
			const extName = path.extname(fileName);
			return {
				query: (await fs.readFile(filePath)).toString(),
				name: fileName.replace(extName, ""),
			};
		})),
	);
	(skill.datalogSubscriptions || []).forEach(d => {
		const eds = datalogSubscriptions.find(ds => d.name === ds.name);
		if (eds) {
			eds.query = d.query;
			eds.limit = d.limit;
		} else {
			datalogSubscriptions.push(d);
		}
	});
	skill.datalogSubscriptions = datalogSubscriptions;

	const schemata = [...(skill.schemata || [])];
	if (schemata.length === 0) {
		schemata.push(
			...(await withGlobMatches<{
				name: string;
				schema: string;
			}>(p, "datalog/schema/*.edn", async file => {
				const filePath = path.join(p.path(), file);
				const fileName = path.basename(filePath);
				const extName = path.extname(fileName);
				const schema = (await fs.readFile(filePath)).toString();
				return {
					schema,
					name: fileName.replace(extName, ""),
				};
			})),
		);
	}
	skill.schemata = schemata;
}

async function handlePusherEvent(data: string, url: string) {
	try {
		const event = parseEDNString(data, {
			mapAs: "object",
			keywordAs: "string",
			listAs: "array",
		}) as any;

		const http = createHttpClient();
		if (event["compact?"]) {
			const executionResponse = await http.get(event.urls.trigger, {
				headers: { Authorization: `Bearer ${event.token}` },
			});
			if (executionResponse.status >= 300) {
				warn(
					"Failed to find execution trigger data for event %s, skipping",
					event["execution-id"],
				);
			}
			const response = await executionResponse.text();
			data = `${response.slice(0, -1)} :token "${event.token}"}`;
		}

		info(`Incoming subscription: %s`, data);
		const response = await http.post(url, {
			body: data,
			headers: { "Content-Type": "application/edn" },
		});
		if (response.status !== 201) {
			warn("Issue handling subscription");
		}
	} catch (e) {
		warn("Unhandled issue posting subscription", e);
	}
}

function sanitizeSkillInput(skill: any) {
	if (skill.categories) {
		skill.categories = skill.categories.map(s => s.toLowerCase());
	}

	if (skill.parameters) {
		skill.parameterSpecs = skill.parameters.map(p => {
			const paramType = kebabCase(Object.keys(p)[0]);
			const paramProps = p[Object.keys(p)[0]];
			return {
				type: paramType,
				...paramProps,
			};
		});
		delete skill.parameters;
	}

	if (skill.datalogSubscriptionPaths) {
		delete skill.datalogSubscriptionPaths;
	}
}

interface HubCredentials {
	username: string;
	password: string;
}
async function getHubToken(env: EnvironmentKey): Promise<string> {
	const { host, index, login } = ENVIRONMENTS[env].dockerHub;

	// optional envvar overrides
	if (process.env.SKILL_HUB_USER && process.env.SKILL_HUB_PASSWORD) {
		return await loginHub(env, {
			username: process.env.SKILL_HUB_USER,
			password: process.env.SKILL_HUB_PASSWORD,
		});
	}

	const { auths, credHelpers, credsStore } = await getHubConfig();
	const directAuth = auths[host] || auths[index];
	if (auths && directAuth && directAuth.auth) {
		if (directAuth.auth) {
			const [username, password] = Buffer.from(directAuth.auth, "base64")
				.toString()
				.split(":");
			return await loginHub(login, { username, password });
		}
	} else if (credHelpers && credHelpers[host]) {
		const creds = await getCredentialsFromStore(credHelpers[host], index);
		return await loginHub(login, creds);
	} else if (credsStore) {
		const creds = await getCredentialsFromStore(credsStore, index);
		return await loginHub(login, creds);
	}

	throw new Error(
		`Failed to find a matching credential store for env ${env}`,
	);
}

async function loginHub(
	url: string,
	credentials: HubCredentials,
): Promise<string> {
	const response = await createHttpClient().post(url, {
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(credentials),
	});
	const body = await response.json();
	if (response.status >= 400) {
		throw new Error(
			`Hub login to ${url} failed with status code ${response.status}: ${body}`,
		);
	}

	return body.token;
}

async function getHubConfig(): Promise<{
	auths?: {
		[registry: string]: {
			auth?: string; // base64 encoded
		};
	};
	credHelpers?: {
		[registry: string]: string;
	};
	credsStore?: string;
}> {
	const configDir =
		process.env.DOCKER_CONFIG || path.join(os.homedir(), ".docker");
	const configContents = await fs.readFile(
		path.join(configDir, "config.json"),
	);
	return JSON.parse(configContents.toString());
}

async function getCredentialsFromStore(
	store: string,
	host: string,
): Promise<HubCredentials> {
	const execResult = proc.spawnSync(`docker-credential-${store}`, ["get"], {
		input: host,
	});
	if (execResult.status !== 0) {
		throw new Error(
			`spawn docker-credential-${store} failed to get credentials for host ${host}`,
		);
	}

	const { Username, Secret } = JSON.parse(execResult.output.join("\n"));
	return {
		username: Username,
		password: Secret,
	};
}
