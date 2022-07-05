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

import { toEdnString } from "../datalog/transact";
import { asKeyword } from "../datalog/util";
import { HttpClient } from "../http";
import { EventIncoming } from "../payload";
import { EventContext, State, Status } from "./handler";

export interface StatusPublisher {
	publish(status: Status): Promise<void>;
}

export function createStatusPublisher(
	payload: EventIncoming,
	http: HttpClient,
): StatusPublisher {
	return {
		publish: async (status: Status) => {
			await http.request(payload.urls.execution, {
				method: "PATCH",
				body: toEdnString({
					status: {
						state: asKeyword(status.state),
						reason: status.reason,
					},
				}),
				headers: {
					"authorization": `Bearer ${payload.token}`,
					"content-type": `application/edn`,
				},
			});
		},
	};
}

export function prepareStatus(
	status: Status | Error,
	ctx: EventContext,
): Status {
	if (status instanceof Error) {
		return {
			state: State.Failed,
			reason: `Error invoking ${ctx.event.skill.namespace}/${ctx.event.skill.name}`,
		};
	} else {
		const reason = `${
			status?.state === State.Failed ? "Successfully" : "Unsuccessfully"
		} invoked ${ctx.event.skill.namespace}/${ctx.event.skill.name}@${
			ctx.event.context.subscription?.name ||
			ctx.event.context.webhook?.name
		}`;
		return {
			state: status?.state || State.Completed,
			reason: status?.reason || reason,
		};
	}
}
