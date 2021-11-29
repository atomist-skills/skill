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
import { SkillConfiguration, SubscriptionIncoming } from "../payload";
import { retry } from "../retry";
import { isStaging, toArray } from "../util";
import { createTransact, DatalogTransact } from "./transact";

export interface DatalogClient {
	transact(
		entities: any | any[],
		options?: { ordering: boolean },
	): Promise<void>;
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
		private readonly ctx: Pick<
			Contextual<any, any>,
			| "onComplete"
			| "workspaceId"
			| "correlationId"
			| "skill"
			| "trigger"
			| "message"
		>,
	) {}

	private transactInstance: DatalogTransact;

	public async transact(
		entities: any,
		options: { ordering: boolean } = { ordering: true },
	): Promise<void> {
		if (!this.transactInstance) {
			this.transactInstance = createTransact(this.ctx);
		}
		return this.transactInstance(entities, options);
	}

	public async query<T = any, P = any>(
		query: string,
		parameters: P,
		options: {
			configurationName?: string;
			tx?: number;
			mode?: "raw" | "map" | "obj";
			rules?: string;
			paging?: {
				limit: number;
				offset: number;
			};
		} = {},
	): Promise<T[] | string> {
		if (
			(this.ctx.trigger as SubscriptionIncoming)?.subscription?.[
				"after-basis-t"
			]
		) {
			options = {
				...(options || {}),
				tx:
					options?.tx ||
					(this.ctx.trigger as SubscriptionIncoming).subscription[
						"after-basis-t"
					],
				configurationName:
					options?.configurationName ||
					(
						(this.ctx.trigger as SubscriptionIncoming).skill
							.configuration as SkillConfiguration
					).name,
			};
		}
		const argsAndQuery = prepareArgs(query, parameters);

		const bodyParts = [`:query ${argsAndQuery.query}`];
		if (argsAndQuery.args?.length > 0) {
			bodyParts.push(`:args [${argsAndQuery.args}]`);
		}
		if (options?.tx) {
			bodyParts.push(`:tx-range {:start ${options.tx} }`);
		}
		if (options?.configurationName) {
			bodyParts.push(
				`:skill-ref {:name "${this.ctx.skill.name}" :namespace "${this.ctx.skill.namespace}" :configuration-name "${options.configurationName}"}`,
			);
		}
		if (options?.rules) {
			bodyParts.push(`:rules ${options.rules}`);
		}
		if (options?.paging) {
			bodyParts.push(
				`:limit ${options.paging.limit} :offset ${options.paging.offset}`,
			);
		}
		const body = `{
${bodyParts.join("\n\n")}
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
	ctx: Pick<
		Contextual<any, any>,
		| "onComplete"
		| "workspaceId"
		| "correlationId"
		| "skill"
		| "trigger"
		| "message"
	>,
	endpoint: string = process.env.ATOMIST_DATALOG_ENDPOINT ||
		(isStaging()
			? "https://api-staging.atomist.services/datalog"
			: "https://api.atomist.com/datalog"),
): DatalogClient {
	const url = `${endpoint}/team/${ctx.workspaceId}`;
	return new NodeFetchDatalogClient(apiKey, url, ctx);
}

export function prepareArgs(
	query: string,
	parameters: any = {},
): { query: string; args: string } {
	const args = [];
	const names = [];
	for (const key of Object.keys(parameters)) {
		const value = parameters[key];
		let escapedValue;
		const escape = (v: string) =>
			typeof v === "string" ? (v.startsWith(":") ? v : `"${v}"`) : v;
		if (Array.isArray(value)) {
			escapedValue = `[${value.map(escape).join(" ")}]`;
		} else {
			escapedValue = escape(value);
		}
		args.push(escapedValue);
		names.push(key);
	}
	if (args.length === 0) {
		return {
			query,
			args: "",
		};
	}
	const untuple = `[(untuple ?args) [${names.map(n => `?${n}`).join(" ")}]]`;
	const inRegExp = /(:in[\s\S]*?)(?::where|:with)/m;
	const match = inRegExp.exec(query);
	const newQuery = query
		.split(match[1])
		.join(`${match[1]}${!match[1].includes("?ctx") ? "?ctx " : ""}?args\n`)
		.split(":where")
		.join(`:where\n ${untuple}`);
	return {
		query: newQuery,
		args: args.join(" "),
	};
}
