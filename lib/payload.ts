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
	return event.type === "subscription" || event.type === "webhook";
}

export interface Skill<C = any> {
	id: string;
	name: string;
	namespace: string;
	version: string;
	configuration?: C;
}

export interface EventIncoming<E = any, C = any> {
	"execution-id": string;
	"skill": Skill<C>;
	"type": string;
	"workspace-id": string;
	"context": {
		subscription?: {
			"name": string;
			"configuration": {
				name: string;
				parameters: Array<{ name: string; value: any }>;
			};
			"tx": number;
			"after-basis-t": number;
			"result": E;
		};
		webhook?: {
			"name": string;
			"configuration-name": string;
			"url": string;
			"body": string;
			"headers": Record<string, string>;
			"tags": Array<{ name: string; value: string }>;
		};
	};
	"urls": {
		execution: string;
		transactions: string;
		logs: string;
		query: string;
	};
	"token": string;
}
