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

import * as asyncHooks from "async_hooks";

const namespaces: { [key: string]: Namespace } = {};

export async function run<T>(fn: () => Promise<T>): Promise<T> {
	return namespace.run(fn);
}

export function set<T>(key: string, value: T): void {
	namespace.set(key, value);
}

export function get<T>(key: string): T {
	return namespace.get(key);
}

class Namespace {
	constructor(public readonly context = {}) {}

	public run<T>(fn: () => Promise<T>): Promise<T> {
		const id = asyncHooks.executionAsyncId();
		this.context[id] = {};
		return fn();
	}

	public set(key: string, val: any): void {
		const id = asyncHooks.executionAsyncId();
		if (this.context[id]) {
			this.context[id][key] = val;
		}
	}

	public get(key: string): any {
		const id = asyncHooks.executionAsyncId();
		if (this.context[id]) {
			return this.context[id][key];
		} else {
			return undefined;
		}
	}
}

function createHooks(nsp: Namespace): void {
	const init = (
		asyncId: number,
		type: string,
		triggerAsyncId: number,
	): void => {
		if (nsp.context[triggerAsyncId]) {
			nsp.context[asyncId] = nsp.context[triggerAsyncId];
		}
	};

	const destroy = (asyncId): void => {
		delete nsp.context[asyncId];
	};

	const asyncHook = asyncHooks.createHook({ init, destroy });
	asyncHook.enable();
}

function createNamespace(name): Namespace {
	if (namespaces[name]) {
		throw new Error(`Namespace '${name}' already exists`);
	}

	const nsp = new Namespace();
	namespaces[name] = nsp;

	createHooks(nsp);

	return nsp;
}

const namespace = createNamespace("skill");
