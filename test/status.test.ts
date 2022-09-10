/*
 * Copyright © 2020 Atomist, Inc.
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

import { State } from "../lib/handler/handler";
import { completed, failed } from "../lib/status";

describe("status", () => {
	it("should create success status", () => {
		const status = completed("This is a test");
		assert.deepStrictEqual(status.state, State.Completed);
		assert.deepStrictEqual(status.reason, "This is a test");
	});

	it("should create failure status", () => {
		const status = failed("This is a test");
		assert.deepStrictEqual(status.state, State.Failed);
		assert.deepStrictEqual(status.reason, "This is a test");
	});
});
