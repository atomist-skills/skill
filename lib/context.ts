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

import { createDatalogClient } from "./datalog/client";
import {
	ContextClosable,
	ContextualLifecycle,
	DefaultPriority,
	EventContext,
} from "./handler/handler";
import { createStatusPublisher } from "./handler/status";
import { createHttpClient } from "./http";
import { debug } from "./log/console";
import { EventIncoming, isEventIncoming } from "./payload";
import { handleError } from "./util";
import camelCase = require("lodash.camelcase");
import sortBy = require("lodash.sortby");
export type ContextFactory = (
	payload: EventIncoming,
) => (EventContext & ContextualLifecycle) | undefined;

export function createContext(
	payload: EventIncoming,
): (EventContext & ContextualLifecycle) | undefined {
	const http = createHttpClient();
	const completeCallbacks: ContextClosable[] = [];
	const onComplete = (closable: ContextClosable) => {
		if (closable.priority === undefined) {
			closable.priority = DefaultPriority;
		}
		completeCallbacks.push(closable);
	};
	const close = async () => {
		const prioritizedClosables = sortBy(completeCallbacks, [
			"priority",
		]).reverse();
		let closable = prioritizedClosables.pop();
		while (closable) {
			if (closable.name) {
				debug(`Closing '${closable.name}'`);
			}
			await handleError(closable.callback);
			closable = prioritizedClosables.pop();
		}
	};

	if (isEventIncoming(payload)) {
		const context: EventContext & ContextualLifecycle = {
			event: payload,
			http,
			datalog: createDatalogClient(payload, http),
			status: createStatusPublisher(payload, http),
			close,
			onComplete,
		};
		context.event.skill.configuration = extractConfigurationParameters(
			payload.context?.subscription?.configuration?.parameters || [],
		);
		return context;
	}
	return undefined;
}

function extractConfigurationParameters(
	params: Array<{ name: string; value: any }>,
): Record<string, any> {
	let nested = false;
	const parameters = {};
	params?.forEach(p => {
		if (p.name.startsWith("atomist://")) {
			const rec = parameters["atomist"] || {};
			rec[camelCase(p.name.split("://")[1])] = p.value;
			parameters["atomist"] = rec;
		} else if (p.name === "dockerhub_global_read_username") {
			parameters["dockerhub.global-username"] = p.value;
		} else if (p.name === "dockerhub_global_read_api_key") {
			parameters["dockerhub.global-api-key"] = p.value;
		} else {
			parameters[p.name] = p.value;
		}
		if (p.name.includes(".")) {
			nested = true;
		}
	});
	if (nested) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const dot = require("dot-object");
		return dot.object(parameters);
	} else {
		return parameters;
	}
}
