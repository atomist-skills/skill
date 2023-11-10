import * as assert from "assert";

import { EventType } from "../../lib/handler/routing";

describe("routing", () => {
	it("should get EventType from string", () => {
		const eventType = EventType["Webhook"];
		assert.strictEqual(eventType, EventType.Webhook);
	});
});
