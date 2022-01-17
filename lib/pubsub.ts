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

import { GoogleAuth } from "google-auth-library";

import { createHttpClient } from "./http";
import { warn } from "./log/index";
import { retry } from "./retry";
import { isStaging } from "./util";

/**
 * Message to be published to a Google PubSub topic
 */
export interface PubSubMessage {
	data: string | Buffer | any;
	orderingKey?: string;
}

/** Publish a message to a Google PubSub topic */
export interface PubSubPublisher {
	publish(message: PubSubMessage): Promise<string>;
}

const publishers: Map<string, PubSubPublisher> = new Map();

/**
 * Create a [[PubSubPublisher]] instance for a given topic
 */
export function createPubSubPublisher(
	options: { topic?: string } = {},
): PubSubPublisher {
	const topicName =
		options?.topic ||
		process.env.ATOMIST_TOPIC ||
		`${this.ctx.workspaceId}-${this.request.skill.id}-response`;
	if (!publishers.has(topicName)) {
		const projectId = isStaging()
			? "atomist-skill-staging"
			: "atomist-skill-production";
		const url = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${topicName}:publish`;
		const auth = new GoogleAuth({
			scopes: "https://www.googleapis.com/auth/cloud-platform",
		});
		const http = createHttpClient();
		publishers.set(topicName, {
			publish: async message => {
				let data;
				if (typeof message.data === "string") {
					data = message.data;
				} else if (Buffer.isBuffer(message.data)) {
					data = message.data.toString("base64");
				} else {
					data = Buffer.from(JSON.stringify(message.data)).toString(
						"base64",
					);
				}
				const body = {
					messages: [
						{
							data,
							ordering_key: message.orderingKey,
						},
					],
				};
				return (await retry<string>(async () => {
					const response = await (
						await http.request<{ messageIds: string[] }>(url, {
							method: "POST",
							body: JSON.stringify(body),
							headers: {
								"content-type": "application/json",
								"authorization": `Bearer ${await auth.getAccessToken()}`,
							},
						})
					).json();
					if (response?.messageIds?.length > 0) {
						return response.messageIds[0];
					} else {
						warn(
							`Error sending message, retrying: ${JSON.stringify(
								response,
							)}`,
						);
						throw new Error(response);
					}
				})) as any;
			},
		});
	}
	return publishers.get(topicName);
}
