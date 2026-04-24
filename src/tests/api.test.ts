import { describe, expect, test } from 'vitest';

const BASE = "http://localhost:3000";

// The /api root is a redirect landing. Using `redirect: 'manual'` so we assert
// what the endpoint actually returns (302) instead of what fetch reports after
// following the chain (which would hide regressions on /api itself).
describe("Server index endpoint", () => {

	test("GET /api redirects to /api/v2 with a 302", async () => {
		const res = await fetch(`${BASE}/api`, { redirect: "manual" });
		expect(res.status).toEqual(302);
		expect(res.headers.get("location") || "").toMatch(/\/api\/v2\/?$/);
	});

	test("GET /api serves CORS on the redirect response itself", async () => {
		const res = await fetch(`${BASE}/api`, { redirect: "manual" });
		expect(res.headers.get("Access-Control-Allow-Origin")).toEqual("*");
	});

	test("The redirect target /api/v2 is reachable and returns 200", async () => {
		const res = await fetch(`${BASE}/api/v2/`);
		expect(res.status).toEqual(200);
	});

});
