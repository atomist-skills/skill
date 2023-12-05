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

import { HttpClient } from "../http";
import { debug, error } from "../log/console";
import { EventIncoming } from "../payload";
import { toArray } from "../util";

export type DatalogTransact = (
	entities: any | any[],
	options?: { ordering: boolean },
) => Promise<void>;

export function createTransact(
	payload: EventIncoming,
	http: HttpClient,
): DatalogTransact {
	return async (entities, options = { ordering: true }) => {
		const invalidEntities = toArray(entities).filter(e =>
			Object.values(e).some(v => v === undefined),
		);
		if (invalidEntities.length > 0) {
			debug(
				`Entities with 'undefined' properties detected: ${JSON.stringify(
					invalidEntities,
				)}`,
			);
			throw new Error("Entities with 'undefined' properties detected");
		}

		const message = {
			transactions: [
				{
					"data": toArray(entities),
					"ordering-key": options?.ordering
						? payload["execution-id"]
						: undefined,
				},
			],
		};

		try {
			debug(`Transacting entities: ${toEdnString(message)}`);
			const start = Date.now();
			await httpTransact(message, payload, http);
			debug(`Transacted entities ${Date.now() - start} ms`);
		} catch (err) {
			error(`Error transacting entities: ${err.stack}`);
		}
	};
}

async function httpTransact(
	message: any,
	payload: EventIncoming,
	http: HttpClient,
): Promise<void> {
	const url = payload.urls.transactions;
	await http.post(url, {
		body: toEdnString(message),
		headers: {
			"authorization": `Bearer ${payload.token}`,
			"content-type": `application/edn`,
		},
	});
}

export function toEdnString(value: Record<string, any>): string {
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(v => toEdnString(v)).join(" ")}]`;
	}
	if (typeof value === "number") {
		return (value as number).toString();
	}
	if (typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (value === null || value === undefined) {
		return "nil";
	}
	if (value instanceof Date) {
		return `#inst "${value.toISOString()}"`;
	}
	if (typeof value === "bigint") {
		return `${value}N`;
	}
	if (value?._key) {
		return `:${value._key}`;
	}
	if (value?._raw) {
		return value._raw;
	}
	if (value instanceof Map) {
		return `{${[...value]
			.map(([k, v]) => `${toEdnString(k)} ${toEdnString(v)}`)
			.join(" ")}}`;
	}
	if (value instanceof Set) {
		return `#{${[...value].map(v => toEdnString(v)).join(" ")}}`;
	}
	const filteredValue: Record<string, any> = {};
	Object.keys(value).forEach(k => {
		if (value[k] !== undefined) {
			filteredValue[k] = value[k];
		}
	});
	if (typeof filteredValue === "object") {
		return `{${Object.entries(filteredValue)
			.map(([k, v]) => `${`:${k}`} ${toEdnString(v)}`)
			.join(" ")}}`;
	}
	throw new TypeError(`Unknown type: ${JSON.stringify(filteredValue)}`);
}
