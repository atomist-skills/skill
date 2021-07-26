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

import { UpdateCheck } from "../github/check";

export enum Conclusion {
	Failure = "failure",
	ActionRequired = "action_required",
	Success = "success",
	Cancelled = "cancelled",
	Skipped = "skipped",
	Neutral = "neutral",
	TimedOut = "timed_out",
}

export enum Severity {
	Critical = "critical",
	High = "high",
	Medium = "medium",
	Low = "low",
	Minimum = "minimum",
}

export type Annotation = UpdateCheck["annotations"][0] & { sha: string };
export type Action = UpdateCheck["actions"][0];

export function toConclusion(conclusion: string): Conclusion {
	for (const key of Object.keys(Conclusion)) {
		if (conclusion.toLowerCase() === Conclusion[key]) {
			return Conclusion[key];
		}
	}
	return undefined;
}

export function toSeverity(severity: string): Severity {
	for (const key of Object.keys(Severity)) {
		if (severity.toLowerCase() === Severity[key]) {
			return Severity[key];
		}
	}
	return undefined;
}
