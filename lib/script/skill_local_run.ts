import { parseEDNString } from "edn-data";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import * as dt from "luxon";
import * as os from "os";
import * as path from "path";
import * as Pusher from "pusher-js";

import { createGraphQLClient } from "../graphql";
import { createHttpClient } from "../http";
import { info, warn } from "../log";
import { Project, withGlobMatches } from "../project";
import { createProjectLoader } from "../project/loader";
import { defaults } from "./skill_container";
import { AtomistSkillInput } from "./skill_input";
import { apiKey } from "./skill_register";

import merge = require("lodash.merge");

export async function skillLocalRun(options: {
	workspace: string;
	apiKey: string;
	cwd: string;
	url: string;
	verbose?: boolean;
}): Promise<any> {
	if (!options.verbose) {
		process.env.ATOMIST_LOG_LEVEL = "info";
	} else {
		(Pusher as any).logToConsole = true;
	}

	const key = options.apiKey || (await apiKey());
	const wd = options.cwd || process.cwd();

	let skill: any = await defaults(wd);

	const p = await createProjectLoader().load({} as any, wd);

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

	const parameterValues = skill.parameterValues;
	delete skill.parameterValues;

	// eslint-disable-next-line deprecation/deprecation
	const gc = createGraphQLClient(key, options.workspace);
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
  }@${os.hostname()}", name: "local_configured_skill", enabled: true, parameters: $parameters ${
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
			parameters: parameterValues,
			id,
		},
	);

	const url =
		configuredSkill?.saveSkillConfiguration?.configured?.skills?.[0]
			?.configuration.instances?.[0]?.parameters?.[0]?.value?.[0]?.url;
	info(`Webhook url %s`, url);

	info(
		`Listening for subscriptions %s/%s %s`,
		skill.namespace,
		skill.name,
		options.workspace,
	);

	const pusher = new (Pusher as any)("e7f313cb5f6445399f58", {
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
	channel.bind("execution-trigger", async data => {
		// incoming event
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
		data = `${data.slice(0, -1)} ${response.slice(1)}`;
	}

	info(`Incoming subscription: %s`, data);
	try {
		const response = await http.post(url, { body: data });
		if (response.status !== 201) {
			warn("Issue handling subscription");
		}
	} catch (e) {
		warn("Unhandled issue posting subscription");
	}
}
