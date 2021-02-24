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

import { Attachment } from "@atomist/slack-messages";

import { eventHandlerLoader } from "../action";
import { ContextFactory, createContext } from "../context";
import { processCommand, processEvent, processWebhook } from "../function";
import { Contextual, HandlerStatus } from "../handler/handler";
import { debug } from "../log/console";
import { Destinations, HandlerResponse, MessageOptions } from "../message";
import {
	CommandIncoming,
	EventIncoming,
	isCommandIncoming,
	isEventIncoming,
	isSubscriptionIncoming,
	isWebhookIncoming,
	WebhookIncoming,
} from "../payload";
import { apiKey } from "../script/skill_register";
import { guid, handlerLoader, replacer } from "../util";

export async function assertSkill(
	payload: CommandIncoming | EventIncoming | WebhookIncoming,
	ctx: Partial<Contextual<any, any>> = {},
): Promise<undefined | HandlerStatus> {
	const apiKeySecret = payload.secrets.find(
		s => s.uri === "atomist://api-key",
	);
	if (apiKeySecret) {
		apiKeySecret.value = await apiKey();
	}

	let status: HandlerResponse["status"];
	const factory: ContextFactory = (p, c) => {
		const context = createContext(p, c);
		context.message = {
			respond: async (msg: any) => {
				debug(`Sending message: ${JSON.stringify(msg, replacer)}`);
			},
			send: async (msg: any) => {
				debug(`Sending message: ${JSON.stringify(msg, replacer)}`);
			},
			delete: async (
				destinations: Destinations,
				options: MessageOptions,
			) => {
				debug(`Deleting message: ${JSON.stringify(options, replacer)}`);
			},
			publish: async (result: HandlerResponse["status"]) => {
				status = result;
			},
			attach: async (attachment: Attachment) => {
				debug(
					`Sending attachment: ${JSON.stringify(
						attachment,
						replacer,
					)}`,
				);
			},
		} as any;
		context.datalog = {
			transact: async (entities: any) => {
				debug(
					`Transacting entities: ${JSON.stringify(
						entities,
						replacer,
					)}`,
				);
			},
			query: async () => {
				return undefined;
			},
		};
		return {
			...context,
			...ctx,
		} as any;
	};

	if (isEventIncoming(payload) || isSubscriptionIncoming(payload)) {
		await processEvent(
			payload,
			{ eventId: guid() },
			eventHandlerLoader("events"),
			factory,
		);
	} else if (isCommandIncoming(payload)) {
		await processCommand(
			payload,
			{ eventId: guid() },
			handlerLoader("commands"),
			factory,
		);
	} else if (isWebhookIncoming(payload)) {
		await processWebhook(
			payload,
			{ eventId: guid() },
			handlerLoader("webhooks"),
			factory,
		);
	}
	return status;
}
