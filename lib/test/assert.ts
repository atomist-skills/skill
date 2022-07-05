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

import * as namespace from "../cls";
import {
	ContextFactory,
	createContext,
	loggingCreateContext,
} from "../context";
import { createDatalogClient } from "../datalog/client";
import { processEvent } from "../function";
import { EventContext, Status } from "../handler/handler";
import { createHttpClient } from "../http";
import { debug } from "../log/console";
import { EventIncoming, isEventIncoming } from "../payload";
import { apiKey } from "../script/util";
import { handlerLoader, replacer } from "../util";

export async function assertSkill(
	payload: EventIncoming,
	ctx: Partial<EventContext<any, any>> = {},
): Promise<undefined | Status> {
	// Enable straight console logging
	process.env.ATOMIST_CONSOLE_LOG = "1";
	// Disable docker auth so that we can rely on local creds
	process.env.ATOMIST_SKIP_DOCKER_AUTH = "1";
	// Disable de-dupe checking
	process.env.ATOMIST_SKIP_DEDUPE = "1";

	if (payload.token) {
		payload.token = await apiKey();
	}

	let status: Status;
	const factory: ContextFactory = p => {
		const context = loggingCreateContext(createContext)(p);
		context.status = {
			publish: async (result: Status) => {
				status = result;
			},
		};

		const datalogClient = createDatalogClient(payload, createHttpClient());
		context.datalog = {
			facts: {},
			transact: async (entities: any) => {
				debug(
					`Transacting entities: ${JSON.stringify(
						entities,
						replacer,
					)}`,
				);
			},
			query: async (
				query: string,
				parameters?: any,
				options?: {
					configurationName?: string;
					tx?: number;
					mode?: "raw" | "map" | "obj";
					rules?: string;
				},
			) => datalogClient.query(query, parameters, options),
			retract: async (query: string) => {
				debug(`Retracting entities: ${query}`);
			},
		};
		return {
			...context,
			...ctx,
		} as any;
	};

	await namespace.run(async () => {
		if (isEventIncoming(payload)) {
			await processEvent(payload, handlerLoader("events"), factory);
		}
	});
	return status;
}
