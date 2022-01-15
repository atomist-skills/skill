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

import * as fs from "fs-extra";

import { Contextual } from "../handler/handler";
import { AuthenticatedRepositoryId } from "../repository/id";
import { handleError } from "../util";
import { CloneOptions } from "./clone";
import { clone, load, Project } from "./project";

export interface ProjectLoader {
	load<C>(
		id: AuthenticatedRepositoryId<C>,
		baseDir: string,
		options?: { userConfig: boolean },
	): Promise<Project<C>>;

	clone<C>(
		id: AuthenticatedRepositoryId<C>,
		options?: CloneOptions,
	): Promise<Project<C>>;
}

export function createProjectLoader(
	ctx?: Pick<Contextual<any, any>, "onComplete">,
): ProjectLoader {
	return new DefaultProjectLoader(ctx);
}

export class DefaultProjectLoader implements ProjectLoader {
	constructor(
		private readonly ctx?: Pick<Contextual<any, any>, "onComplete">,
	) {}

	public async load(
		id: AuthenticatedRepositoryId<any>,
		baseDir: string,
		options?: { userConfig: boolean },
	): Promise<Project> {
		return load(id, baseDir, options);
	}

	public async clone(
		id: AuthenticatedRepositoryId<any>,
		options?: CloneOptions,
	): Promise<Project> {
		const p = await clone(id, options);
		if (this.ctx) {
			this.ctx.onComplete({
				name: "project loader",
				callback: () =>
					handleError(
						async () => fs.remove(p.path()),
						async () => {
							// Intentionally left empty
						},
					),
			});
		}
		return p;
	}
}
