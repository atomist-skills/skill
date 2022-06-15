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

import { eventHandlerLoader } from "./action";
import * as namespace from "./cls";
import { ContextFactory, createContext, loggingCreateContext } from "./context";
import {
	CommandContext,
	CommandHandler,
	ContextualLifecycle,
	EventContext,
	EventHandler,
	HandlerStatus,
	WebhookContext,
	WebhookHandler,
} from "./handler/handler";
import { debug, error } from "./log";
import { prepareStatus, StatusPublisher } from "./message";
import {
	CommandIncoming,
	EventIncoming,
	isCommandIncoming,
	isEventIncoming,
	isSubscriptionIncoming,
	isWebhookIncoming,
	SubscriptionIncoming,
	WebhookIncoming,
} from "./payload";
import { resolvePayload } from "./payload_resolve";
import { CommandListenerExecutionInterruptError } from "./prompt/prompt";
import { handlerLoader } from "./util";

export interface PubSubMessage {
	data: string;
	attributes: any;
}

export const entryPoint = async (
	pubSubEvent: PubSubMessage,
	context: { eventId: string },
): Promise<void> => {
	await namespace.run(async () => {
		const payload = await resolvePayload(pubSubEvent);
		if (isEventIncoming(payload) || isSubscriptionIncoming(payload)) {
			await processEvent(payload, context);
		} else if (isCommandIncoming(payload)) {
			await processCommand(payload, context);
		} else if (isWebhookIncoming(payload)) {
			await processWebhook(payload, context);
		}
	});
};

export const configurableEntryPoint = async (
	pubSubEvent: PubSubMessage,
	context: { eventId: string },
	factory?: ContextFactory,
	loader?: (
		name: string,
	) => Promise<EventHandler | CommandHandler | WebhookHandler>,
): Promise<void> => {
	await namespace.run(async () => {
		const payload = await resolvePayload(pubSubEvent);
		if (isEventIncoming(payload) || isSubscriptionIncoming(payload)) {
			await processEvent(payload, context, loader as any, factory);
		} else if (isCommandIncoming(payload)) {
			await processCommand(payload, context, loader as any, factory);
		} else if (isWebhookIncoming(payload)) {
			await processWebhook(payload, context, loader as any, factory);
		}
	});
};

export async function processEvent(
	event: EventIncoming | SubscriptionIncoming,
	ctx: { eventId: string },
	loader: (name: string) => Promise<EventHandler> = eventHandlerLoader(
		"events",
	),
	factory: ContextFactory = loggingCreateContext(createContext),
): Promise<void> {
	const context = factory(event, ctx) as EventContext<any> &
		ContextualLifecycle;
	context.onComplete({
		name: undefined,
		priority: Number.MAX_SAFE_INTEGER - 1,
		callback: async () => debug(`Closing event handler '${context.name}'`),
	});
	if (isSubscriptionIncoming(event)) {
		debug(
			`Invoking event handler '${context.name}' for tx '${event.subscription["after-basis-t"]}'`,
		);
	} else {
		debug(`Invoking event handler '${context.name}'`);
	}
	try {
		const result = await invokeHandler(loader, context);
		await (context.message as any as StatusPublisher).publish(
			prepareStatus(result || { code: 0 }, context),
		);
	} catch (e) {
		await publishError(e, context);
	} finally {
		await context.close();
	}
}

export async function processCommand(
	event: CommandIncoming,
	ctx: { eventId: string },
	loader: (name: string) => Promise<CommandHandler> = handlerLoader(
		"commands",
	),
	factory: ContextFactory = loggingCreateContext(createContext),
): Promise<void> {
	const context = factory(event, ctx) as CommandContext & ContextualLifecycle;
	context.onComplete({
		name: undefined,
		priority: Number.MAX_SAFE_INTEGER - 1,
		callback: async () =>
			debug(`Closing command handler '${context.name}'`),
	});
	debug(`Invoking command handler '${context.name}'`);
	try {
		const result = await invokeHandler(loader, context);
		await (context.message as any as StatusPublisher).publish(
			prepareStatus(result || { code: 0 }, context),
		);
	} catch (e) {
		if (e instanceof CommandListenerExecutionInterruptError) {
			await (context.message as any as StatusPublisher).publish(
				prepareStatus({ code: 0 }, context),
			);
		} else {
			await publishError(e, context);
		}
	} finally {
		await context.close();
	}
}

export async function processWebhook(
	event: WebhookIncoming,
	ctx: { eventId: string },
	loader: (name: string) => Promise<WebhookHandler> = handlerLoader(
		"webhooks",
	),
	factory: ContextFactory = loggingCreateContext(createContext),
): Promise<void> {
	const context = factory(event, ctx) as WebhookContext & ContextualLifecycle;
	context.onComplete({
		name: undefined,
		priority: Number.MAX_SAFE_INTEGER - 1,
		callback: async () =>
			debug(`Closing webhook handler '${context.name}'`),
	});
	debug(`Invoking webhook handler '${context.name}'`);
	try {
		const result = await invokeHandler(loader, context);
		await (context.message as any as StatusPublisher).publish(
			prepareStatus(result || { code: 0 }, context),
		);
	} catch (e) {
		await publishError(e, context);
	} finally {
		await context.close();
	}
}

async function invokeHandler(
	loader: (name: string) => Promise<any>,
	context: (EventContext | CommandContext | WebhookContext) &
		ContextualLifecycle,
): Promise<HandlerStatus> {
	const result = (await (
		await loader(context.name)
	)(context)) as HandlerStatus;
	return result;
}

async function publishError(
	e,
	context: (EventContext | CommandContext | WebhookContext) &
		ContextualLifecycle,
) {
	error(`Error occurred: ${e.stack}`);
	await (context.message as any as StatusPublisher).publish(
		prepareStatus(e, context),
	);
}
