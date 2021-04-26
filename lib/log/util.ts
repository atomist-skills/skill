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

import { createLogger } from "@atomist/skill-logging";

import { Contextual } from "../handler/handler";
import { handleErrorSync } from "../util";
import { clearLogger, setLogger } from "./console";

export function initLogging(
	context: {
		eventId?: string;
		correlationId: string;
		workspaceId: string;
		skillId: string;
	},
	onComplete: (callback: () => Promise<void>) => void,
	labels: Record<string, any> = {},
): void {
	const logger = createLogger(context, labels);
	setLogger(logger);
	onComplete(async () => {
		await logger.close();
		clearLogger();
	});
}

enum Level {
	error = 0,
	warn = 1,
	info = 2,
	debug = 3,
}

export function enabled(level: string): boolean {
	const configuredLevel = Level[process.env.ATOMIST_LOG_LEVEL || "debug"];
	return configuredLevel >= Level[level];
}

export function url(ctx: Contextual<any, any>): string {
	return `https://go.atomist.${
		(process.env.ATOMIST_GRAPHQL_ENDPOINT || "").includes("staging")
			? "services"
			: "com"
	}/log/${ctx.workspaceId}/${ctx.correlationId}`;
}

export function runtime(): {
	node: {
		version: string;
	};
	skill: {
		version: string;
		sha: string;
		date: string;
	};
	host: {
		sha: string;
		date: string;
	};
} {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const gitInfo = require("../../git-info.json");
	const nodeVersion = process.version;
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const packageJson = require("../../package.json");
	const hostGitInfo =
		handleErrorSync(
			() => require("../../../../../git-info.json"),
			() => {
				// intentionally left empty
			},
		) || {};
	return {
		node: {
			version: nodeVersion.replace(/v/g, ""),
		},
		skill: {
			version: packageJson.version,
			sha: gitInfo.sha,
			date: gitInfo.date,
		},
		host: {
			sha: hostGitInfo.sha,
			date: hostGitInfo.date,
		},
	};
}
