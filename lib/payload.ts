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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isCommandIncoming(event: any): event is CommandIncoming {
	return !!event.command;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isEventIncoming(event: any): event is EventIncoming {
	return !!event.data;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isWebhookIncoming(event: any): event is WebhookIncoming {
	return !!event.webhook;
}

export function isSubscriptionIncoming(
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	event: any,
): event is SubscriptionIncoming {
	return !!event.subscription && !event.data;
}

export function workspaceId(
	event:
		| CommandIncoming
		| EventIncoming
		| WebhookIncoming
		| SubscriptionIncoming,
): string | undefined {
	if (isCommandIncoming(event)) {
		return event.team.id;
	} else if (isEventIncoming(event)) {
		return event.extensions.team_id;
	} else if (isWebhookIncoming(event) || isSubscriptionIncoming(event)) {
		return event.team_id;
	}
	return undefined;
}

export interface SkillConfiguration {
	name: string;
	parameters: Array<{ name: string; value: any }>;
	resourceProviders: Array<{
		name: string;
		typeName: string;
		selectedResourceProviders: Array<{ id: string }>;
	}>;
}

/**
 * Extension to EventIncoming and CommandIncoming capturing
 * skill specific information
 */
export interface Skill {
	id: string;
	name: string;
	namespace: string;
	version: string;

	artifacts: Array<{
		name: string;
		image: string;
		command?: string[];
		args?: string[];
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
	}>;

	configuration:
		| {
				instances: SkillConfiguration[];
		  }
		| SkillConfiguration;
}

export interface SubscriptionIncoming {
	correlation_id: string;
	type: string;
	team_id: string;
	skill: Skill;
	secrets: Secret[];
	subscription: {
		"name": string;
		"result": any;
		"tx": number;
		"after-basis-t": number;
	};
}

export interface WebhookIncoming {
	correlation_id: string;
	type: string;
	team_id: string;
	skill: Skill;
	secrets: Secret[];
	webhook: {
		parameter_name: string;
		parameter_name_value: string;
		url: string;
		headers: Record<string, string>;
		body: string;
	};
}

export interface EventIncoming {
	data: any;
	extensions: Extensions;
	secrets: Secret[];
	skill: Skill;
}

export interface Extensions {
	team_id: string;
	team_name?: string;
	operationName: string;
	correlation_id: string;
}

export interface CommandIncoming {
	api_version?: string;
	correlation_id: string;
	command: string;
	team: Team;
	source: Source;
	parameters: Arg[];
	secrets: Secret[];
	raw_message: string;
	skill: Skill;
}

export interface Source {
	user_agent: "slack" | "web";
	slack?: {
		team: {
			id: string;
			name?: string;
		};
		channel?: {
			id: string;
			name?: string;
		};
		user?: {
			id: string;
			name?: string;
		};
		thread_ts?: string;
	};
	web?: {
		identity: {
			sub: string;
			pid: string;
		};
	};
	identity?: any;
}

export interface Team {
	id: string;
	name?: string;
}

export interface Arg {
	name: string;
	value: string;
}

export interface Secret {
	uri: string;
	value: string;
}
