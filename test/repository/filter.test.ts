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

import * as assert from "power-assert";

import { Contextual } from "../../lib/handler/handler";
import {
	matchesRefFilter,
	matchesRepoFilter,
} from "../../lib/repository/filter";

describe("filter", () => {
	describe("matchesRepoFilter", () => {
		it("should not match repository with repoFilter param without value", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {
							repos: null,
						},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "bar", "test", "repos", ctx),
				false,
			);
		});
		it("should match any repository with repoFilter", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {
							repos: {
								includes: null,
								excludes: null,
							},
						},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "bar", "test", "repos", ctx),
				true,
			);
		});

		it("should not match repository with no repoFilter param", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "bar", "test", "repos", ctx),
				false,
			);
		});

		it("should match repository with repoFilter param for entire org", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {
							repos: {
								includes: [
									{
										ownerId: "bar",
									},
								],
							},
						},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "bar", "test", "repos", ctx),
				true,
			);
		});

		it("should match repository with repoFilter param for entire org and empty repos", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {
							repos: {
								includes: [
									{
										ownerId: "bar",
										repoIds: [],
									},
								],
							},
						},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "bar", "test", "repos", ctx),
				true,
			);
		});

		it("should not match repository with repoFilter param for entire org", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {
							repos: {
								includes: [
									{
										ownerId: "otherOrg",
									},
								],
							},
						},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "bar", "test", "repos", ctx),
				false,
			);
		});

		it("should match repository with repoFilter param for specific repo", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {
							repos: {
								includes: [
									{
										ownerId: "otherOrg",
										repoIds: ["foo"],
									},
								],
							},
						},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "bar", "test", "repos", ctx),
				true,
			);
		});

		it("should not match repository with repoFilter param for specific repo", () => {
			const ctx: Contextual<any, any> = {
				configuration: [
					{
						name: "test",
						parameters: {
							repos: {
								includes: [
									{
										ownerId: "otherOrg",
										repoIds: ["otherFoo"],
									},
								],
							},
						},
					},
				],
			} as any;
			assert.deepStrictEqual(
				matchesRepoFilter("foo", "otherOrg", "test", "repos", ctx),
				false,
			);
		});
	});

	describe("matchesRefFilter", () => {
		it("should match ref filter for push", () => {
			const ctx: Contextual<any, any> = {
				data: {
					Push: [{ branch: "main" }],
				},
				configuration: {
					name: "test",
					parameters: {
						refs: ["m.*n"],
						doesNotMatch: ["mas.*r"],
					},
				},
			} as any;
			assert.deepStrictEqual(matchesRefFilter("refs", ctx as any), true);
			assert.deepStrictEqual(
				matchesRefFilter("doesNotMatch", ctx as any),
				false,
			);
		});
		it("should match ref filter for tag", () => {
			const ctx: Contextual<any, any> = {
				data: {
					Tag: [{ name: "1.2.3" }],
				},
				configuration: {
					name: "test",
					parameters: {
						refs: ["[0-9]\\.[0-9]\\.[0-9]"],
						doesNotMatch: ["mas.*r"],
					},
				},
			} as any;
			assert.deepStrictEqual(matchesRefFilter("refs", ctx as any), true);
			assert.deepStrictEqual(
				matchesRefFilter("doesNotMatch", ctx as any),
				false,
			);
		});
	});
});
