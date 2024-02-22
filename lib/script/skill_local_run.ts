import { parseEDNString } from "edn-data";
import * as proc from "child_process";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import * as dt from "luxon";
import * as os from "os";
import * as path from "path";
import * as Pusher from "pusher-js";

import { createGraphQLClient, GraphQLClient } from "../graphql";
import { createHttpClient } from "../http";
import { info, warn } from "../log";
import { Project, withGlobMatches } from "../project";
import { createProjectLoader } from "../project/loader";
import { defaults } from "./skill_container";
import { AtomistSkillInput } from "./skill_input";

import merge = require("lodash.merge");
import { apiKey } from "./skill_register";

const APP_KEY_PROD = "e7f313cb5f6445399f58";
const APP_KEY_STAGING = "06c3da0f7d1f0601872d";

export interface LocalRunOptions {
	cwd: string;
	organization: string;
	url: string;
	prod: boolean;
	workspace: string;
	apiKey: string;
	verbose: boolean;
}

type AtomistSkillConfigYaml = Array<{
	name: string;
	enabled: boolean;
	parameters: AtomistSkillInput["parameters"];
}>;

async function configureSkill(
	skill: AtomistSkillInput,
	skillConfigYaml: AtomistSkillConfigYaml,
	gc: GraphQLClient,
) {
	let configuredSkill = await gc.query(
		`query ext_configuredSkill($namespace: String!, $name: String!) {
  activeSkill(namespace: $namespace, name: $name) {
    id
    configuration {
      instances {
        id
      }
    }
  }
}`,
		{ namespace: skill.namespace, name: skill.name },
	);
	const id = configuredSkill?.activeSkill?.configuration?.instances?.[0]?.id;

	configuredSkill = await gc.mutate(
		`mutation ext_configureSkill($namespace: String!, $name: String!, $version: String, $parameters: [AtomistSkillParameterInput!]) {
  saveSkillConfiguration(namespace: $namespace, name: $name, version: $version, configuration: {displayName: "${
		os.userInfo().username
  }@${os.hostname()}${
			" - " + skillConfigYaml?.[0]?.name || ""
		}", name: "local_configured_skill", enabled: true, parameters: $parameters ${
			id ? `, id: "${id}"` : ""
		}}, upgradePolicy: unstable) {
    configured(query: {namespace: $namespace, name: $name}) {
      skills {
        id
        configuration {
          instances {
            parameters {
              name
              ...on AtomistSkillWebhookParameterValue {
                value {
                  url
                }
              }
            }
          }
        }
      }
    }
  }
}`,
		{
			namespace: skill.namespace,
			name: skill.name,
			version: skill.version,
			parameters: skillConfigYaml?.[0]?.parameters || [],
			id,
		},
	);

	const parameters =
		configuredSkill?.saveSkillConfiguration?.configured?.skills?.[0]
			?.configuration.instances?.[0]?.parameters;
	for (const param of parameters) {
		const url = param?.value?.[0]?.url;
		if (url) {
			info(`Webhook url %s`, url);
		}
	}
}

async function registerSkill(
	wd: string,
	key: string,
	options: LocalRunOptions,
	gc: GraphQLClient,
) {
	let skill: any = await defaults(wd);

	const p = await createProjectLoader().load({} as any, wd, {
		userConfig: false,
	});

	const skillConfigYaml = (
		await getYamlFile<AtomistSkillConfigYaml>(p, "skill.config.yaml")
	)?.doc;

	// load skill.yaml from project (at this point it can be the container filesystem or repo contents)
	const skillYaml = (await getYamlFile<AtomistYaml>(p, "skill.yaml")).doc
		.skill;
	skill = merge(skill, skillYaml, {});

	skill.name = `${skill.name}-${os.userInfo().username}`;
	skill.version = `0.0.1-${dt.DateTime.fromJSDate(new Date()).toFormat(
		"yyyyLLddHHmmss",
	)}`;
	skill.apiVersion = "v2";
	skill.artifacts = {};
	skill.commitSha = "unknown";
	skill.repoId = "unknown";
	await inlineDatalogResources(p, skill);

	info(`Registering skill %s/%s`, skill.namespace, skill.name);

	await gc.mutate(
		`mutation RegisterSkill($skill: AtomistSkillInput!) {
  registerSkill(skill: $skill) {
    name
    namespace
    version
  }
}`,
		{
			skill,
		},
	);

	info(
		`Enabling skill %s/%s in %s`,
		skill.namespace,
		skill.name,
		options.workspace,
	);

	return { skill, skillConfigYaml };
}

