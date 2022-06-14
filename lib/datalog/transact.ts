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

import { Contextual } from "../handler/handler";
import { debug, error } from "../log/console";
import { isStaging, replacer, toArray } from "../util";

export type DatalogTransact = (
	entities: any | any[],
	options?: { ordering: boolean },
) => Promise<void>;

export function createTransact(
	ctx: Pick<
		Contextual<any, any>,
		| "onComplete"
		| "workspaceId"
		| "correlationId"
		| "skill"
		| "message"
		| "credential"
		| "http"
	>,
): DatalogTransact {
	const stats = { facts: 0, entities: 0 };
	if (ctx.onComplete) {
		ctx.onComplete({
			name: "transact",
			callback: async () => {
				debug(`Transaction stats: ${JSON.stringify(stats)}`);
			},
		});
	}

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

		stats.facts = toArray(entities).reduce((p, c) => {
			const facts = Object.keys(c).filter(
				f =>
					f !== "schema/entity" &&
					f !== "schema/entity-type" &&
					f !== "db/id",
			);
			return p + facts.length;
		}, stats.facts);
		stats.entities += toArray(entities).length;

		const message = {
			api_version: "1",
			correlation_id: ctx.correlationId,
			team: {
				id: ctx.workspaceId,
			},
			type: "facts_ingestion",
			entities: toEdnString(toArray(entities)),
		};

		try {
			debug(`Transacting entities: ${JSON.stringify(message, replacer)}`);
			const start = Date.now();
			if (process.env.ATOMIST_TOPIC) {
				const messageId = await pubSubTransact(message, options, ctx);
				debug(
					`Transacted entities '${messageId}' in ${
						Date.now() - start
					} ms`,
				);
			} else {
				await httpTransact(message, options, ctx);
				debug(`Transacted entities ${Date.now() - start} ms`);
			}
		} catch (err) {
			error(`Error transacting entities: ${err.stack}`);
		}
	};
}

async function pubSubTransact(
	message: any,
	options = { ordering: true },
	ctx: Pick<Contextual<any, any>, "message" | "correlationId">,
): Promise<string> {
	return await ctx.message.publisher.publish({
		data: message,
		orderingKey:
			options?.ordering === false ? undefined : ctx.correlationId,
	});
}

async function httpTransact(
	message: any,
	options = { ordering: true },
	ctx: Pick<
		Contextual<any, any>,
		"http" | "workspaceId" | "credential" | "correlationId"
	>,
): Promise<void> {
	const url = isStaging()
		? `https://api.atomist.services/skills/remote/${ctx.workspaceId}`
		: `https://api.atomist.com/skills/remote/${ctx.workspaceId}`;
	await ctx.http.post(url, {
		body: JSON.stringify(message),
		headers: {
			"authorization": `Bearer ${ctx.credential.apiKey}`,
			"x-atomist-correlation-id": ctx.correlationId,
			"x-atomist-ordering-key":
				options?.ordering === false ? undefined : ctx.correlationId,
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
	if (value === null) {
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
	if (value instanceof Map) {
		return `{${[...value]
			.map(([k, v]) => `${toEdnString(k)} ${toEdnString(v)}`)
			.join(" ")}}`;
	}
	if (value instanceof Set) {
		return `#{${[...value].map(v => toEdnString(v)).join(" ")}}`;
	}
	if (typeof value === "object") {
		return `{${Object.entries(value)
			.map(([k, v]) => `${`:${k}`} ${toEdnString(v)}`)
			.join(" ")}}`;
	}
	throw new TypeError(`Unknown type: ${JSON.stringify(value)}`);
}
