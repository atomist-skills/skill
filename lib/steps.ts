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

import { CommandContext, EventContext, HandlerStatus } from "./handler/handler";
import { info, warn } from "./log";
import { toArray } from "./util";

/**
 * Single step in the Skill execution
 */
export interface Step<
	C extends EventContext | CommandContext,
	G extends Record<string, any> = any
> {
	/** Name of the step */
	name: string;
	/** Function that gets called when the step should execute */
	run: (context: C, parameters: G) => Promise<HandlerStatus>;
	/** Optional function to indicate if the step should runSkill */
	runWhen?: (context: C, parameters: G) => Promise<boolean>;
}

export interface StepListener<
	C extends EventContext | CommandContext,
	G extends Record<string, any> = any
> {
	starting?(step: Step<C>, parameters: G): Promise<void>;

	skipped?(step: Step<C>, parameters: G): Promise<void>;

	completed?(
		step: Step<C>,
		parameters: G,
		result: HandlerStatus,
	): Promise<void>;

	failed?(step: Step<C>, parameters: G, error: Error): Promise<void>;

	done?(parameters: G, result: HandlerStatus): Promise<HandlerStatus>;
}

/**
 * Execute provided skill steps in the order they are provided or until one fails
 */
export async function runSteps<
	C extends EventContext | CommandContext
>(options: {
	context: C;
	steps: Step<C> | Array<Step<C>>;
	listeners?: StepListener<C> | Array<StepListener<C>>;
	parameters?: Record<string, any>;
}): Promise<HandlerStatus> {
	const parameters: Record<string, any> = options.parameters || {};
	const context = options.context;
	const listeners = toArray(options.listeners) || [];
	let result: HandlerStatus;

	for (const step of toArray(options.steps)) {
		try {
			if (!step.runWhen || !!(await step.runWhen(context, parameters))) {
				info(`Running '${step.name}'`);
				await invokeListeners(
					listeners.filter(l => !!l.starting),
					async l => l.starting(step, parameters),
				);

				const sr = await step.run(context, parameters);
				if (sr) {
					result = {
						code:
							sr?.code !== undefined
								? sr.code
								: (result || {}).code,
						reason: sr?.reason ? sr.reason : (result || {}).reason,
						visibility: sr?.visibility
							? sr.visibility
							: (result || {}).visibility,
					};
				}
				await invokeListeners(
					listeners.filter(l => !!l.completed),
					async l => l.completed(step, parameters, sr),
				);

				if ((sr as any)?._abort) {
					info(`Completed '${step.name}' and exited`);
					return sr;
				} else if (sr?.code !== 0) {
					warn(`'${step.name}' errored with: ${sr.reason}`);
					return sr;
				} else if (sr?.reason) {
					info(`Completed '${step.name}' with: ${sr.reason}`);
				} else {
					info(`Completed '${step.name}'`);
				}
			} else {
				info(`Skipping '${step.name}'`);
				await invokeListeners(
					listeners.filter(l => !!l.skipped),
					async l => l.skipped(step, parameters),
				);
			}
		} catch (e) {
			warn(`'${step.name}' errored with: ${e.message}`);
			warn(e.stack);
			await invokeListeners(
				listeners.filter(l => !!l.failed),
				async l => l.failed(step, parameters, e),
			);
			return {
				code: 1,
				reason: `'${step.name}' errored`,
			};
		}
	}
	return invokeDone(
		listeners.filter(l => !!l.done),
		parameters,
		result,
	);
}

async function invokeListeners(
	listeners: Array<StepListener<any>>,
	cb: (l: StepListener<any>) => Promise<void>,
): Promise<void> {
	for (const listener of listeners) {
		try {
			await cb(listener);
		} catch (e) {
			warn("Listener failed with");
			warn(e);
		}
	}
}

async function invokeDone(
	listeners: Array<StepListener<any>>,
	parameters: any,
	inputResult: HandlerStatus,
): Promise<HandlerStatus> {
	let result = inputResult;
	for (const listener of listeners) {
		try {
			result = await listener.done(parameters, result);
		} catch (e) {
			warn("Listener failed with:");
			warn(e);
		}
	}
	return result;
}
