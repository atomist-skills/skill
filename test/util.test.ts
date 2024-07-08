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

import * as assert from "assert";
import * as dt from "luxon";

import {
	bytes,
	extractParameters,
	formatDate,
	formatDuration,
	guid,
	levenshteinSort,
	pluralize,
	truncate,
} from "../lib/util";

describe("util", () => {
	describe("extractParameters", () => {
		it("should extract no parameters", () => {
			const intent = "create issue";
			const args = extractParameters(intent);
			assert.deepStrictEqual(args, []);
		});

		it("should extract one parameter", () => {
			const intent = "create issue --title=Test ";
			const args = extractParameters(intent);
			assert.deepStrictEqual(args, [{ name: "title", value: "Test" }]);
		});

		it("should extract multiple parameters", () => {
			const intent = "create issue --title=Test --body='This is a Test'";
			const args = extractParameters(intent);
			assert.deepStrictEqual(args, [
				{ name: "title", value: "Test" },
				{ name: "body", value: "This is a Test" },
			]);
		});

		it("should extract last parameter instance from multiple instances", () => {
			const intent =
				"create issue --title=Test1 --body='This is a test' --title=Test2-test1";
			const args = extractParameters(intent);
			assert.deepStrictEqual(args, [
				{ name: "body", value: "This is a test" },
				{ name: "title", value: "Test2-test1" },
			]);
		});
	});

	describe("guid", () => {
		it("generates uuid", () => {
			const uuid = guid();
			assert(!!uuid);
		});
	});

	describe("truncate", () => {
		it("should not truncate", () => {
			const text =
				"Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt";
			const result = truncate(text, 100);
			assert.strictEqual(result, text);
		});
		it("should truncate at the end", () => {
			const text =
				"Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt";
			assert.strictEqual(
				truncate(text, 20, { separator: "[...]", direction: "end" }),
				"Lorem ipsum dol[...]",
			);
		});
		it("should truncate in the middle", () => {
			const text =
				"Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt";
			assert.strictEqual(truncate(text, 20), "Lorem ips...invidunt");
			assert.strictEqual(
				truncate(text, 20, { separator: "[...]", direction: "middle" }),
				"Lorem ip[...]nvidunt",
			);
		});
		it("should truncate at the start", () => {
			const text =
				"Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt";
			assert.strictEqual(
				truncate(text, 20, { separator: "[...]", direction: "start" }),
				"[...]tempor invidunt",
			);
		});
	});

	describe("bytes", () => {
		it("should format undefined", () => {
			assert.deepStrictEqual(bytes(undefined), undefined);
		});
		it("should format +", () => {
			assert.deepStrictEqual(bytes("+"), "+");
		});
		it("should format 1024", () => {
			assert.deepStrictEqual(bytes("1024"), "1.0kb");
		});
		it("should format -1024", () => {
			assert.deepStrictEqual(bytes("-1024"), "-1.0kb");
		});
	});

	describe("pluralize", () => {
		it("should correctly pluralize", () => {
			assert.deepStrictEqual(
				pluralize("new vulnerability", ["CVE-1234", "CVE-5678"]),
				"2 new vulnerabilities",
			);
		});
		it("should correctly pluralize one result", () => {
			assert.deepStrictEqual(
				pluralize("dependency", ["lodash"]),
				"dependency",
			);
		});
		it("should correctly pluralize two results", () => {
			assert.deepStrictEqual(
				pluralize("dependency", ["lodash", "typescript"]),
				"2 dependencies",
			);
		});
	});

	describe("levenshteinSort", () => {
		it("should sort correctly", () => {
			const elems = ["slow", "faster", "fastest"];
			const result = levenshteinSort("fast", elems);
			assert.deepStrictEqual(result, ["faster", "fastest", "slow"]);
		});
	});

	describe("formatDate", () => {
		it("should format date correctly", () => {
			const dateStr = "2021-08-12T20:31:53.469Z";
			const date = new Date(dateStr);
			assert.strictEqual(
				formatDate(date, dt.DateTime.DATETIME_FULL),
				"August 12, 2021 at 8:31 PM UTC",
			);
		});
	});

	describe("formatDuration", () => {
		it("should format days duration correctly", () => {
			const date = dt.DateTime.now().minus({ days: 2 }).toJSDate();
			assert.strictEqual(formatDuration(date), "2 days");
		});

		it("should format duration correctly", () => {
			const date = dt.DateTime.now().minus({ second: 10 }).toJSDate();
			assert.strictEqual(formatDuration(date), "now");
		});
	});
});
