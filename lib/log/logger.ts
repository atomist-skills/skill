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

import * as Queue from "better-queue";
import * as util from "util";

import { toEdnString } from "../datalog/transact";
import { asKeyword, EntityKeyword } from "../datalog/util";
import { createHttpClient } from "../http";
import { EventIncoming } from "../payload";

export interface Logger {
	/**
	 * Log a message at debug level
	 * @param msg the message to log
	 * @param parameters additional optional parameters. Refer to util.format.
	 */
	debug(msg: string, ...parameters: any[]): void;

	/**
	 * Log a message at info level
	 * @param msg the message to log
	 * @param parameters additional optional parameters. Refer to util.format.
	 */
	info(msg: string, ...parameters: any[]): void;

	/**
	 * Log a message at warn level
	 * @param msg the message to log
	 * @param parameters additional optional parameters. Refer to util.format.
	 */
	warn(msg: string, ...parameters: any[]): void;

	/**
	 * Log a message at error level
	 * @param msg the message to log
	 * @param parameters additional optional parameters. Refer to util.format.
	 */
	error(msg: string, ...parameters: any[]): void;

	/**
	 * Close this Logger instance.
	 *
	 * Note: calling close is very important to avoid loosing log messages
	 * that are queued from any of the log methods above and processed asynchronously.
	 */
	close(): Promise<void>;
}

interface Entry {
	timestamp: string;
	level: EntityKeyword;
	text: string;
}

export function createLogger(payload: EventIncoming): Logger {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const Store = require("better-queue-memory");
	const logQueue = new Queue<Entry, Promise<void>>({
		store: new Store(),
		process: async (entries: Entry[], cb) => {
			const filteredEntries = entries.filter(
				e => e.level?._key !== "exit",
			);
			await createHttpClient().post(payload.urls.logs, {
				body: toEdnString({
					logs: filteredEntries,
				}),
				headers: {
					"authorization": `Bearer ${payload.token}`,
					"content-type": `application/edn`,
				},
			});
			cb();
		},
		concurrent: 1,
		batchSize: 10,
	});
	logQueue.resume();

	let closing = false;
	let started = false;
	const drained = new Promise<void>(resolve => {
		logQueue.on("drain", () => {
			if (closing) {
				resolve();
			}
		});
	});

	const queueLog = (msg: string, severity: string, ...parameters: any[]) => {
		started = true;
		const fmsg = util.format(msg, ...parameters);
		logQueue.push({
			timestamp: new Date().toISOString(),
			level: asKeyword(severity.toLowerCase()),
			text: fmsg,
		});
		// tslint:disable-next-line:no-console
		let prefix = `[${severity.toLowerCase()}]`;
		while (prefix.length < 7) {
			prefix = ` ${prefix}`;
		}
		console[severity.toLowerCase()]?.(`${prefix} ${fmsg}`);
	};

	return {
		debug: (msg: string, ...parameters) =>
			queueLog(msg, "DEBUG", ...parameters),
		info: (msg: string, ...parameters) =>
			queueLog(msg, "INFO", ...parameters),
		warn: (msg: string, ...parameters) =>
			queueLog(msg, "WARN", ...parameters),
		error: (msg: string, ...parameters) =>
			queueLog(msg, "ERROR", ...parameters),
		close: async () => {
			if (!started) {
				return Promise.resolve();
			}
			closing = true;
			queueLog("", "EXIT");
			return drained;
		},
	};
}
