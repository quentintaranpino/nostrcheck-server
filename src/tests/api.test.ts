import { describe, expect, test } from 'vitest';

//Server index
describe("Server index endpoint", () => {
	test("GET /api | Should be CORS enabled (*) |", async () => {
		const res =  await fetch("http://localhost:3000/api");
		expect(res.headers.get("Access-Control-Allow-Origin")).toEqual("*");
	});
	test("GET /api | Should response with 200 |", async () => {
		const res =  await fetch("http://localhost:3000/api");
		expect(res.status).toEqual(200);
	});
});