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

import * as findUp from "find-up";
import * as fs from "fs-extra";
import { Response } from "node-fetch";
import * as path from "path";

import { debug, warn } from "./log/console";
import { retry } from "./retry";
import { replacer } from "./util";

const GraphQLCache = new Map<string, string>();

export interface Location {
	path: string;
	root: string;
}

export type QueryOrLocation = string | Location;

export interface GraphQLClient {
	query<T = any, V = any>(query: QueryOrLocation, variables?: V): Promise<T>;

	mutate<T = any, V = any>(
		mutation: QueryOrLocation,
		variables?: V,
	): Promise<T>;
}

class NodeFetchGraphQLClient implements GraphQLClient {
	constructor(
		private readonly apiKey: string,
		private readonly url: string,
	) {}

	public async query<T>(
		query: QueryOrLocation,
		variables?: Record<string, any>,
	): Promise<T> {
		const body = JSON.stringify({
			query: await this.graphql(query, "query"),
			variables,
		});
		debug(`GraphQL query: ${body}`);
		const result = await this.fetch(body);
		debug(`GraphQL result: ${JSON.stringify(result, replacer)}`);
		if (result.errors) {
			throw new Error(JSON.stringify(result.errors, undefined, 2));
		}
		return result.data;
	}

	public async mutate<T>(
		mutation: QueryOrLocation,
		variables?: Record<string, any>,
	): Promise<T> {
		const body = JSON.stringify({
			query: await this.graphql(mutation, "mutation"),
			variables,
		});
		debug(`GraphQL mutation: ${body}`);
		const result = await this.fetch(body);
		debug(`GraphQL result: ${JSON.stringify(result, replacer)}`);
		if (result.errors) {
			throw new Error(JSON.stringify(result.errors, undefined, 2));
		}
		return result.data;
	}

	private async graphql(
		query: QueryOrLocation,
		prefix: string,
	): Promise<string> {
		if (typeof query === "string") {
			let q = query?.trim();
			if (GraphQLCache.has(query)) {
				return GraphQLCache.get(query);
			} else if (q.endsWith(".graphql")) {
				q = await findGraphQLFile(q, prefix);
			}
			q = q.replace(/\n/g, "");
			GraphQLCache.set(query, q);
			return q;
		} else {
			const l: Location = query;
			const p = path.resolve(l.root, l.path);
			if (GraphQLCache.has(p)) {
				return GraphQLCache.get(p);
			} else {
				let q = (await fs.readFile(p)).toString();
				q = q.replace(/\n/g, "");
				GraphQLCache.set(p, q);
				return q;
			}
		}
	}

	private async fetch(body: string) {
		const f = (await import("node-fetch")).default;
		const result = await (
			await retry<Response>(async () => {
				try {
					return await f(this.url, {
						method: "post",
						body,
						headers: {
							"authorization": `bearer ${this.apiKey}`,
							"content-type": "application/json",
						},
					});
				} catch (e) {
					// Retry DNS issues
					if (
						e.message?.includes("EAI_AGAIN") &&
						e.message?.includes("getaddrinfo")
					) {
						warn(
							"Retrying GraphQL operation due to DNS lookup failure",
						);
						throw e;
					} else {
						throw new (await import("p-retry")).AbortError(e);
					}
				}
			})
		).json();
		return result;
	}
}

export function createGraphQLClient(
	apiKey: string,
	wid: string,
	endpoint: string = process.env.ATOMIST_GRAPHQL_ENDPOINT ||
		"https://automation.atomist.com/graphql",
): GraphQLClient {
	const url = `${endpoint}/team/${wid}`;
	return new NodeFetchGraphQLClient(apiKey, url);
}

export async function findGraphQLFile(
	q: string,
	prefix: string,
): Promise<string> {
	const trace = await import("stack-trace");
	const stack = trace.get();
	const callSite = stack
		.filter(s => !!s.getFileName())
		.find(
			s =>
				!s.getFileName().includes("node_modules/@atomist/skill") &&
				s.getFileName().startsWith("/"),
		);

	if (callSite) {
		// This only works for Node.js > 12
		let cwd = path.dirname(callSite.getFileName());
		while (cwd) {
			const p = await findUp("graphql", {
				cwd,
				type: "directory",
			});
			if (!p) {
				throw new Error(`No 'graphql' found up from '${cwd}'`);
			}
			const gp = path.join(p, prefix, q);
			if (await fs.pathExists(gp)) {
				return (await fs.readFile(gp)).toString();
			} else {
				cwd = cwd.split(path.sep).slice(0, -1).join(path.sep);
			}
		}
	} else {
		const cwd = path.join(process.cwd(), "graphql");
		const gp = path.join(cwd, prefix, q);
		if (await fs.pathExists(gp)) {
			return (await fs.readFile(gp)).toString();
		}
	}
	throw new Error(`GraphQL file not found '${prefix}/${q}'`);
}
