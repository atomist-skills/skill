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

import { parseEDNString } from "edn-data";
import { Response } from "node-fetch";
import * as pRetry from "p-retry";

import { warn } from "../log/console";
import { mapSubscription } from "../map";
import { Skill } from "../payload";
import { retry } from "../retry";
import { toArray } from "../util";
import { createTransact } from "./transact";

export interface DatalogClient {
	transact(entities: any | any[]): Promise<void>;
	query<T>(
		query: string,
		options?: { configurationName?: string },
	): Promise<T[]>;
}

class NodeFetchDatalogClient implements DatalogClient {
	constructor(
		private readonly apiKey: string,
		private readonly url: string,
		private readonly workspaceId: string,
		private readonly correlationId: string,
		private readonly skill: Skill,
	) {}

	public async transact(entities: any): Promise<void> {
		return createTransact(
			this.workspaceId,
			this.correlationId,
			this.skill.id,
		)(entities);
	}

	public async query<T>(
		query: string,
		options?: { configurationName: string },
	): Promise<T[]> {
		const body = `{
:query

	${query}

${
	options?.configurationName
		? `:skill-ref {:name "${this.skill.name}" :namespace "${this.skill.namespace}" :configuration-name "${options.configurationName}"}`
		: ""
}
 
}`;
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
						throw new pRetry.AbortError(e);
					}
				}
			})
		).text();
		const parsed = parseEDNString(result, {
			mapAs: "object",
			keywordAs: "string",
		});
		return toArray(parsed).map(mapSubscription);
	}
}

export function createDatalogClient(
	apiKey: string,
	wid: string,
	correlationId: string,
	skill: Skill,
	endpoint: string = process.env.ATOMIST_DATALOG_ENDPOINT ||
		"https://api.atomist.com/datalog",
): DatalogClient {
	const url = `${endpoint}/team/${wid}`;
	return new NodeFetchDatalogClient(apiKey, url, wid, correlationId, skill);
}