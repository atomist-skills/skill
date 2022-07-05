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
	Contextual,
	ContextualLifecycle,
	DefaultPriority,
	EventContext,
} from "./handler/handler";
import { createStatusPublisher } from "./handler/status";
import { createHttpClient } from "./http";
import { debug } from "./log/console";
import { initLogging, logPayload, runtime } from "./log/util";
import { EventIncoming, isEventIncoming } from "./payload";
import { createProjectLoader } from "./project/loader";
import { handleError } from "./util";
import camelCase = require("lodash.camelcase");
import sortBy = require("lodash.sortby");
export type ContextFactory = (
	payload: EventIncoming,
) => (EventContext & ContextualLifecycle) | undefined;

export function loggingCreateContext(
	delegate: ContextFactory,
	options: {
		payload: boolean;
		before?: (ctx: Contextual) => void;
		after?: ContextClosable;
	} = { payload: true },
): ContextFactory {
	return payload => {
		const context = delegate(payload);
		if (context) {
			initLogging(payload, context.onComplete);
			options?.before?.(context);
			if (options?.after) {
				context.onComplete(options.after);
			}

			const rt = runtime();
			debug(
				"Starting %s/%s:%s '%s' %satomist/skill:%s (%s) nodejs:%s '%s'",
				payload.skill.namespace,
				payload.skill.name,
				payload.skill.version,
				context.event.context.subscription?.name ||
					context.event.context.webhook?.name,
				rt.host?.sha ? `(${rt.host.sha.slice(0, 7)}) ` : "",
				rt.skill.version,
				rt.skill.sha.slice(0, 7),
				rt.node.version,
				rt.uptime,
			);
			if (options?.payload) {
				logPayload(payload);
			}
		}
		return context;
	};
}

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
			project: createProjectLoader({ onComplete }),
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
