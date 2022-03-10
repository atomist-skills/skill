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

import { GraphQLClient } from "../graphql";
import {
	CommandIncoming,
	EventIncoming,
	SubscriptionIncoming,
	WebhookIncoming,
} from "../payload";

export type CredentialResolver<T> = (
	graphClient: GraphQLClient,
	payload:
		| CommandIncoming
		| EventIncoming
		| WebhookIncoming
		| SubscriptionIncoming,
) => Promise<T>;

export interface GitHubCredential {
	token: string;
	scopes: string[];
}

export interface GitHubAppCredential {
	token: string;
	permissions: Record<string, "write" | "read">;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isGitHubCredential(spec: any): spec is GitHubCredential {
	return !!spec.token && !!spec.scopes;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isGitHubAppCredential(spec: any): spec is GitHubAppCredential {
	return !!spec.token && !!spec.permissions;
}

export interface CredentialProvider {
	resolve<T>(spec: CredentialResolver<T>): Promise<T | undefined>;

	apiKey: string;
}

export class DefaultCredentialProvider implements CredentialProvider {
	constructor(
		private readonly _apiKey: string,
		private readonly graphClient: GraphQLClient,
		private readonly payload:
			| CommandIncoming
			| EventIncoming
			| WebhookIncoming
			| SubscriptionIncoming,
	) {}

	public async resolve<T>(spec: CredentialResolver<T>): Promise<T> {
		return spec(this.graphClient, this.payload);
	}

	get apiKey() {
		return this._apiKey;
	}
}
