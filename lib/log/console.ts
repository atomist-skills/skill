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

import * as util from "util";

import * as namespace from "../cls";
import { Logger } from "./logger";
import { redact } from "./redact";
import { enabled } from "./util";

/**
 * Print the debug level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function debug(message: string, ...optionalParams: any[]): void {
	log("debug", message, ...optionalParams);
}

/**
 * Print the info level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function info(message: string, ...optionalParams: any[]): void {
	log("info", message, ...optionalParams);
}

/**
 * Print the warn level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function warn(message: string, ...optionalParams: any[]): void {
	log("warn", message, ...optionalParams);
}

/**
 * Print the error level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function error(message: string, ...optionalParams: any[]): void {
	log("error", message, ...optionalParams);
}

export function setLogger(logger: Logger): void {
	return namespace.set<Logger>("logger", logger);
}

function getLogger(): Logger {
	return namespace.get<Logger>("logger");
}

function log(level: string, message: string, ...optionalParams: any[]): void {
	if (enabled(level)) {
		const fmsg = redact(util.format(message, ...optionalParams));
		if (getLogger()) {
			getLogger()[level](fmsg);
		} else {
			// tslint:disable-next-line:no-console
			let prefix = `[${level}]`;
			while (prefix.length < 7) {
				prefix = ` ${prefix}`;
			}
			console[level](`${prefix} ${fmsg}`);
		}
	}
}
