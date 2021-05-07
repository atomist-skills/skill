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

export enum PolicyConclusion {
	Failure = "failure",
	ActionRequired = "action_required",
	Success = "success",
	Cancelled = "cancelled",
	Skipped = "skipped",
	Neutral = "neutral",
	TimedOut = "timed_out",
}

export enum PolicySeverity {
	Critical = "critical",
	High = "high",
	Medium = "medium",
	Low = "low",
	Minimum = "minimum",
}

export function toConclusion(conclusion: string): PolicyConclusion {
	for (const key of Object.keys(PolicyConclusion)) {
		if (conclusion.toLowerCase() === PolicyConclusion[key]) {
			return PolicyConclusion[key];
		}
	}
	return undefined;
}

export function toSeverity(severity: string): PolicySeverity {
	for (const key of Object.keys(PolicySeverity)) {
		if (severity.toLowerCase() === PolicySeverity[key]) {
			return PolicySeverity[key];
		}
	}
	return undefined;
}
