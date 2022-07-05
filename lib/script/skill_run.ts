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

import { parseEDNString } from "edn-data";
import * as path from "path";

import { createContext, loggingCreateContext } from "../context";
import { configurableEntryPoint } from "../function";
import { EventHandler } from "../handler/handler";
import { debug } from "../log/console";
import { runtime } from "../log/util";
import { EventIncoming } from "../payload";

export const start = runSkill;

export async function runSkill(
	handlers?: Record<string, EventHandler>,
): Promise<void> {
	const nm = await (
		await import("find-up")
	)("node_modules", { cwd: __dirname, type: "directory" });
	process.chdir(path.dirname(nm));

	const express = await import("express");
	const bodyParser = await import("body-parser");
	const port = process.env.PORT || 8080;

	const app = express();
	app.use(bodyParser.raw({ type: "application/edn" }));

	app.post("/", async (req, res) => {
		const start = Date.now();
		const message: Buffer = req.body;
		const event: EventIncoming = parseEDNString(message.toString(), {
			mapAs: "object",
			keywordAs: "string",
			listAs: "array",
		}) as any;

		try {
			await configurableEntryPoint(
				event,
				loggingCreateContext(createContext, {
					payload: true,
					before: () => debug("Skill execution started"),
					after: {
						name: "skill run",
						priority: Number.MAX_SAFE_INTEGER - 100,
						callback: async () =>
							debug(
								`Skill execution took ${Date.now() - start} ms`,
							),
					},
				}),
				handlers
					? async name => {
							return handlers[name];
					  }
					: undefined,
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
}
