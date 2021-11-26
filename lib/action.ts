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

import { OnAttachmentActionSubscription } from "./definition/subscription/typings/types";
import { processCommand } from "./function";
import { EventHandler } from "./handler/handler";
import { wrapEventHandler } from "./handler/util";
import { CommandIncoming } from "./payload";
import { success } from "./status";
import { handlerLoader } from "./util";

export function eventHandlerLoader<EventHandler>(
	type: string,
): (name: string, cwd?: string) => Promise<EventHandler> {
	const hl = handlerLoader<EventHandler>(type);
	return async (name: string, cwd?: string): Promise<EventHandler> => {
		if (name === "onAttachmentAction") {
			return onAttachmentAction as any;
		} else {
			const eh = await hl(name, cwd);
			return wrapEventHandler(eh as any) as any;
		}
	};
}

const UpdateTaskStateMutation = `mutation updateTaskState($id: ID!, $state: AtmJobTaskState!){
  setAtmJobTaskState(id: $id, jobTaskState: { state: $state }) {
    id
  }
}`;

const onAttachmentAction: EventHandler<
	OnAttachmentActionSubscription,
	any
> = async ctx => {
	const trigger = ctx.trigger;
	const task = ctx.data.AtmJobTask?.[0];

	const data: {
		configuration: string;
		payload: CommandIncoming;
	} = JSON.parse(task.data);

	if (data.configuration !== ctx.configuration.name) {
		return success(`Not running command for configuration`).hidden();
	}

	const payload = data.payload;
	payload.skill = trigger.skill;
	payload.secrets = trigger.secrets;

	try {
		const result = await processCommand(payload, {
			eventId: ctx.executionId,
		});
		await ctx.graphql.mutate(UpdateTaskStateMutation, {
			id: task.id,
			state: "success",
		});
		return result;
	} catch (e) {
		await ctx.graphql.mutate(UpdateTaskStateMutation, {
			id: task.id,
			state: "failed",
		});
		throw e;
	}
};
