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

import { CommandMessageClient, HandlerResponse, Parameter } from "../message";
import { Arg, CommandIncoming } from "../payload";
import { ParameterObjectValue } from "./parameter";
import cloneDeep = require("lodash.clonedeep");
import map = require("lodash.map");
import set = require("lodash.set");

/**
 * Object with properties defining parameters. Useful for combination via spreads.
 */
export type ParameterPromptObject<
	PARAMS,
	K extends keyof PARAMS = keyof PARAMS
> = Record<K, ParameterObjectValue>;

/**
 * Different strategies to ask for parameters in chat or web
 */
export enum ParameterPromptStyle {
	/** Parameter questions will be prompted in a dialog */
	Dialog = "dialog",

	/** Parameter questions will be prompted in a thread */
	Threaded = "threaded",

	/**
	 * Parameter questions will be prompted in the channel where the
	 * command is being run
	 */
	Unthreaded = "unthreaded",

	/**
	 * Parameter questions will be prompted in a dialog if the command
	 * is triggered from a button or menu
	 */
	DialogAction = "dialog_action",
}

/**
 * Options to configure the parameter prompt
 */
export interface ParameterPromptOptions {
	/** Optional thread identifier to send this message to or true to send
	 * this to the message that triggered this command.
	 */
	thread?: boolean | string;

	/**
	 * Configure strategy on how to ask for parameters in chat or web
	 */
	parameterStyle?: ParameterPromptStyle;

	/**
	 * Configure auto submit strategy for when all required parameters are collected
	 */
	autoSubmit?: boolean;
}

/**
 * ParameterPrompts let the caller prompt for the provided parameters
 */
export type ParameterPrompt<PARAMS> = (
	parameters: ParameterPromptObject<PARAMS>,
	options?: ParameterPromptOptions,
) => Promise<PARAMS>;

export const AtomistContinuationMimeType =
	"application/x-atomist-continuation+json";

/**
 * Default ParameterPromptFactory that uses the WebSocket connection to send parameter prompts to the backend.
 * @param ctx
 */
export function commandRequestParameterPromptFactory<T>(
	messageClient: CommandMessageClient,
	payload: CommandIncoming,
): ParameterPrompt<T> {
	return async (parameters, options = {}): Promise<T> => {
		const existingParameters = payload.parameters;
		const newParameters = cloneDeep(parameters);

		// Find out if - and if - which parameters are actually missing
		let requiredMissing = false;
		const params: any = {};
		for (const parameter in parameters) {
			const existingParameter = existingParameters.find(
				p => p.name === parameter,
			);
			if (!existingParameter) {
				// If required isn't defined it means the parameter is required
				if (
					newParameters[parameter].required ||
					newParameters[parameter].required === undefined
				) {
					requiredMissing = true;
				}
			} else {
				params[parameter] = existingParameter.value;
				delete newParameters[parameter];
			}
		}

		// If no parameters are missing we can return the already collected parameters
		if (!requiredMissing) {
			return params;
		}

		// Set up the thread_ts for this response message
		let threadTs;
		if (options.thread === true && !!payload.source) {
			threadTs = (payload?.source?.slack as any)?.message?.ts;
		} else if (typeof options.thread === "string") {
			threadTs = options.thread;
		}

		const destination = cloneDeep(payload.source);
		set(destination, "slack.thread_ts", threadTs);

		// Create a continuation message using the existing HandlerResponse and mixing in parameters
		// and parameter_specs
		const response: HandlerResponse & {
			parameters: Arg[];
			parameter_specs: Parameter[];
			question: any;
			auto_submit: boolean;
		} = {
			api_version: "1",
			correlation_id: payload.correlation_id,
			team: payload.team,
			command: payload.command,
			source: payload.source,
			destinations: [destination],
			parameters: payload.parameters,
			auto_submit: options.autoSubmit ? options.autoSubmit : undefined,
			question: options.parameterStyle
				? options.parameterStyle.toString()
				: undefined,
			parameter_specs: map(newParameters, (v, k) => ({
				...v,
				name: k,
				required: v.required !== undefined ? v.required : true,
				pattern: v.pattern ? v.pattern.source : undefined,
			})),
			content_type: AtomistContinuationMimeType,
		} as any;

		await messageClient.respond(response);
		throw new CommandListenerExecutionInterruptError(
			"Prompting for parameters",
		);
	};
}

export class CommandListenerExecutionInterruptError extends Error {
	constructor(public readonly message: string) {
		super(message);
	}
}
