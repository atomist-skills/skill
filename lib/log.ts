/*
 * Copyright © 2020 Atomist, Inc.
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

import { redact } from "./redact";

/**
 * Print the debug level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function debug(message: string, ...optionalParams: any[]): void {
    // tslint:disable-next-line:no-console
    console.debug(`[debug] ${redact(message)}`, ...optionalParams);
}

/**
 * Print the info level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function info(message: string, ...optionalParams: any[]): void {
    // tslint:disable-next-line:no-console
    console.info(`[info]  ${redact(message)}`, ...optionalParams);
}

/**
 * Print the warn level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function warn(message: string, ...optionalParams: any[]): void {
    // tslint:disable-next-line:no-console
    console.warn(`[warn]  ${redact(message)}`, ...optionalParams);
}

/**
 * Print the error level message to stdout
 *
 * @param message The message to print
 * @param optionalParams Optional params to pass to the logger
 */
export function error(message: string, ...optionalParams: any[]): void {
    // tslint:disable-next-line:no-console
    console.error(`[error] ${redact(message)}`, ...optionalParams);
}
