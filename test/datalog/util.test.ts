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

import {
	asKeyword,
	entity,
	entityRefs,
	entityWithId,
} from "../../lib/datalog/index";
import { toEdnString } from "../../lib/datalog/transact";
import { hash } from "../../lib/util";

describe("datalog.util", () => {
	it("should probably handle keywords", () => {
		const result = toEdnString({ foo: asKeyword(":bar"), bar: "foo" });
		assert.deepStrictEqual(result, '{:foo :bar :bar "foo"}');
	});
	it("should probably encode falsy values", () => {
		const result = toEdnString({ success: false, count: 0 });
		assert.deepStrictEqual(result, "{:success false :count 0}");
	});

	it("should create entity with id", () => {
		const data = {
			"urlName":
				"pkg:deb/debian/python3.9@3.9.2-1?arch=amd64&os_distro=bullseye&os_name=debian&os_version=11",
			"scheme": "pkg",
			"type": "deb",
			"namespace": "debian",
			"name": "python3.9",
			"version": "3.9.2-1",
			":foo": "test",
		};
		const entity = entityWithId(["urlName", "scheme", "bar"], {
			foo: "bar",
		})("package", data);
		delete entity["schema/entity"];
		assert.deepStrictEqual(entity, {
			"package/id": hash({
				"package/foo": "bar",
				"package/scheme": data.scheme,
				"package/url-name": data.urlName,
			}),
			"package/name": "python3.9",
			"package/namespace": "debian",
			"package/scheme": "pkg",
			"package/type": "deb",
			"package/url-name":
				"pkg:deb/debian/python3.9@3.9.2-1?arch=amd64&os_distro=bullseye&os_name=debian&os_version=11",
			"package/version": "3.9.2-1",
			"schema/entity-type": { _key: "package" },
			"foo": "test",
		});
	});
	it("should correctly find entities", () => {
		const entities = [entity("foo/bar", "$foo", { foo: "bar" })];
		const ref = entityRefs(entities, "foo/bar");
		assert.deepStrictEqual(ref.length, 1);
		assert.deepStrictEqual(ref[0], "$foo");
	});
});
