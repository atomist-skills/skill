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

import * as fs from "fs-extra";

import { processCommand, processEvent, processWebhook } from "../function";
import {
	isCommandIncoming,
	isEventIncoming,
	isSubscriptionIncoming,
	isWebhookIncoming,
} from "../payload";

export async function runSkill(skill?: string): Promise<void> {
	const payload = await fs.readJson(
		process.env.ATOMIST_PAYLOAD || "/atm/payload.json",
	);
	if (isEventIncoming(payload)) {
		if (skill) {
			payload.extensions.operationName = skill;
		}
		await processEvent(payload, {} as any);
	} else if (isSubscriptionIncoming(payload)) {
		if (skill) {
			payload.subscription.name = skill;
		}
		await processEvent(payload, {} as any);
	} else if (isCommandIncoming(payload)) {
		if (skill) {
			payload.command = skill;
		}
		await processCommand(payload, {} as any);
	} else if (isWebhookIncoming(payload)) {
		await processWebhook(payload, {} as any);
	}
}
