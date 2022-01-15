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

import * as assert from "power-assert";

import { createContext } from "../lib/context";
import { guid } from "../lib/util";

describe("context", () => {
	it("should call all callbacks on close", async () => {
		const ctx = createContext(
			{
				data: {},
				extensions: { team_id: "1223456", correlation_id: guid() },
				skill: {
					id: "654321",
				},
			} as any,
			{} as any,
		);
		let closed1 = false;
		ctx.onComplete({
			name: "1",
			callback: async () => {
				closed1 = true;
			},
		});
		let closed2 = false;
		ctx.onComplete({
			name: "2",
			callback: async () => {
				closed2 = true;
			},
		});
		await (ctx as any).close();
		assert.deepStrictEqual(closed1, true);
		assert.deepStrictEqual(closed2, true);
	});
});
