import { describe, it, expect } from "vitest";
import { deleteBannedObjects } from "../src/lib/security/banned.js";

describe("deleteBannedObjects", () => {

	it("returns record-not-found error for an id that is not in mediafiles", async () => {
		const result = await deleteBannedObjects(999999999, "test", "system", "unit test");
		expect(result.status).toBe("error");
		expect(result.message).toBe("Record not found");
		expect(result.deleted).toBe(0);
		expect(result.failed).toBe(0);
	});

	it("returns invalid-parameters error for id 0", async () => {
		const result = await deleteBannedObjects(0);
		expect(result.status).toBe("error");
		expect(result.message).toBe("Invalid parameters");
		expect(result.deleted).toBe(0);
		expect(result.failed).toBe(0);
	});

});