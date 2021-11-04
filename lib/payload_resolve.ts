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

import {
	CommandIncoming,
	EventIncoming,
	SubscriptionIncoming,
	WebhookIncoming,
} from "./payload";
import { googleCloudStoragePayloadResolver } from "./storage/resolver";
import merge = require("lodash.merge");

/**
 * Resolve an incoming payload to the actual incoming message by
 * following 'message_uri' pointers
 */
export async function resolvePayload(pubSubEvent: {
	data: string;
}): Promise<
	(
		| SubscriptionIncoming
		| EventIncoming
		| CommandIncoming
		| WebhookIncoming
	) & { message_uri?: string }
> {
	const json = (await import("json-bigint"))({
		alwaysParseAsBig: false,
		useNativeBigInt: true,
	});

	// overwrite global JSON.parse and stringify methods
	JSON.parse = (
		text: string,
		reviver?: (this: any, key: string, value: any) => any,
	) => {
		const obj = json.parse(text, reviver);
		return merge({}, obj);
	};
	JSON.stringify = json.stringify;

	const payload = JSON.parse(
		Buffer.from(pubSubEvent.data, "base64").toString(),
	);

	if (payload.message_uri) {
		const resolver = ResolverRegistry.resolvers.find(r =>
			r.supports(payload.message_uri),
		);
		if (resolver) {
			const resolvedPayload = await resolvePayload(
				await resolver.resolve(payload.message_uri),
			);
			resolvedPayload.message_uri = payload.message_uri;
			return resolvedPayload;
		} else {
			throw new Error(`Unsupported message_uri provided`);
		}
	} else {
		return payload;
	}
}

export type PayloadResolver = {
	supports: (url: string) => boolean;
	resolve: (url: string) => Promise<{ data: string }>;
};

const ResolverRegistry = {
	resolvers: [googleCloudStoragePayloadResolver(true)],
};

export function setPayloadResolvers(...resolvers: PayloadResolver[]): void {
	ResolverRegistry.resolvers = resolvers;
}
