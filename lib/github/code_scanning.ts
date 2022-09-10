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

import * as fs from "fs-extra";

import { EventContext } from "../handler/handler";
import { debug } from "../log/console";
import { url } from "../log/util";
import { AuthenticatedRepositoryId } from "../repository/id";
import { GitHubAppCredential, GitHubCredential } from "../secret/provider";
import { Annotation } from "./check";
import { api } from "./operation";

/**
 * Uploads provided annotations as code scanning results to GitHub.
 * Alternatively provide a path to a valid Sarif file.
 */
export async function uploadCodeScanningResults(
	ctx: EventContext,
	id: AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
	results: Array<Annotation & { snippet?: string }> | string,
): Promise<void> {
	let sarif;
	if (typeof results === "string") {
		sarif = (await fs.readFile(results)).toString();
	} else {
		sarif = JSON.stringify({
			runs: [
				{
					tool: {
						driver: {
							name: `${ctx.event.skill.namespace}/${ctx.event.skill.name}`,
							version: ctx.event.skill.version,
							informationUri: url(ctx),
							semanticVersion: ctx.event.skill.version,
						},
					},
					invocations: [
						{
							executionSuccessful: true,
							endTimeUtc: new Date().toISOString(),
						},
					],
					results: results.map(r => ({
						message: {
							text: r.message,
						},
						locations: [
							{
								physicalLocation: {
									region: {
										snippet: {
											text: r.snippet,
										},
										startLine: r.startLine,
										startColumn: r.startColumn,
										endLine: r.endLine,
										endColumn: r.endColumn,
									},
									artifactLocation: {
										uri: r.path,
									},
								},
							},
						],
					})),
				},
			],
			version: "2.1.0",
			$schema:
				"https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
		});
	}

	const zlib = await import("zlib");
	const util = await import("util");

	const zipped = (await util.promisify(zlib.gzip)(sarif)).toString("base64");
	try {
		await api(id).codeScanning.uploadSarif({
			owner: id.owner,
			repo: id.repo,
			commit_sha: id.sha,
			ref: `refs/heads/${id.branch}`,
			sarif: zipped,
			tool_name: `${ctx.event.skill.namespace}/${ctx.event.skill.name}`,
		});
	} catch (e) {
		debug(`Uploading code scanning results failed: ${e.message}`);
	}
}
