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

import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

import { error } from "./log/console";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function hash(obj: any): string {
	const hash = crypto.createHash("sha256");
	hash.update(typeof obj === "string" ? obj : JSON.stringify(obj));
	return hash.digest("hex");
}

export function guid(): string {
	return uuidv4();
}

export function truncate(
	text: string,
	length: number,
	options: { direction: "start" | "middle" | "end"; separator: string } = {
		direction: "middle",
		separator: "...",
	},
): string {
	if (text.length <= length) {
		return text;
	}
	const separatorLength = options.separator.length;
	if (options.direction === "start") {
		return `${options.separator}${text.slice(
			text.length - length + separatorLength,
		)}`;
	} else if (options.direction === "end") {
		return `${text.slice(0, length - separatorLength)}${options.separator}`;
	} else if (options.direction === "middle") {
		const charsToShow = length - separatorLength;
		const frontChars = Math.ceil(charsToShow / 2);
		const backChars = Math.floor(charsToShow / 2);

		return `${text.slice(0, frontChars)}${options.separator}${text.slice(
			text.length - backChars,
		)}`;
	}
	return text;
}

export function toArray<T>(value: T | T[]): T[] {
	if (value) {
		if (Array.isArray(value)) {
			return value;
		} else {
			return [value];
		}
	} else {
		return undefined;
	}
}

function keyToHide(key: string): boolean {
	return /token|password|jwt|url|secret|authorization|key|cert|pass|user|address|email|pat/i.test(
		key,
	);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function replacer(key: string, value: any): any {
	if (key === "parameters" && value) {
		return value.map(v => {
			let value = v.value;
			if (keyToHide(v.name)) {
				value = hideString(v.value);
			}
			return { name: v.name, value };
		});
	} else if (key === "secrets" && value) {
		return value.map(v => ({ uri: v.uri, value: hideString(v.value) }));
	} else if (keyToHide(key)) {
		return hideString(value);
	} else {
		return value;
	}
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function hideString(value: any): any {
	if (!value) {
		return value;
	}

	if (typeof value === "string") {
		let newValue = "";
		for (let i = 0; i < value.length; i++) {
			if (i === 0) {
				newValue = value.charAt(0);
			} else if (i < value.length - 1) {
				newValue += "*";
			} else {
				newValue += value.slice(-1);
			}
		}
		return newValue;
	} else if (Array.isArray(value)) {
		return value.map(hideString);
	}
	return value;
}

export async function handleError<T>(
	f: () => Promise<T>,
	cb?: (err: Error) => Promise<T | undefined>,
): Promise<T | undefined> {
	if (!cb) {
		cb = loggingErrorHandler();
	}
	try {
		const result = await f();
		return result;
	} catch (e) {
		return cb(e);
	}
}

export function handleErrorSync<T>(
	f: () => T,
	cb?: (err: Error) => T | undefined,
): T | undefined {
	if (!cb) {
		cb = loggingErrorHandler();
	}
	try {
		return f();
	} catch (e) {
		return cb(e);
	}
}

export function loggingErrorHandler(
	cb: (msg: string) => void = error,
): (err: Error) => undefined {
	return err => {
		if (err.stack) {
			cb(`Error occurred: ${err.stack}`);
		} else {
			cb(`Error occurred: ${err.message}`);
		}
		return undefined;
	};
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isPrimitive(test: any): boolean {
	return test !== Object(test);
}

export function before<
	T extends (...args: any[]) => Promise<any>,
	B extends (...args: any[]) => Promise<void>,
>(func: T, adviceFunc: B): T {
	return (async (...args: any[]) => {
		await adviceFunc(...args);
		return func(...args);
	}) as any;
}

export function after<
	T extends (...args: any[]) => Promise<any>,
	A extends (result: any, ...args: any[]) => Promise<any>,
>(func: T, adviceFunc: A): T {
	return (async (...args: any[]) => {
		let result;
		try {
			result = await func(...args);
		} finally {
			result = await adviceFunc(result, ...args);
		}
		return result;
	}) as any;
}

export async function forEach<T>(
	elems: T[],
	cb: (elem: T, index?: number, elems?: T[]) => Promise<void>,
): Promise<void> {
	for (let i = 0; i < (elems || []).length; i++) {
		await cb(elems[i], i, elems);
	}
}
