import * as assert from "assert";

import { prepareUrl } from "../lib/http";

describe("http", () => {
	describe("prepareUrl", () => {
		it("should replace url parameters correctly", async () => {
			const url = "http://${foo}.google.com/${foo}/bar/${count}.json";
			assert.deepStrictEqual(
				prepareUrl(url, { foo: "search", count: 22 }),
				"http://search.google.com/search/bar/22.json",
			);
		});
	});
});
