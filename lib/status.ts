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

import { State, Status } from "./handler/handler";

class BuildableStatus implements Status {
	constructor(
		public state: State,
		public reason?: string,
		public _abort?: boolean,
	) {}

	public abort(): this {
		this._abort = true;
		return this;
	}
}

/**
 * Create a completed Status with optionally provided
 * reason text
 *
 * The return object exposes a hidden function that can be used to
 * set the status to visibility: hidden or abort the step processing early.
 */
export function completed(reason?: string): Status & {
	abort: () => BuildableStatus;
} {
	return new BuildableStatus(State.Completed, reason);
}

/**
 * Create a failed Status with optionally provided
 * reason text
 *
 * The return object exposes a hidden function that can be used to
 * set the status to visibility: hidden or abort the step processing early.
 */
export function failed(reason?: string): Status & {
	abort: () => BuildableStatus;
} {
	return new BuildableStatus(State.Failed, reason);
}

/**
 * Create a running Status with optionally provided
 * reason text
 *
 * The return object exposes a hidden function that can be used to
 * set the status to visibility: hidden or abort the step processing early.
 */
export function running(reason?: string): Status & {
	abort: () => BuildableStatus;
} {
	return new BuildableStatus(State.Running, reason);
}
