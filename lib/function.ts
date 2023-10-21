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

// tslint:disable-next-line:no-import-side-effect
import "source-map-support/register";

import * as namespace from "./cls";
import { ContextFactory, createContext, loggingCreateContext } from "./context";
import { ContextualLifecycle, EventContext, Status } from "./handler/handler";
import { EventType, HandlerRouting } from "./handler/routing";
import { prepareStatus } from "./handler/status";
import { debug, error } from "./log";
import { EventIncoming, eventName, isEventIncoming } from "./payload";
import { completed, running } from "./status";
import { handlerLoader, replacer } from "./util";

export const entryPoint = async (payload: EventIncoming): Promise<Status> => {
	return await namespace.run(async () => {
		if (isEventIncoming(payload)) {
			return await processEvent(payload);
		}
	});
};

export const configurableEntryPoint = async (
	payload: EventIncoming,
	factory?: ContextFactory,
	routing?: HandlerRouting,
): Promise<Status> => {
	return await namespace.run(async () => {
		if (isEventIncoming(payload)) {
			return await processEvent(payload, routing, factory);
		}
	});
};

export async function processEvent(
	event: EventIncoming,
	routing: HandlerRouting = handlerLoader(),
	factory: ContextFactory = loggingCreateContext(createContext),
): Promise<void | any> {
	const context = factory(event) as EventContext<any> & ContextualLifecycle;
	const name = eventName(event);
	let responseResult = undefined;
	context.onComplete({
		name: undefined,
		priority: Number.MAX_SAFE_INTEGER - 1,
		callback: async () => debug(`Closing ${event.type} handler '${name}'`),
	});
	debug(`Invoking ${event.type} handler '${name}'`);
	try {
		await context.status.publish(running());
		const response = await invokeHandler(routing, context);
		responseResult = response;
		debug(`Handler status: ${JSON.stringify(responseResult, replacer)} `);
		await context.status.publish(
			prepareStatus(response || completed(), context),
		);
	} catch (e) {
		await publishError(e, context);
	} finally {
		await context.close();
	}
	return responseResult;
}

async function invokeHandler(
	routing: HandlerRouting,
	context: EventContext & ContextualLifecycle,
): Promise<Status> {
	return (
		await routing(EventType[context.event.type], eventName(context.event))
	)(context);
}

async function publishError(e, context: EventContext & ContextualLifecycle) {
	error(`Error occurred: ${e.stack}`);
	await context.status.publish(prepareStatus(e, context));
}
