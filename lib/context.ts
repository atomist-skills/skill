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

import { createDatalogClient } from "./datalog/client";
import { createGraphQLClient } from "./graphql";
import {
	CommandContext,
	Configuration,
	ContextClosable,
	Contextual,
	ContextualLifecycle,
	DefaultPriority,
	EventContext,
	WebhookContext,
} from "./handler/handler";
import { createHttpClient } from "./http";
import { debug } from "./log/console";
import { initLogging, logPayload, runtime } from "./log/util";
import {
	PubSubCommandMessageClient,
	PubSubEventMessageClient,
	PubSubWebhookMessageClient,
} from "./message";
import {
	CommandIncoming,
	EventIncoming,
	isCommandIncoming,
	isEventIncoming,
	isSubscriptionIncoming,
	isWebhookIncoming,
	SkillConfiguration,
	SubscriptionIncoming,
	WebhookIncoming,
	workspaceId,
} from "./payload";
import { createProjectLoader } from "./project/loader";
import { commandRequestParameterPromptFactory } from "./prompt/prompt";
import { DefaultCredentialProvider } from "./secret/provider";
import { createStorageProvider } from "./storage/provider";
import { extractParameters, handleError, toArray } from "./util";
import camelCase = require("lodash.camelcase");
import sortBy = require("lodash.sortby");
export type ContextFactory = (
	payload:
		| CommandIncoming
		| EventIncoming
		| WebhookIncoming
		| SubscriptionIncoming,
	ctx: { eventId: string },
) =>
	| ((CommandContext | EventContext | WebhookContext) & ContextualLifecycle)
	| undefined;

export function loggingCreateContext(
	delegate: ContextFactory,
	options: {
		payload: boolean;
		before?: (ctx: Contextual<any, any>) => void;
		after?: ContextClosable;
		traceId?: string;
	} = { payload: true },
): ContextFactory {
	return (payload, ctx) => {
		const context = delegate(payload, ctx);
		if (context) {
			initLogging(
				{
					skillId: payload.skill.id,
					eventId: ctx.eventId,
					correlationId: context.correlationId,
					workspaceId: context.workspaceId,
					traceId: options?.traceId,
				},
				context.onComplete,
				{
					name: context.name,
					skill_namespace: payload.skill.namespace,
					skill_name: payload.skill.name,
					skill_version: payload.skill.version,
				},
			);
			options?.before?.(context);
			if (options?.after) {
				context.onComplete(options.after);
			}

			const rt = runtime();
			debug(
				"Starting %s/%s:%s '%s' %satomist/skill:%s (%s) nodejs:%s '%s'",
				payload.skill.namespace,
				payload.skill.name,
				payload.skill.version,
				context.name,
				rt.host?.sha ? `(${rt.host.sha.slice(0, 7)}) ` : "",
				rt.skill.version,
				rt.skill.sha.slice(0, 7),
				rt.node.version,
				rt.uptime,
			);
			if (options?.payload) {
				logPayload(context);
			}
		}
		return context;
	};
}

