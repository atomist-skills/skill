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

import { Check } from "../github/check";
import { api } from "../github/operation";
import { commentPullRequest } from "../github/pull_request";
import { EventContext, EventHandler, HandlerStatus } from "../handler/handler";
import {
	chain,
	ChainedHandler,
	cloneFiles,
	cloneRef,
	createCheck,
	createRef,
	CreateRepositoryId,
} from "../handler/util";
import { SubscriptionIncoming } from "../payload";
import { CloneOptions } from "../project/clone";
import { Project } from "../project/project";
import { AuthenticatedRepositoryId } from "../repository/id";
import { success } from "../status";
import { isStaging } from "../util";
import { markdownLink } from "./badge";
import { Action, Annotation, Conclusion, Severity } from "./policy";

export type CreatePolicyRun<D, C> = (ctx: EventContext<D, C>) => {
	name?: string;
	title: string;
};

export interface PolicyDetails {
	name: string;
	title: string;
	body: string;
}

function createDetails<D, C>(
	options: (ctx: EventContext<D, C>) => PolicyDetails,
): ChainedHandler<D, C, { details?: PolicyDetails }> {
	return async ctx => {
		ctx.chain.details = options(ctx as any);
	};
}

export function whenAll<S, C>(
	...whens: Array<(ctx: EventContext<S, C>) => HandlerStatus | undefined>
): (ctx: EventContext<S, C>) => HandlerStatus | undefined {
	return ctx => {
		for (const when of whens) {
			const result = when(ctx);
			if (result) {
				return result;
			}
		}
		return undefined;
	};
}

export function whenParameter<S, C>(
	parameterName: string,
	message?: string,
): (ctx: EventContext<S, C>) => HandlerStatus | undefined {
	return ctx => {
		if (ctx.configuration.parameters[parameterName] !== true) {
			return success(
				message
					? message
					: `Configuration parameter _${parameterName}_ not enabled`,
			).hidden();
		}
		return undefined;
	};
}

export function checkHandler<S, C>(parameters: {
	when?: (ctx: EventContext<S, C>) => HandlerStatus | undefined;
	id: CreateRepositoryId<S, C>;
	clone?: (ctx: EventContext<S, C>) => CloneOptions | string[] | boolean;
	details: (ctx: EventContext<S, C>) => {
		name: string;
		title: string;
		body: string;
	};
	execute: (
		ctx: EventContext<S, C> & {
			chain: {
				id: AuthenticatedRepositoryId<any>;
				details: PolicyDetails;
				check: Check;
				project?: Project;
			};
		},
	) => Promise<{
		conclusion?: Conclusion;
		severity?: Severity;
		message?: string;
		body?: string;
		comment?: (pr: { url: string; number: number }) => string;
		annotations?: Annotation[];
		actions?: Action[];
		status: HandlerStatus;
	}>;
}): EventHandler<S, C> {
	return chain<
		S,
		C,
		{
			id: AuthenticatedRepositoryId<any>;
			details: PolicyDetails;
			check: Check;
			project?: Project;
		}
	>(
		async ctx => {
			if (parameters.when) {
				return parameters.when(ctx);
			}
			return undefined;
		},
		createRef<S, C>(parameters.id),
		async ctx => {
			if (parameters.clone) {
				try {
					const cloneResult = parameters.clone(ctx);
					if (Array.isArray(cloneResult)) {
						await cloneFiles(cloneResult as any)(ctx);
					} else if (typeof cloneResult === "boolean") {
						await cloneRef()(ctx);
					} else {
						await cloneRef(cloneResult as any)(ctx);
					}
				} catch (e) {
					return success(
						`Failed to clone ${ctx.chain.id.owner}/${
							ctx.chain.id.repo
						}#${
							ctx.chain.id.sha?.slice(0, 7) || ctx.chain.id.branch
						}`,
					).hidden();
				}
			}
			return undefined;
		},
		createDetails<S, C>(parameters.details),
		async ctx => {
			const app = isStaging() ? "atomista" : "atomist";
			const tx = (ctx.trigger as SubscriptionIncoming).subscription.tx;
			const checks = (
				await api(ctx.chain.id).checks.listForRef({
					owner: ctx.chain.id.owner,
					repo: ctx.chain.id.repo,
					ref: ctx.chain.id.sha,
					check_name: ctx.chain.details.name,
					filter: "latest",
				})
			).data;
			if (
				checks.check_runs
					.filter(c => c.app.slug === app)
					.filter(c => !isNaN(+c.external_id))
					.some(c => +c.external_id > tx)
			) {
				return success(
					"Skipping execution of outdated subscription result",
				).hidden();
			}
			return undefined;
		},
		createCheck<S, C>(async (ctx: any) => ({
			name: ctx.chain.details.name,
			title: ctx.chain.details.title,
			body: `${await markdownLink({
				sha: ctx.chain.id.sha,
				workspace: ctx.workspaceId,
				name: ctx.chain.details.name,
				title: ctx.chain.details.title,
			})}\n\n${
				ctx.chain.details.body ? `\n\n${ctx.chain.details.body}` : ""
			}`,
		})),
		async ctx => {
			const result = await parameters.execute(ctx);

			const badge = await markdownLink({
				sha: ctx.chain.id.sha,
				workspace: ctx.workspaceId,
				name: ctx.chain.details.name,
				title: ctx.chain.details.title,
				conclusion: result.conclusion,
				severity: result.severity,
			});

			const body = `${badge}${result.body ? `\n\n${result.body}` : ""}`;
			await ctx.chain.check.update({
				conclusion: result.conclusion,
				body,
				annotations: result.annotations,
				actions: result.actions,
			});

			if (result.comment) {
				const comment = pr => `${badge}\n\n${result.comment(pr)}`;
				await commentPullRequest(
					ctx,
					ctx.chain.project,
					ctx.chain.id.sha,
					comment,
					"vulnerability_report",
				);
			}

			return result.status;
		},
	) as EventHandler<S, C>;
}
