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

import * as fs from "fs-extra";
import * as path from "path";

import { createContext, loggingCreateContext } from "../context";
import {
	configurableEntryPoint,
	processCommand,
	processEvent,
	processWebhook,
} from "../function";
import { debug } from "../log/console";
import { runtime } from "../log/util";
import {
	isCommandIncoming,
	isEventIncoming,
	isSubscriptionIncoming,
	isWebhookIncoming,
} from "../payload";

export async function runSkill(skill?: string): Promise<void> {
	const payloadPath = process.env.ATOMIST_PAYLOAD;
	if (!payloadPath) {
		const nm = await (
			await import("find-up")
		)("node_modules", { cwd: __dirname, type: "directory" });
		process.chdir(path.dirname(nm));

		const express = await import("express");
		const bodyParser = await import("body-parser");
		const port = process.env.PORT || 8080;

		const app = express();
		// eslint-disable-next-line deprecation/deprecation
		app.use(bodyParser.json({ limit: "1024mb" }));

		app.post("/", async (req, res) => {
			const message = req.body.message;
			const eventId = message.messageId;
			const traceId = req.get("x-cloud-trace-context");
			const start = Date.now();

			try {
				await configurableEntryPoint(
					message,
					{
						eventId,
					},
					loggingCreateContext(createContext, {
						payload: true,
						traceId: traceId ? traceId.split("/")[0] : undefined,
						before: () => debug("Cloud Run execution started"),
						after: async () =>
							debug(
								`Cloud Run execution took ${
									Date.now() - start
								} ms, finished with status: 'ok'`,
							),
					}),
				);
			} catch (e) {
				// Ignore
			} finally {
				res.sendStatus(201);
			}
		});

		app.listen(port, () => {
			const rt = runtime();
			console.log(
				"Starting http listener atomist/skill:%s (%s) nodejs:%s",
				rt.skill.version,
				rt.skill.sha.slice(0, 7),
				rt.node.version,
			);
		});
	} else {
		process.chdir(process.env.ATOMIST_HOME || "/atm/home");

		const payload = await fs.readJson(payloadPath || "/atm/payload.json");
		const ctx = { eventId: process.env.ATOMIST_EVENT_ID };

		if (isEventIncoming(payload)) {
			if (skill) {
				payload.extensions.operationName = skill;
			}
			await processEvent(payload, ctx);
		} else if (isSubscriptionIncoming(payload)) {
			if (skill) {
				payload.subscription.name = skill;
			}
			await processEvent(payload, ctx);
		} else if (isCommandIncoming(payload)) {
			if (skill) {
				payload.command = skill;
			}
			await processCommand(payload, ctx);
		} else if (isWebhookIncoming(payload)) {
			await processWebhook(payload, ctx);
		}
	}
}
