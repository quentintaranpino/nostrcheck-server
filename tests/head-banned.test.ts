import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000";
const BANNED_HASH = "<PLACEHOLDER: hash of a banned file whose object was deleted>";
const MISSING_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

describe("headMedia and bans", () => {

	it("answers 403 for a banned hash even with no object on storage", async () => {
		const response = await fetch(`${BASE}/api/v2/media/${BANNED_HASH}`, { method: "HEAD" });
		expect(response.status).toBe(403);
		expect(response.headers.get("x-reason")).toBe("File is banned");
	}, 20000);

	it("still answers 404 for a hash that is not in the database", async () => {
		const response = await fetch(`${BASE}/api/v2/media/${MISSING_HASH}`, { method: "HEAD" });
		expect(response.status).toBe(404);
	}, 20000);

});
