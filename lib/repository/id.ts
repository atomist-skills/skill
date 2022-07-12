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

import { OnPush } from "../definition/subscription/common_types";
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

export function fromRepo(
	repo: OnPush["git.commit/repo"],
): AuthenticatedRepositoryId<GitHubAppCredential> {
	return gitHubComRepository({
		owner: repo["git.repo/org"]["git.org/name"],
		repo: repo["git.repo/name"],
		sourceId: repo["git.repo/source-id"],
		credential: {
			token: repo["git.repo/org"]["git.org/installation-token"],
			permissions: {},
		},
	}) as any;
}

export function fromCommit(
	commit: OnPush,
): AuthenticatedRepositoryId<GitHubAppCredential> {
	const branch = commit["git.ref/refs"]?.find(
		r => r["git.ref/type"]["db/ident"] === "git.ref.type/branch",
	)?.["git.ref/name"];
	return gitHubComRepository({
		owner: commit["git.commit/repo"]["git.repo/org"]["git.org/name"],
		repo: commit["git.commit/repo"]["git.repo/name"],
		sourceId: commit["git.commit/repo"]["git.repo/source-id"],
		sha: commit["git.commit/sha"],
		branch,
		credential: {
			token: commit["git.commit/repo"]["git.repo/org"][
				"git.org/installation-token"
			],
			permissions: {},
		},
	}) as any;
}
