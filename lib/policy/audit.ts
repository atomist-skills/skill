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

import { asKeyword, entity, entityRefs } from "../datalog/util";
import { api } from "../github/operation";
import { Contextual } from "../handler/handler";
import { AuthenticatedRepositoryId } from "../repository/id";
import { Annotation } from "./policy";

import groupBy = require("lodash.groupby");

export async function transactAudit(
	ctx: Contextual<any, any>,
	id: AuthenticatedRepositoryId<any>,
	ruleId: string,
	message: string,
	annotations: Annotation[],
): Promise<void> {
	let repoId;
	if (id?.sourceId) {
		repoId = id.sourceId;
	} else {
		repoId = (
			await api(id).repos.get({
				owner: id.owner,
				repo: id.repo,
			})
		).data.id.toString();
	}
	const entities = [
		entity("git/repo", "$repo", {
			"sourceId": repoId,
			"git.provider/url": "https://github.com",
		}),
		entity("git/commit", "$commit", {
			"sha": id.sha,
			"repo": "$repo",
			"git.provider/url": "https://github.com",
		}),
		entity("sarif/run", "$sarif-run", {
			"commit": "$commit",
			"sarif.tool.driver/name": `${ctx.skill.namespace}/${ctx.skill.name}#${ruleId}`,
		}),
	];

	if (annotations?.length > 0) {
		const annotationsByPath = groupBy(annotations, "path");
		for (const path in annotationsByPath) {
			const locationEntities = annotationsByPath[path].map(a =>
				entity("sarif/physical-location", {
					"uri": a.path,
					"sarif.physical-location.region/startLine": a.startLine,
				}),
			);
			const sarifResultEntity = entity("sarif/result", "$result", {
				"run": "$sarif-run",
				ruleId,
				"level": annotationsByPath[path].find(
					a => a.annotationLevel === "failure",
				)
					? asKeyword("sarif.result.level/error")
					: annotationsByPath[path].find(
							a => a.annotationLevel === "warning",
					  )
					? asKeyword("sarif.result.level/warning")
					: asKeyword("sarif.result.level/note"),
				"kind": annotationsByPath[path].find(
					a => a.annotationLevel === "failure",
				)
					? asKeyword("sarif.result.kind/fail")
					: annotationsByPath[path].find(
							a => a.annotationLevel === "warning",
					  )
					? asKeyword("sarif.result.kind/review")
					: asKeyword("sarif.result.kind/open"),
				"sarif.result.message/text": message,
				"locations": {
					set: entityRefs(locationEntities),
				},
			});
			const gitFileEntity = entity("git/file", {
				path,
				sha: annotationsByPath[path][0].sha,
				scanResults: {
					add: ["$result"],
				},
			});
			await ctx.datalog.transact([
				...entities,
				...locationEntities,
				sarifResultEntity,
				gitFileEntity,
			]);
		}
	} else {
		await ctx.datalog.transact(entities);
	}
}
