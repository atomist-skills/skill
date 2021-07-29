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

import { Commit } from "../definition/subscription/common_types";
import {
	OnPushSubscription,
	OnTagSubscription,
} from "../definition/subscription/typings/types";
import { Contextual, EventContext } from "../handler/handler";
import { toArray } from "../util";

/**
 * @deprecated use matchesRepoFilter
 */
export const matchesFilter = matchesRepoFilter;

export function commitMatchesRepoFilter(
	commit: Commit,
	parameterName: string,
	ctx: Contextual<any, any>,
): boolean {
	return matchesRepoFilter(
		commit?.repo?.graphqlId,
		commit?.repo?.org?.graphqlId,
		ctx.configuration.name,
		parameterName,
		ctx,
	);
}

export function matchesRepoFilter(
	repoId: string,
	orgId: string,
	configurationName: string,
	parameterName: string,
	ctx: Contextual<any, any>,
): boolean {
	const cfg = toArray(ctx.configuration).find(
		c => c.name === configurationName,
	);
	const repoFilter = cfg.parameters[parameterName];
	if (repoFilter) {
		const excludes = repoFilter.excludes || [];
		const includes = repoFilter.includes || [];
		if (includes.length === 0 && excludes.length === 0) {
			return true;
		} else if (excludes.some(e => (e.repoIds || []).includes(repoId))) {
			return false;
		} else if (includes.some(i => (i.repoIds || []).includes(repoId))) {
			return true;
		} else if (
			excludes.some(
				e =>
					e.ownerId === orgId &&
					(!e.repoIds || e.repoIds.length === 0),
			)
		) {
			return false;
		} else if (
			includes.some(
				i =>
					i.ownerId === orgId &&
					(!i.repoIds || i.repoIds.length === 0),
			)
		) {
			return true;
		}
		return false;
	}
	return false;
}

export function matchesRefFilter(
	parameterName: string,
	ctx: EventContext<OnTagSubscription | OnPushSubscription>,
): boolean {
	const filter: string[] = ctx.configuration?.parameters?.[parameterName] || [
		".*",
	];
	if (filter?.length > 0) {
		const push = (ctx.data as OnPushSubscription).Push?.[0];
		const tag = (ctx.data as OnTagSubscription).Tag?.[0];
		let ref;
		if (push) {
			ref = push.branch;
		} else if (tag) {
			ref = tag.name;
		}
		return filter.some(f => new RegExp(f).test(ref));
	}
	return true;
}
