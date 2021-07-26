import { entity, entityRefs } from "../datalog/util";
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
	if (annotations.length === 0) {
		return;
	}

	const repo = (
		await api(id).repos.get({
			owner: id.owner,
			repo: id.repo,
		})
	).data;

	const annotationsByPath = groupBy(annotations, "path");

	const entities = [
		entity("git/repo", "$repo", {
			"sourceId": repo.id.toString(),
			"git.provider/url": "https://github.com",
		}),
		entity("git/commit", "$commit", {
			"sha": id.sha,
			"repo": "$repo",
			"git.provider/url": "https://github.com",
		}),
		entity("sarif/run", "$sarif-run", {
			"commit": "$commit",
			"sarif.tool.driver/name": "atomist",
		}),
	];

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
				? ":sarif.result.level/error"
				: annotationsByPath[path].find(
						a => a.annotationLevel === "warning",
				  )
				? ":sarif.result.level/warning"
				: ":sarif.result.level/note",
			"kind": ":sarif.kind.result/open",
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
}
