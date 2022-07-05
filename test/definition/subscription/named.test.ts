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
import * as fs from "fs-extra";

import { namedDatalog } from "../../../lib/definition/subscription/named";

describe("named", () => {
	it("should load on_push datalog subscription", () => {
		const subscription = namedDatalog("@atomist/skill/on_push");
		assert.deepStrictEqual(
			subscription,
			fs.readFileSync("datalog/subscription/on_push.edn").toString(),
		);
	});
});
