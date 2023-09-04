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

import { Response } from "node-fetch";

import { HttpClient } from "../http";
import { debug, warn } from "../log/console";
import { mapSubscription } from "../map";
import { EventIncoming, eventName } from "../payload";
import { retry } from "../retry";
import { hash, toArray } from "../util";
import { createTransact, DatalogTransact } from "./transact";
import map = require("lodash.map");

const StatusCodesToRetry = [429, 503, 504];

export interface DatalogClient {
	/** Additional facts to be transacted on matching entities */
	facts: Record<string, Record<string, string>>;

	/** Transact provided entities */
	transact(
		entities: any | any[],
		options?: { ordering: boolean },
	): Promise<void>;

	/** Query datalog */
	query<T = any, P = any>(
		query: string | Record<string, string>,
		parameters?: P,
		options?: {
			configurationName?: string;
			tx?: number;
			mode?: "raw" | "map" | "obj";
			rules?: string;
		},
	): Promise<T[] | string>;

	/** Query datalog */
	retract(query: string): Promise<void>;
}

class NodeFetchDatalogClient implements DatalogClient {
	constructor(
		private readonly payload: EventIncoming,
		private readonly http: HttpClient,
	) {}

	private transactInstance: DatalogTransact;

	public facts = {};

	public cache = new Map<string, any>();

	public async transact(
		entities: any,
		options: { ordering: boolean } = { ordering: true },
	): Promise<void> {
		if (!this.transactInstance) {
			this.transactInstance = createTransact(this.payload, this.http);
		}
		return this.transactInstance(entities, options);
	}

	public async query<T = any, P = any>(
		query: string | Record<string, string>,
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
		if (this.payload.context.subscription?.metadata?.["after-basis-t"]) {
			options = {
				...(options || {}),
				tx:
					options?.tx ||
					this.payload.context.subscription?.metadata?.[
						"after-basis-t"
					],
				configurationName:
					options?.configurationName || eventName(this.payload),
			};
		}

		let body;
		if (typeof query === "string") {
			body = prepareQueryBody(query, parameters, options, this.payload);
		} else {
			const queries = map(query, (v, k) =>
				prepareQueryBody(v, parameters, options, this.payload, k),
			);
			body = `{
:queries [
${queries.join("\n\n")}
]}`;
		}

		debug(`Datalog query: ${body}`);

		let result;

		const cacheKey = hash(body);
		if (this.cache.has(cacheKey)) {
			result = this.cache.get(cacheKey);
			debug(`Datalog cached result: ${result}`);
		} else {
			const f = (await import("node-fetch")).default;
			result = await (
				await retry<Response>(async () => {
					try {
						const response = await f(this.payload.urls.query, {
							method: "post",
							body,
							headers: {
								"authorization": `bearer ${this.payload.token}`,
								"content-type": "application/edn",
								"x-atomist-correlation-id":
									this.payload["execution-id"],
							},
						});
						if (response.status !== 200) {
							warn(
								`Datalog query failed with: ${response.statusText}`,
							);
							throw new ResponseError(response);
						}
						return response;
					} catch (e) {
						if (
							e instanceof ResponseError &&
							StatusCodesToRetry.includes(e.status())
						) {
							warn(
								`Retrying Datalog query due to ${e.status()} error`,
							);
							throw e;
						} else if (
							e.message?.includes("EAI_AGAIN") &&
							e.message?.includes("getaddrinfo")
						) {
							warn("Retrying Datalog query due to DNS failure");
							throw e;
						}
						throw new (await import("p-retry")).AbortError(e);
					}
				})
			).text();
			this.cache.set(cacheKey, result);
			debug(`Datalog result: ${result}`);
		}

		if (options.mode === "raw") {
			return result;
		} else {
			const parsed = (await import("edn-data")).parseEDNString(result, {
				mapAs: "object",
				keywordAs: "string",
			});
			if (typeof query !== "string") {
				return toArray(parsed) as any;
			}
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

	public async retract(query: string): Promise<void> {
		const body = `{ :retract {:entities-by-query ${query} } }`;

		debug(`Datalog query: ${body}`);

		const f = (await import("node-fetch")).default;
		const result = await (
			await retry<Response>(async () => {
				try {
					const response = await f(this.payload.urls.query, {
						method: "post",
						body,
						headers: {
							"authorization": `bearer ${this.payload.token}`,
							"content-type": "application/edn",
							"x-atomist-correlation-id":
								this.payload["execution-id"],
						},
					});
					if (response.status !== 200) {
						warn(
							`Datalog retract failed with: ${response.statusText}`,
						);
						throw new ResponseError(response);
					}
					return response;
				} catch (e) {
					if (
						e instanceof ResponseError &&
						StatusCodesToRetry.includes(e.status())
					) {
						warn(
							`Retrying Datalog retract due to ${e.status()} error`,
						);
						throw e;
					} else if (
						e.message?.includes("EAI_AGAIN") &&
						e.message?.includes("getaddrinfo")
					) {
						warn("Retrying Datalog retract due to DNS failure");
						throw e;
					}
					throw new (await import("p-retry")).AbortError(e);
				}
			})
		).text();
		debug(`Datalog result: ${result}`);
	}
}

export function createDatalogClient(
	payload: EventIncoming,
	http: HttpClient,
): DatalogClient {
	// In case the datalog endpoint is passed we also need to set the workspace id
	return new NodeFetchDatalogClient(payload, http);
}

export function prepareQueryBody<P>(
	query: string,
	parameters: P,
	options: {
		configurationName?: string;
		tx?: number;
		mode?: "raw" | "map" | "obj";
		rules?: string;
		paging?: { limit: number; offset: number };
	},
	payload: EventIncoming,
	name?: string,
): string {
	const argsAndQuery = prepareArgs(query, parameters);

	const bodyParts = [];
	if (name) {
		bodyParts.push(`:name :${name}`);
	}
	bodyParts.push(`:query ${argsAndQuery.query}`);
	if (argsAndQuery.args?.length > 0) {
		bodyParts.push(`:args [${argsAndQuery.args}]`);
	}
	if (options?.tx) {
		bodyParts.push(`:tx-range {:start ${options.tx} }`);
	}
	if (options?.configurationName) {
		bodyParts.push(
			`:skill-ref {:name "${payload.skill.name}" :namespace "${payload.skill.namespace}" :configuration-name "${options.configurationName}"}`,
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
	return body;
}

export function prepareArgs(
	query: string,
	parameters: any = {},
): { query: string; args: string } {
	const args = [];
	const names = [];
	for (const key of Object.keys(parameters)) {
		const value = parameters[key];
		if (value !== undefined) {
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
		.join(`${match[1]}${!match[1].includes("?ctx") ? "?ctx " : ""}?args\n`);
	const splitByWhere = newQuery.split(":where");
	const finalQuery = `${splitByWhere[0]}:where\n ${untuple}${splitByWhere
		.slice(1)
		.join(":where")}`;
	return {
		query: finalQuery,
		args: args.join(" "),
	};
}

class ResponseError extends Error {
	constructor(private readonly response: Response) {
		super();
	}

	public status(): number {
		return this.response.status;
	}
}
