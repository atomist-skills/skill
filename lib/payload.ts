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
export function isEventIncoming(event: any): event is EventIncoming {
	return (
		event.type === "subscription" ||
		event.type === "webhook" ||
		event.type === "sync-request" ||
		event.type === "validation"
	);
}

export function eventName(event: EventIncoming): string {
	return (
		event.context.subscription?.name ||
		event.context.webhook?.name ||
		event.context["sync-request"]?.name ||
		(event.type === "validation" ? "validation" : undefined)
	);
}

export interface Skill<C = any> {
	id: string;
	name: string;
	namespace: string;
	version: string;
	configuration?: C;
}

export interface Configuration {
	capabilities: Array<{
		providers: Array<{
			"namespace": string;
			"name": string;
			"configuration-name": string;
		}>;
		spec: {
			namespace: string;
			name: string;
		};
	}>;
	name: string;
	parameters: Array<{ name: string; value: any }>;
}

export interface EventIncoming<E = any, C = any> {
	"execution-id": string;
	"skill": Skill<C>;
	"type": string;
	"workspace-id": string;
	"context": {
		"subscription"?: {
			name: string;
			configuration: Configuration;
			result: E[];
			metadata: {
				"tx": number;
				"after-basis-t": number;
				"schedule-name": string;
			};
		};
		"webhook"?: {
			name: string;
			configuration: Configuration;
			request: {
				url: string;
				body: string;
				headers: Record<string, string>;
				tags: Array<{ name: string; value: string }>;
			};
		};
		"sync-request"?: {
			name: string;
			configuration: Configuration;
			metadata: Record<string, any>;
		};
		"validation"?: {
			"configuration": Configuration;
			"existing-configuration": Configuration;
		};
	};
	"compact?"?: boolean;
	"organization"?: string;
	"urls": {
		execution: string;
		transactions: string;
		logs: string;
		query: string;
		graphql?: string;
		trigger?: string;
		entitlements?: string;
		manifests?: string;
	};
	"token": string;
}