export async function skillLocalRun(options: LocalRunOptions): Promise<any> {
	const lock: { locked: boolean; timestamp?: number } = { locked: false };

	if (!options.verbose) {
		process.env.ATOMIST_LOG_LEVEL = "info";
	} else {
		(Pusher as any).logToConsole = true;
	}

	const hubToken = await getHubToken('staging');
	console.log(hubToken);
	return;

	const key = options.apiKey || (await apiKey());
	const wd = options.cwd || process.cwd();
	const gc = createGraphQLClient(key, options.organization);

	const { skill, skillConfigYaml } = await registerSkill(
		wd,
		key,
		options,
		gc,
	);

	await configureSkill(skill, skillConfigYaml, gc);

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
					key,
					options,
					gc,
				);
				await configureSkill(skill, skillConfigYaml, gc);
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
		options.workspace,
	);

	const appKey = options.prod ? APP_KEY_PROD : APP_KEY_STAGING;
	const pusher = new (Pusher as any)(appKey, {
		cluster: "mt1",
		channelAuthorization: {
			endpoint: "https://api.atomist.com/pusher/channel/auth",
			headers: {
				Authorization: `Bearer ${key}`,
			},
		} as any,
	});

	const channel = pusher.subscribe(
		`private-encrypted-${options.workspace.toLowerCase()}_${
			skill.namespace
		}_${skill.name}`,
	);
	channel.bind("scout:execution_trigger", async data => {
		// incoming event
		await handlePusherEvent(data, options.url);
	});
	channel.bind("scout:sync_request", async data => {
		await handlePusherEvent(data, options.url);
	});
	return new Promise<any>(() => {
		// intentionally left empty
	});
}

export interface AtomistYaml {
	skill: any;
}

export const AtomistYamlFileName = "skill.package.yaml";

export async function getYamlFile<D = any>(
	project: Project,
	name: string = AtomistYamlFileName,
	options: { parse: boolean } = {
		parse: true,
	},
): Promise<{ name: string; content: string; doc?: D } | undefined> {
	if (await fs.pathExists(project.path(name))) {
		const content = (await fs.readFile(project.path(name))).toString();
		const doc: any = options.parse ? yaml.load(content) : undefined;
		return {
			name,
			content,
			doc,
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
	const event = parseEDNString(data, {
		mapAs: "object",
		keywordAs: "string",
		listAs: "array",
	}) as any;

	const http = await createHttpClient();
	if (event["compact?"]) {
		const response = await (
			await createHttpClient().get(event.urls.execution, {
				headers: { Authorization: `Bearer ${event.token}` },
			})
		).text();
		data = `${response.slice(0, -1)} :token "${event.token}"}`;
	}

	info(`Incoming subscription: %s`, data);
	try {
		const response = await http.post(url, {
			body: data,
			headers: { "Content-Type": "application/edn" },
		});
		if (response.status !== 201) {
			warn("Issue handling subscription");
		}
	} catch (e) {
		warn("Unhandled issue posting subscription");
	}
}

interface HubCredentials {
	username: string
	password: string
}
const CRED_ADDRESSES = {
	prod: {
		host: 'index.docker.io', // to determine which credential store to use
		index: 'https://index.docker.io/v1/', // to request credentials from the store
		login: 'https://hub.docker.com/v2/users/login', // to auth against
	},
	staging: {
		host: 'registry-1-stage.docker.io',
		index: 'https://registry-1-stage.docker.io/v1/',
		login: 'https://hub-stage.docker.com/v2/users/login',
	}
}
async function getHubToken(env: 'prod' | 'staging'): Promise<string> {
	const {host, index, login} = CRED_ADDRESSES[env];

	// optional envvar overrides
	if (process.env.SKILL_HUB_USER && process.env.SKILL_HUB_PASSWORD) {
		return await loginHub(env, {
			username: process.env.SKILL_HUB_USER,
			password: process.env.SKILL_HUB_PASSWORD,
		});
	}
	
	const { auths, credHelpers, credsStore } = await getHubConfig();
	const directAuth = (auths[host] || auths[index]);
	if (auths && directAuth && directAuth.auth) {
		if (directAuth.auth) {
			const [ username, password ] = Buffer.from(directAuth.auth, 'base64').toString().split(':');
			return await loginHub(login, {username, password});
		}
	} else if (credHelpers && credHelpers[host]) {
		const creds = await getCredentialsFromStore(credHelpers[host], index);
		return await loginHub(login, creds);
	} else if (credsStore) {
		const creds = await getCredentialsFromStore(credsStore, index);
		return await loginHub(login, creds);
	}

	throw new Error(`Failed to find a matching credential store for env ${env}`)
}

async function loginHub(url: string, credentials: HubCredentials): Promise<string> {
	const response = await createHttpClient().post(url, {
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(credentials),
	});
	const body = await response.json();
	if (response.status >= 400) {
		throw new Error(`Hub login to ${url} failed with status code ${response.status}: ${body}`)
	}

	return body.token;
}

async function getHubConfig(): Promise<{
	auths?: {
		[registry: string]: {
			auth?: string // base64 encoded
		}
	}
	credHelpers?: {
		[registry: string]: string
	}
	credsStore?: string
}> {
	const configDir = process.env.DOCKER_CONFIG || path.join(os.homedir(), ".docker")
	const configContents = await fs.readFile(path.join(configDir, "config.json"));
	return JSON.parse(configContents.toString());
}

export async function getCredentialsFromStore(store: string, host: string): Promise<HubCredentials> {
	const execResult = proc.spawnSync(`docker-credential-${store}`, ['get'], { input: host });
	if (execResult.status !== 0) {
		throw new Error(`spawn docker-credential-${store} failed to get credentials for host ${host}`)
	}

	const { Username, Secret } = JSON.parse(execResult.output.join('\n'));
	return { 
		username: Username,
		password: Secret,
	}
}
