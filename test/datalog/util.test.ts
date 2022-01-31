import * as assert from "power-assert";

import { entityWithId } from "../../lib/datalog/index";
import { hash } from "../../lib/util";

describe("datalog.util", () => {
	it("should create entity with id", () => {
		const data = {
			url: "pkg:deb/debian/python3.9@3.9.2-1?arch=amd64&os_distro=bullseye&os_name=debian&os_version=11",
			scheme: "pkg",
			type: "deb",
			namespace: "debian",
			name: "python3.9",
			version: "3.9.2-1",
		};
		const entity = entityWithId(["url", "scheme"])("package", data);
		delete entity["schema/entity"];
		assert.deepStrictEqual(entity, {
			"package/id": hash({
				"package/scheme": data.scheme,
				"package/url": data.url,
			}),
			"package/name": "python3.9",
			"package/namespace": "debian",
			"package/scheme": "pkg",
			"package/type": "deb",
			"package/url":
				"pkg:deb/debian/python3.9@3.9.2-1?arch=amd64&os_distro=bullseye&os_name=debian&os_version=11",
			"package/version": "3.9.2-1",
			"schema/entity-type": ":package",
		});
	});
});
