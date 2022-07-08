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

import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

import { EventContext } from "../handler/handler";
import { dsoUrl, url } from "../log/util";
import { AuthenticatedRepositoryId } from "../repository/id";
import { GitHubAppCredential, GitHubCredential } from "../secret/provider";
import { isStaging } from "../util";
import { api, formatFooter, formatMarkers } from "./operation";
import chunk = require("lodash.chunk");
import sortBy = require("lodash.sortby");

export interface CreateCheck {
	sha: string;
	name: string;
	title: string;
	body: string;
	details?: string;
	startedAt?: string;
	reuse?: boolean;
	longRunning?: boolean;
	detailsUrl?: string;
}

export interface UpdateCheck {
	conclusion?:
		| "success"
		| "failure"
		| "neutral"
		| "cancelled"
		| "skipped"
		| "timed_out"
		| "action_required";
	body?: string;
	details?: string;
	annotations?: Annotation[];
	actions?: Array<{
		label: string;
		description: string;
		identifier: string;
	}>;
}

export interface Annotation {
	path: string;
	startLine: number;
	endLine: number;
	startColumn?: number;
	endColumn?: number;
	annotationLevel: "notice" | "warning" | "failure";
	message: string;
	title?: string;
}

export interface Check {
	data:
		| RestEndpointMethodTypes["checks"]["create"]["response"]["data"]
		| RestEndpointMethodTypes["checks"]["update"]["response"]["data"];
	update: (parameters: UpdateCheck) => Promise<void>;
}

export async function createCheck(
	ctx: EventContext,
	id: AuthenticatedRepositoryId<GitHubCredential | GitHubAppCredential>,
	parameters: CreateCheck,
): Promise<Check> {
	let terminated = false;
	const externalId =
		ctx.event.context.subscription?.metadata?.[
			"after-basis-t"
		]?.toString() || ctx.event["execution-id"];
	// Check if there is a check open with that name
	const openChecks = (
		await api(id, ctx).checks.listForRef({
			owner: id.owner,
			repo: id.repo,
			ref: parameters.sha,
			check_name: parameters.name,
			status: parameters.reuse ? undefined : "in_progress",
			filter: "latest",
		})
	).data;

	ctx.onComplete({
		name: "github check",
		callback: async () => {
			if (!terminated && check && !parameters.longRunning) {
				await api(id, ctx).checks.update({
					owner: id.owner,
					repo: id.repo,
					check_run_id: check.data.id,
					conclusion: "failure",
					completed_at: new Date().toISOString(),
					status: "completed",
				});
				terminated = true;
			}
		},
	});

	let check:
		| RestEndpointMethodTypes["checks"]["create"]["response"]
		| RestEndpointMethodTypes["checks"]["update"]["response"];

	// Work around issues with our staging bot trying to update checks from production
	const app = isStaging() ? "atomista" : "atomist";
	const openCheck = openChecks?.check_runs?.find(cr => cr.app.slug === app);
	if (openCheck) {
		check = await api(id, ctx).checks.update({
			owner: id.owner,
			repo: id.repo,
			check_run_id: openCheck.id,
			started_at: parameters.startedAt || new Date().toISOString(),
			external_id: externalId,
			details_url:
				parameters.detailsUrl ||
				(ctx.event.skill.configuration?.atomist?.policy
					? dsoUrl(ctx)
					: url(ctx)),
			status: "in_progress",
			conclusion: undefined,
			output: {
				title: parameters.title,
				summary: truncateText(
					`${parameters.body}\n${formatFooter(ctx)}\n${formatMarkers(
						ctx,
					)}`,
				),
				details: parameters.details
					? truncateText(parameters.details)
					: undefined,
				annotations: [],
			},
		});
	} else {
		check = await api(id, ctx).checks.create({
			owner: id.owner,
			repo: id.repo,
			head_sha: parameters.sha,
			name: parameters.name,
			started_at: parameters.startedAt || new Date().toISOString(),
			external_id: externalId,
			details_url:
				parameters.detailsUrl ||
				(ctx.event.skill.configuration?.atomist?.policy
					? dsoUrl(ctx)
					: url(ctx)),
			status: "in_progress",
			output: {
				title: parameters.title,
				summary: truncateText(
					`${parameters.body}\n${formatFooter(ctx)}\n${formatMarkers(
						ctx,
					)}`,
				),
				details: parameters.details
					? truncateText(parameters.details)
					: undefined,
				annotations: [],
			},
		});
	}
	return {
		data: check.data,
		update: async params => {
			const gh = api(id, ctx);
			const output = {
				title: check.data.output.title,
				summary: truncateText(
					params.body
						? `${params.body}\n${formatFooter(
								ctx,
						  )}\n${formatMarkers(ctx)}`
						: check.data.output.summary,
				),
				details: parameters.details
					? truncateText(parameters.details)
					: undefined,
			};
			const chunks = chunk(
				sortBy(
					(params.annotations || []).map(c => ({
						annotation_level: c.annotationLevel,
						title: c.title,
						end_column: c.endColumn,
						end_line: c.endLine,
						message: c.message,
						path: c.path,
						start_column: c.startColumn,
						start_line: c.startLine,
					})),
					["path", "start_line", "start_column", "title", "message"],
				),
				50,
			);
			for (const ch of chunks) {
				await gh.checks.update({
					owner: id.owner,
					repo: id.repo,
					check_run_id: check.data.id,
					output: {
						...output,
						annotations: ch,
					},
				});
			}
			await gh.checks.update({
				owner: id.owner,
				repo: id.repo,
				check_run_id: check.data.id,
				conclusion: params.conclusion,
				completed_at: params.conclusion
					? new Date().toISOString()
					: undefined,
				status: params.conclusion ? "completed" : "in_progress",
				output,
				actions: params.actions,
			});
			if (params.conclusion) {
				terminated = true;
			}
		},
	};
}

/**
 * Truncate the text to the desired number of bytes. Characters are
 * removed from the middle of the text and replaced with an ellipsis.
 */
export function truncateText(text: string, length = 65535): string {
	const trimmed = text.trim();
	if (Buffer.byteLength(trimmed) <= length) {
		return trimmed;
	}

	const ellipsis = " ... ";
	const retain = Math.floor((length - ellipsis.length) / 2);
	const chunks = [
		trimmed.slice(0, retain + 1).trim(),
		trimmed.slice(-1 * retain).trim(),
	];

	let trimIndex = 1;
	while (Buffer.byteLength(`${chunks[0]}${ellipsis}${chunks[1]}`) > length) {
		if (trimIndex === 0) {
			chunks[0] = chunks[0].slice(0, chunks[0].length - 1).trim();
			trimIndex = 1;
		} else {
			chunks[1] = chunks[1].slice(1).trim();
			trimIndex = 0;
		}
	}

	return `${chunks[0]}${ellipsis}${chunks[1]}`;
}
