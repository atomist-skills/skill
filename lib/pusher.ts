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
import Pusher from "pusher-js/with-encryption";

import { createContext } from "./context";
import { configurableEntryPoint } from "./function";
import { EventHandler } from "./handler/index";
import { createHttpClient } from "./http";
import { EventIncoming } from "./payload";

export async function subscribe(
	options: {
		namespace: string;
		name: string;
		version?: string;
		workspaceId: string;
		apiKey: string;
		debug?: boolean;
	},
	handlers: Record<string, EventHandler>,
): Promise<void> {
	// activate skill if it isn't configured in workspace
	const http = createHttpClient();
	const url = `https://automation.atomist.com/graphql/team/${options.workspaceId}`;
	const graphql = {
		headers: { Authorization: `Bearer ${options.apiKey}` },
	};
	const configuredSkill = await (
		await http.post<{ data: { activeSkill: { id: string } } }>(url, {
			...graphql,
			body: `query configuredSkill {
  activeSkill(namespace:"${options.namespace}", name:"${options.name}") {
    id
  }
}`,
		})
	).json();

	if (!configuredSkill?.data?.activeSkill?.id) {
		await http.post(url, {
			...graphql,
			body: `mutation configureSkill {
  saveSkillConfiguration(namespace: "${options.namespace}", name: "${
				options.name
			}", version: ${
				options.version ? `"${options.version}"` : "null"
			}, configuration: {displayName: "Docker Desktop Extension", name: "auto_configured_extension", enabled: true}) {
    configured {
      skills {
        id
      }
    }
  }
}
`,
		});
	}

	Pusher.logToConsole = options.debug;

	const pusher = new Pusher("e7f313cb5f6445399f58", {
		cluster: "mt1",
		channelAuthorization: {
			endpoint: "https://api.atomist.com/pusher/channel/auth",
			headers: {
				Authorization: `Bearer ${options.apiKey}`,
			},
		} as any,
	});

	const channel = pusher.subscribe(
		`private-encrypted-${options.workspaceId.toLowerCase()}_${
			options.namespace
		}_${options.name}`,
	);
	channel.bind("execution-trigger", async data => {
		await handlePusherEvent(data, handlers);
	});
}

async function handlePusherEvent(data, handlers: Record<string, EventHandler>) {
	let event: EventIncoming = parseEDNString(data, {
		mapAs: "object",
		keywordAs: "string",
		listAs: "array",
	}) as any;

	if (event["compact?"]) {
		const response = await (
			await createHttpClient().get(event.urls.trigger, {
				headers: { Authorization: `Bearer ${event.token}` },
			})
		).text();
		const context: EventIncoming = parseEDNString(response, {
			mapAs: "object",
			keywordAs: "string",
			listAs: "array",
		}) as any;
		event = {
			...event,
			...context,
		};
	}

	await configurableEntryPoint(event, createContext, async name => {
		return handlers[name];
	});
}
