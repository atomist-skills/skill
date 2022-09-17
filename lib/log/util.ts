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

import { EventContext } from "../handler/handler";

enum Level {
	error = 0,
	warn = 1,
	info = 2,
	debug = 3,
}

export function enabled(level: string): boolean {
	const configuredLevel = Level[process.env.ATOMIST_LOG_LEVEL || "debug"];
	return configuredLevel >= Level[level];
}

export function dsoUrl(ctx: EventContext): string {
	return `https://dso.docker.com"}/${ctx.event["workspace-id"]}/overview?correlation_id=${ctx.event["execution-id"]}`;
}

export function url(ctx: EventContext): string {
	return `https://skills.dso.docker.com"}/log/${ctx.event["workspace-id"]}/${ctx.event["execution-id"]}`;
}
