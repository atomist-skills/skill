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

import { GitHubAppCredential, GitHubCredential } from "../secret/provider";

export enum RepositoryProviderType {
	GitHubCom,
	GitHubEnterprise,
}

export interface RepositoryId {
	sourceId?: string;
	owner: string;
	repo: string;

	branch?: string;
	sha?: string;

	type: RepositoryProviderType;
	apiUrl?: string;
	gitUrl?: string;
}

export interface AuthenticatedRepositoryId<T> extends RepositoryId {
	credential: T;

	cloneUrl(): string;
}

export function gitHubComRepository(details: {
	owner: string;
	repo: string;
	branch?: string;
	sha?: string;
	sourceId?: string;
	credential: GitHubCredential | GitHubAppCredential;
}): AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential> {
	return {
		...details,
		type: RepositoryProviderType.GitHubCom,
		cloneUrl: (): string => {
			if (details.credential) {
				// GitHub App tokens start with v1. and are expected in the password field
				// See https://github.blog/changelog/2021-03-31-authentication-token-format-updates-are-generally-available/
				if (
					details.credential.token.startsWith("v1.") ||
					details.credential.token.startsWith("ghu_") ||
					details.credential.token.startsWith("ghs_") ||
					details.credential.token.startsWith("ghr_")
				) {
					return `https://atomist:${details.credential.token}@github.com/${details.owner}/${details.repo}.git`;
				} else {
					return `https://${details.credential.token}:x-oauth-basic@github.com/${details.owner}/${details.repo}.git`;
				}
			} else {
				return `https://github.com/${details.owner}/${details.repo}.git`;
			}
		},
	};
}
