import { describe, expect, test } from 'vitest';


// Nostraddress local endpoint
describe("Nostraddress endpoint", () => {
	test("GET /api/v2/nostraddress", async () => {
		const res =  await fetch("http://localhost:3000/api/v2/nostraddress");
		expect(res.status).toEqual(400);
	});
	test("GET /api/v2/nostraddress?name=  | Empty name parameter |", async () => {
		const res =  await fetch("http://localhost:3000/api/v2/nostraddress?name=");
		expect(res.status).toEqual(400);
	});
	test("GET /api/v2/nostraddress?name=123 | With 1 name parameter, expecting not exist 404 |", async () => {
		const res =  await fetch("http://localhost:3000/api/v2/nostraddress?name=123");
		expect(res.status).toEqual(404);
	});
	test("GET /api/v2/nostraddress?name=_ | Should be CORS enabled (*) |", async () => {
		const res =  await fetch("http://localhost:3000/api/v2/nostraddress?name=_");
		expect(res.headers.get("Access-Control-Allow-Origin")).toEqual("*");
	});
	test("GET /api/v2/nostraddress?name=_ | With _ name parameter |", async () => {
		const res =  await fetch("http://localhost:3000/api/v2/nostraddress?name=_");
		expect(res.status).toEqual(200);
	});
});