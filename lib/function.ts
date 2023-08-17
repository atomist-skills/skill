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
import {
	ContextualLifecycle,
	EventContext,
	EventHandler,
	Status,
} from "./handler/handler";
import { prepareStatus } from "./handler/status";
import { debug, error } from "./log";
import { EventIncoming, isEventIncoming } from "./payload";
import { completed, running } from "./status";
import { handlerLoader } from "./util";

export const entryPoint = async (payload: EventIncoming): Promise<any> => {
	await namespace.run(async () => {
		if (isEventIncoming(payload)) {
			return await processEvent(payload);
		}
	});
	return undefined;
};

export const configurableEntryPoint = async (
	payload: EventIncoming,
	factory?: ContextFactory,
	loader?: (name: string) => Promise<EventHandler>,
): Promise<any> => {
	await namespace.run(async () => {
		if (isEventIncoming(payload)) {
			return await processEvent(payload, loader as any, factory);
		}
	});
	return undefined;
};

export async function processEvent(
	event: EventIncoming,
	loader: (name: string) => Promise<EventHandler> = handlerLoader("events"),
	factory: ContextFactory = loggingCreateContext(createContext),
): Promise<void | any> {
	const context = factory(event) as EventContext<any> & ContextualLifecycle;
	const name =
		context.event.context.subscription?.name ||
		context.event.context.webhook?.name ||
		context.event.context["sync-request"]?.name;
	context.onComplete({
		name: undefined,
		priority: Number.MAX_SAFE_INTEGER - 1,
		callback: async () => debug(`Closing event handler '${name}'`),
	});
	debug(`Invoking event handler '${name}'`);
	let responseResult = undefined;
	try {
		await context.status.publish(running());
		const response = await invokeHandler(loader, context);
		responseResult = response.result;
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
	loader: (name: string) => Promise<any>,
	context: EventContext & ContextualLifecycle,
): Promise<Status> {
	const name =
		context.event.context.subscription?.name ||
		context.event.context.webhook?.name ||
		context.event.context["sync-request"]?.name;
	return (await loader(name))(context);
}

async function publishError(e, context: EventContext & ContextualLifecycle) {
	error(`Error occurred: ${e.stack}`);
	await context.status.publish(prepareStatus(e, context));
}
