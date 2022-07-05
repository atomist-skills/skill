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

export enum DockerRegistryType {
	Ecr = "ECR",
	Gar = "GAR",
	Gcr = "GCR",
	Ghcr = "GHCR",
	DockerHub = "DOCKER_HUB",
}

export interface DockerRegistry {
	"docker.registry/type": DockerRegistryType;
	"docker.registry/secret": string;
	"docker.registry/username": string;
	"docker.registry/server-url": string;
	"docker.registry.gcr/service-account": string;
	"docker.registry.gar/service-account": string;
	"docker.registry.ecr/arn": string;
	"docker.registry.ecr/external-id": string;
	"docker.registry.ecr/region": string;
}

export interface OnPush {
	"git.commit/repo": {
		"git.repo/name": string;
		"git.repo/source-id": string;
		"git.repo/default-branch": string;
		"git.repo/org": {
			"git.org/installation-token": string;
			"git.org/name": string;
			"git.provider/url": string;
		};
	};
	"git.commit/author": {
		"git.user/name": string;
		"git.user/login": string;
	};
	"git.commit/sha": string;
	"git.ref/refs": Array<{
		"git.ref/name": string;
		"git.ref/type": { "db/ident": string };
	}>;
}

export type OrderedList = Array<{ ordinal: number; string: string }>;

import sortBy = require("lodash.sortby");

export function orderedListToArray(list: OrderedList): string[] {
	return sortBy(list, "ordinal").map(l => l.string);
}
