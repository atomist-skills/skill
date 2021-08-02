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

import { Response } from "node-fetch";

import { Contextual } from "../handler/handler";
import { debug, warn } from "../log/console";
import { mapSubscription } from "../map";
import { Skill } from "../payload";
import { retry } from "../retry";
import { isStaging, toArray } from "../util";
import { createTransact } from "./transact";

export interface DatalogClient {
	transact(entities: any | any[]): Promise<void>;
	query<T = any, P = any>(
		query: string,
		parameters?: P,
		options?: {
			configurationName?: string;
			tx?: number;
			mode?: "raw" | "map" | "obj";
			rules?: string;
		},
	): Promise<T[] | string>;
}

class NodeFetchDatalogClient implements DatalogClient {
	constructor(
		private readonly apiKey: string,
		private readonly url: string,
		private readonly workspaceId: string,
		private readonly correlationId: string,
		private readonly skill: Skill,
		private readonly ctx?: Pick<Contextual<any, any>, "onComplete">,
	) {}

	public async transact(entities: any): Promise<void> {
		return createTransact(
			this.workspaceId,
			this.correlationId,
			this.skill.id,
			this.ctx,
		)(entities);
	}

	public async query<T = any, P = any>(
		query: string,
		parameters: P,
		options: {
			configurationName?: string;
			tx?: number;
			mode?: "raw" | "map" | "obj";
			rules?: string;
		} = {},
	): Promise<T[] | string> {
		const body = `{
:query

	${resolveParameters(query, parameters)}

${options?.tx ? `:tx-range {:start ${options.tx} }` : ""}
${
	options?.configurationName
		? `:skill-ref {:name "${this.skill.name}" :namespace "${this.skill.namespace}" :configuration-name "${options.configurationName}"}`
		: ""
}
${options?.rules ? `:rules ${options.rules}` : ""}
 
}`;
		debug(`Datalog query: ${body}`);

		const f = (await import("node-fetch")).default;
		const result = await (
			await retry<Response>(async () => {
				try {
					return await f(this.url, {
						method: "post",
						body,
						headers: {
							"authorization": `bearer ${this.apiKey}`,
							"content-type": "application/edn",
						},
					});
				} catch (e) {
					// Retry DNS issues
					if (
						e.message?.includes("EAI_AGAIN") &&
						e.message?.includes("getaddrinfo")
					) {
						warn(
							"Retrying Datalog operation due to DNS lookup failure",
						);
						throw e;
					} else {
						throw new (await import("p-retry")).AbortError(e);
					}
				}
			})
		).text();

		debug(`Datalog result: ${result}`);

		if (options.mode === "raw") {
			return result;
		} else {
			const parsed = (await import("edn-data")).parseEDNString(result, {
				mapAs: "object",
				keywordAs: "string",
			});
			if (options.mode === "obj") {
				return toArray(parsed[0]) as any;
			}
			if (options.tx) {
				return toArray(parsed[0].result).map(mapSubscription);
			} else {
				return toArray(parsed).map(mapSubscription);
			}
		}
	}
}

export function createDatalogClient(
	apiKey: string,
	wid: string,
	correlationId: string,
	skill: Skill,
	ctx: Pick<Contextual<any, any>, "onComplete">,
	endpoint: string = process.env.ATOMIST_DATALOG_ENDPOINT ||
		(isStaging()
			? "https://api-staging.atomist.services/datalog"
			: "https://api.atomist.com/datalog"),
): DatalogClient {
	const url = `${endpoint}/team/${wid}`;
	return new NodeFetchDatalogClient(apiKey, url, wid, correlationId, skill);
}

export function resolveParameters(query: string, parameters: any = {}): string {
	let newQuery = query;
	for (const key of Object.keys(parameters)) {
		const value = parameters[key];
		newQuery = newQuery.replace(
			new RegExp(`\\?${key}`, "g"),
			typeof value === "string"
				? value.startsWith(":")
					? value
					: `"${value}"`
				: value,
		);
	}
	return newQuery;
}
