import { describe, expect, test } from 'vitest';

const BASE = "http://localhost:3000";

// The internal API path and the canonical NIP-05 `.well-known` path resolve to
// the same controller, so both shapes are covered here.
describe("Nostraddress endpoint", () => {

	test("GET /api/v2/nostraddress without name is 400", async () => {
		const res = await fetch(`${BASE}/api/v2/nostraddress`);
		expect(res.status).toEqual(400);
	});

	test("GET /api/v2/nostraddress?name= (empty) is 400", async () => {
		const res = await fetch(`${BASE}/api/v2/nostraddress?name=`);
		expect(res.status).toEqual(400);
	});

	test("GET /api/v2/nostraddress?name=<unknown> is 404", async () => {
		const res = await fetch(`${BASE}/api/v2/nostraddress?name=123`);
		expect(res.status).toEqual(404);
	});

	test("Name longer than 50 chars is rejected with 400", async () => {
		const tooLong = "a".repeat(51);
		const res = await fetch(`${BASE}/api/v2/nostraddress?name=${tooLong}`);
		expect(res.status).toEqual(400);
	});

	test("Response exposes CORS", async () => {
		const res = await fetch(`${BASE}/api/v2/nostraddress?name=_`);
		expect(res.headers.get("Access-Control-Allow-Origin")).toEqual("*");
	});

	test("GET /api/v2/nostraddress?name=_ returns a valid NIP-05 body", async () => {
		const res = await fetch(`${BASE}/api/v2/nostraddress?name=_`);
		expect(res.status).toEqual(200);
		const body = await res.json();
		expect(body).toHaveProperty("names");
		expect(body.names).toHaveProperty("_");
		expect(String(body.names._)).toMatch(/^[0-9a-f]{64}$/);
	});

	test("Canonical NIP-05 path /.well-known/nostr.json?name=_ returns the same shape", async () => {
		const res = await fetch(`${BASE}/.well-known/nostr.json?name=_`);
		expect(res.status).toEqual(200);
		const body = await res.json();
		expect(body).toHaveProperty("names");
		expect(body.names).toHaveProperty("_");
		expect(String(body.names._)).toMatch(/^[0-9a-f]{64}$/);
	});

	// Hostile input shouldn't crash the server with 500. 404 is the expected
	// "not found" path for non-matching names.
	test("SQL-like input returns 404, not 500", async () => {
		const res = await fetch(`${BASE}/api/v2/nostraddress?name=${encodeURIComponent("' OR 1=1 --")}`);
		expect([400, 404]).toContain(res.status);
	});

});
