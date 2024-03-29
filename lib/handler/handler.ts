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

import { DatalogClient } from "../datalog/client";
import { GraphQLClient } from "../graphql";
import { HttpClient } from "../http";
import { CommandMessageClient, MessageClient } from "../message";
import {
	CommandIncoming,
	EventIncoming,
	SubscriptionIncoming,
	WebhookIncoming,
} from "../payload";
import { ProjectLoader } from "../project/index";
import {
	ParameterPromptObject,
	ParameterPromptOptions,
} from "../prompt/prompt";
import { CredentialProvider } from "../secret/provider";
import { StorageProvider } from "../storage/provider";

export interface Configuration<C extends Record<string, any>> {
	name: string;
	parameters: C & {
		atomist?: {
			skillUrl?: string;
			configurationUrl?: string;
			policy?: boolean;
		};
	};
	resourceProviders: Record<
		string,
		{ typeName: string; selectedResourceProviders: Array<{ id: string }> }
	>;

	url: string;
}

export const DefaultPriority = 100;

export type ContextClosable = {
	name: string;
	priority?: number;
	callback: () => Promise<void>;
};

export interface Contextual<T, C> {
	/** Name of the event subscription, command or webhook */
	name: string;

	/** Workspace Id of currently executing skill */
	workspaceId: string;

	/** Correlation Id of the currently executing skill */
	correlationId: string;

	/** Execution Id of the currently executing skill */
	executionId: string;

	/**
	 * Resolver to obtain credentials from GraphQL
	 * @deprecated use Datalog subscriptions
	 */
	credential: CredentialProvider;

	/**
	 * Client to query GraphQL data
	 * @deprecated use Datalog to query and transact
	 */
	graphql: GraphQLClient;

	/**
	 * Datalog client to query and transact
	 */
	datalog: DatalogClient;

	/**
	 * Pre-configured HTTP client
	 */
	http: HttpClient;

	/**
	 * Client to send chat messages
	 */
	message: MessageClient;

	/**
	 * Clone and load GitHub repositories
	 */
	project: ProjectLoader;

	/**
	 * Access to store and retrieve files from a storage backend
	 * @deprecated
	 */
	storage: StorageProvider;

	/**
	 * Original trigger unprocessed payload
	 */
	trigger: T;

	/**
	 * Configuration of the currently executing skill
	 */
	configuration: C;

	/**
	 * Details about the currently executing skill
	 */
	skill: {
		id: string;
		name: string;
		namespace: string;
		version: string;
	};

	/** Register a callback that gets executed when the skill execution is complete */
	onComplete: (closable: ContextClosable) => void;
}

/**
 * Internal extension to the Contextual interface providing
 * lifecycle methods
 */
export interface ContextualLifecycle {
	close: () => Promise<void>;
}

export interface EventContext<
	E = any,
	C = any,
	P = EventIncoming | SubscriptionIncoming,
> extends Contextual<P, Configuration<C>> {
	/** Subscription data */
	data: E;
}

export interface CommandContext<C = any>
	extends Contextual<CommandIncoming, Array<Configuration<C>>> {
	parameters: {
		prompt<PARAMS = any>(
			parameters: ParameterPromptObject<PARAMS>,
			options?: ParameterPromptOptions,
		): Promise<PARAMS>;
	};

	message: CommandMessageClient;
}

export interface WebhookContext<B = any, C = any>
	extends Contextual<WebhookIncoming, Configuration<C>> {
	/** HTTP headers */
	headers: Record<string, string>;
	/** Raw webhook payload */
	body: string;
	/** Parsed JS object if payload is application/json */
	json: B;
	/** URL that the webhook payload was sent to */
	url: string;
	/** Name of the webhook parameter */
	name: string;
}

export interface HandlerStatus {
	visibility?: "hidden" | "visible";
	code?: number;
	reason?: string;
}

export type CommandHandler<C = any> = (
	context: CommandContext<C>,
) => Promise<void | HandlerStatus>;

export type EventHandler<E = any, C = any> = (
	context: EventContext<E, C>,
) => Promise<void | HandlerStatus>;

export type MappingEventHandler<E = any, R = any, C = any> = {
	handle: EventHandler<E, C>;
	map: (data: R[]) => E;
};

export type WebhookHandler<B = any, C = any> = (
	context: WebhookContext<B, C>,
) => Promise<void | HandlerStatus>;
