import { describe, expect, test } from 'vitest';

// Execute server
import server from "../server.js";
server;

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

// Nostraddress local endpoint
describe("Nostraddress endpoint (v1)", () => {
	test("GET /api/v1/nostraddress", async () => {
		const res =  await fetch("http://localhost:3000/api/v1/nostraddress");
		expect(res.status).toEqual(400);
	});
	test("GET /api/v1/nostraddress?name=  | Empty name parameter |", async () => {
		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=");
		expect(res.status).toEqual(400);
	});
	test("GET /api/v1/nostraddress?name=1 | With 1 name parameter, expecting not exist 404 |", async () => {
		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=123");
		expect(res.status).toEqual(404);
	});
	test("GET /api/v1/nostraddress?name=_ | Should be CORS enabled (*) |", async () => {
		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=_");
		expect(res.headers.get("Access-Control-Allow-Origin")).toEqual("*");
	});
	test("GET /api/v1/nostraddress?name=_ | With _ name parameter |", async () => {
		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=_");
		expect(res.status).toEqual(200);
	});
});