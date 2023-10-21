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
import { HttpClient } from "../http";
import { EventIncoming } from "../payload";
import { ProjectLoader } from "../project/index";
import { StatusPublisher } from "./status";

export const DefaultPriority = 100;

export type ContextClosable = {
	name: string;
	priority?: number;
	callback: () => Promise<void>;
};

export interface Contextual {
	/**
	 * Datalog client to query and transact
	 */
	datalog: DatalogClient;

	/**
	 * Pre-configured HTTP client
	 */
	http: HttpClient;

	/**
	 * Clone and load GitHub repositories
	 */
	project: ProjectLoader;

	/**
	 * Publish status messages
	 */
	status: StatusPublisher;

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

export interface EventContext<E = any, C = any> extends Contextual {
	/**
	 * Incoming event
	 */
	event: EventIncoming<E, C>;
}

export enum State {
	Queued = "queued",
	Running = "running",
	Completed = "completed",
	Retryable = "retryable",
	Failed = "failed",
}

export interface Status {
	state: State;
	reason?: string;
	syncRequest?: any;
	validation?: {
		success: boolean;
		reason?: string;
	};
}

export type EventHandler<E = any, C = any> = (
	context: EventContext<E, C>,
) => Promise<Status>;