export function createContext(
	payload:
		| CommandIncoming
		| EventIncoming
		| WebhookIncoming
		| SubscriptionIncoming,
	ctx: { eventId: string },
):
	| ((CommandContext | EventContext | WebhookContext) & ContextualLifecycle)
	| undefined {
	const apiKey = payload?.secrets?.find(
		s => s.uri === "atomist://api-key",
	)?.value;
	const wid = workspaceId(payload);
	const graphql = createGraphQLClient(apiKey, wid);
	const storage = createStorageProvider(wid);
	const http = createHttpClient();
	const credential = new DefaultCredentialProvider(apiKey, graphql, payload);
	const completeCallbacks: ContextClosable[] = [];
	const onComplete = (closable: ContextClosable) => {
		if (closable.priority === undefined) {
			closable.priority = DefaultPriority;
		}
		completeCallbacks.push(closable);
	};
	const close = async () => {
		const prioritizedClosables = sortBy(completeCallbacks, [
			"priority",
		]).reverse();
		let closable = prioritizedClosables.pop();
		while (closable) {
			if (closable.name) {
				debug(`Closing '${closable.name}'`);
			}
			await handleError(closable.callback);
			closable = prioritizedClosables.pop();
		}
	};

	let context;
	if (isCommandIncoming(payload)) {
		if (payload.raw_message) {
			const parameters = extractParameters(payload.raw_message);
			payload.parameters.push(...parameters);
		}
		const message = new PubSubCommandMessageClient(payload, {
			graphql,
			onComplete,
			correlationId: payload.correlation_id,
			workspaceId: wid,
		});
		context = {
			parameters: {
				prompt: commandRequestParameterPromptFactory(message, payload),
			},
			name: payload.command,
			correlationId: payload.correlation_id,
			executionId: ctx.eventId,
			workspaceId: wid,
			credential,
			graphql,
			http,
			storage,
			message,
			datalog: createDatalogClient(apiKey, {
				workspaceId: wid,
				correlationId: payload.correlation_id,
				skill: payload.skill,
				onComplete,
				trigger: payload,
				message,
				credential,
				http,
			}),
			project: createProjectLoader({ onComplete }),
			trigger: payload,
			...extractConfiguration(payload),
			skill: payload.skill,
			close,
			onComplete,
		};
	} else if (isEventIncoming(payload)) {
		const message = new PubSubEventMessageClient(
			payload,
			payload.extensions.team_name,
			payload.extensions.operationName,
			{
				onComplete,
				graphql,
				correlationId: payload.extensions.correlation_id,
				workspaceId: payload.extensions.team_id,
			},
		);
		context = {
			data: payload.data,
			name: payload.extensions.operationName,
			correlationId: payload.extensions.correlation_id,
			executionId: ctx.eventId,
			workspaceId: wid,
			credential,
			graphql,
			http,
			storage,
			message,
			datalog: createDatalogClient(apiKey, {
				workspaceId: wid,
				correlationId: payload.extensions.correlation_id,
				skill: payload.skill,
				onComplete,
				trigger: payload,
				message,
				credential,
				http,
			}),
			project: createProjectLoader({ onComplete }),
			trigger: payload,
			configuration: extractConfiguration(payload)?.configuration?.[0],
			skill: payload.skill,
			close,
			onComplete,
		};
	} else if (isSubscriptionIncoming(payload)) {
		const message = new PubSubEventMessageClient(
			payload,
			payload.team_id,
			payload.subscription?.name,
			{
				onComplete,
				graphql,
				correlationId: payload.correlation_id,
				workspaceId: payload.team_id,
			},
		);
		context = {
			data: toArray(payload.subscription?.result),
			name: payload.subscription?.name,
			correlationId: payload.correlation_id,
			executionId: ctx.eventId,
			workspaceId: wid,
			credential,
			graphql,
			http,
			storage,
			message,
			datalog: createDatalogClient(apiKey, {
				workspaceId: wid,
				correlationId: payload.correlation_id,
				skill: payload.skill,
				onComplete,
				trigger: payload,
				message,
				credential,
				http,
			}),
			project: createProjectLoader({ onComplete }),
			trigger: payload,
			configuration: extractConfiguration(payload)?.configuration?.[0],
			skill: payload.skill,
			close,
			onComplete,
		};
	} else if (isWebhookIncoming(payload)) {
		const message = new PubSubWebhookMessageClient(payload, {
			onComplete,
			graphql,
			correlationId: payload.correlation_id,
			workspaceId: payload.team_id,
		});
		context = {
			name: payload.webhook.parameter_name || "default",
			body: payload.webhook.body,
			get json() {
				return JSON.parse((payload as any).webhook.body);
			},
			headers: payload.webhook.headers,
			url: payload.webhook.url,
			correlationId: payload.correlation_id,
			executionId: ctx.eventId,
			workspaceId: wid,
			credential,
			graphql,
			http,
			storage,
			message,
			datalog: createDatalogClient(apiKey, {
				workspaceId: wid,
				correlationId: payload.correlation_id,
				skill: payload.skill,
				onComplete,
				trigger: payload,
				message,
				credential,
				http,
			}),
			project: createProjectLoader(),
			trigger: payload,
			configuration: extractConfiguration(payload)?.configuration?.[0],
			skill: payload.skill,
			close,
			onComplete,
		};
	}
	return context;
}

export function extractConfiguration(
	payload:
		| CommandIncoming
		| EventIncoming
		| WebhookIncoming
		| SubscriptionIncoming,
): { configuration: Array<Configuration<any>> } {
	const cfgs: SkillConfiguration[] = [];
	if ((payload.skill?.configuration as any)?.instances) {
		cfgs.push(...(payload.skill.configuration as any).instances);
	} else if (payload.skill?.configuration) {
		cfgs.push(payload.skill.configuration as SkillConfiguration);
	}
	return {
		configuration: cfgs.map(c => ({
			name: c.name,
			parameters: extractConfigurationParameters(c.parameters),
			resourceProviders: extractConfigurationResourceProviders(
				c.resourceProviders,
			),
			url: `https://go.atomist.com/${workspaceId(
				payload,
			)}/manage/skills/configure/edit/${payload.skill.namespace}/${
				payload.skill.name
			}/${encodeURIComponent(c.name)}`,
		})),
	};
}

function extractConfigurationParameters(
	params: Array<{ name: string; value: any }>,
): Record<string, any> {
	let nested = false;
	const parameters = {};
	params?.forEach(p => {
		if (p.name.startsWith("atomist://")) {
			const rec = parameters["atomist"] || {};
			rec[camelCase(p.name.split("://")[1])] = p.value;
			parameters["atomist"] = rec;
		} else if (p.name === "dockerhub_global_read_username") {
			parameters["dockerhub.global-username"] = p.value;
		} else if (p.name === "dockerhub_global_read_api_key") {
			parameters["dockerhub.global-api-key"] = p.value;
		} else {
			parameters[p.name] = p.value;
		}
		if (p.name.includes(".")) {
			nested = true;
		}
	});
	if (nested) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const dot = require("dot-object");
		return dot.object(parameters);
	} else {
		return parameters;
	}
}

function extractConfigurationResourceProviders(
	params: Array<{
		name: string;
		typeName: string;
		selectedResourceProviders: Array<{ id: string }>;
	}>,
): Configuration<any>["resourceProviders"] {
	const resourceProviders = {};
	params?.forEach(
		p =>
			(resourceProviders[p.name] = {
				typeName: p.typeName,
				selectedResourceProviders: p.selectedResourceProviders,
			}),
	);
	return resourceProviders;
}
