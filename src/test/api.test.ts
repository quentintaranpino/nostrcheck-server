// import { describe, expect, test } from 'vitest';

// // Execute server
// import server from "../server.js";
// server;

// //Server index
// describe("Server index endpoint", () => {
// 	test("GET /api | Should be CORS enabled (*) |", async () => {
// 		const res =  await fetch("http://localhost:3000/api");
// 		expect(res.headers.get("Access-Control-Allow-Origin")).toEqual("*");
// 	});
// 	test("GET /api | Should response with 200 |", async () => {
// 		const res =  await fetch("http://localhost:3000/api");
// 		expect(res.status).toEqual(200);
// 	});
// });

// // Nostraddress local endpoint
// describe("Nostraddress endpoint (v1)", () => {
// 	test("GET /api/v1/nostraddress", async () => {
// 		const res =  await fetch("http://localhost:3000/api/v1/nostraddress");
// 		expect(res.status).toEqual(400);
// 	});
// 	test("GET /api/v1/nostraddress?name=  | Empty name parameter |", async () => {
// 		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=");
// 		expect(res.status).toEqual(400);
// 	});
// 	test("GET /api/v1/nostraddress?name=1 | With 1 name parameter, expecting not exist 404 |", async () => {
// 		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=123");
// 		expect(res.status).toEqual(404);
// 	});
// 	test("GET /api/v1/nostraddress?name=_ | Should be CORS enabled (*) |", async () => {
// 		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=_");
// 		expect(res.headers.get("Access-Control-Allow-Origin")).toEqual("*");
// 	});
// 	test("GET /api/v1/nostraddress?name=_ | With _ name parameter |", async () => {
// 		const res =  await fetch("http://localhost:3000/api/v1/nostraddress?name=_");
// 		expect(res.status).toEqual(200);
// 	});
// });


// // //Register endpoint
// // describe("POST /api/v1/register/", () => {
// // 	it("Should return 400 without body", () => {
// // 		return request(app).post("/api/register").expect(400);
// // 	});
// 	// it("Should return 400 without id", () => {
// 	// 	return request(app).post("/api/register").send({}).expect(400);
// 	// }
// 	// );
// 	// it("Should return 400 without hex", () => {
// 	// 	return request(app).post("/api/register").send({ id: "test" }).expect(400);
// 	// }
// 	// );
// 	// it("Should return 400 without date", () => {
// 	// 	return request(app).post("/api/register").send({ id: "test", hex: "test" }).expect(400);
// 	// }
// 	// );
// 	// it("Should return 400 without kind", () => {
// 	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0 }).expect(400);
// 	// }
// 	// );
// 	// it("Should return 400 without tags", () => {
// 	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0" }).expect(400);
// 	// }
// 	// );
// 	// it("Should return 400 without username", () => {
// 	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0", tags: ["test"] }).expect(400);
// 	// }
// 	// );
// 	// it("Should return 400 without signature", () => {
// 	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0", tags: ["test"], username: "test" }).expect(400);
// 	// }
// 	// );
// 	// it("Should return 400 without remoteip", () => {
// 	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0", tags: ["test"], username: "test", signature: "test" }).expect(400);
// 	// }
// 	// );

// 	// it("should create a new post", async () => {
// 	// 	const res = await request(app)
// 	// 		.post("/api/c1register")
// 	// 		.send({
// 	// 			id: "test",
// 	// 			hex: "test",
// 	// 			date: 1111111111111,
// 	// 			kind: "0",
// 	// 			tags: ["test"],
// 	// 			username: "test",
// 	// 		});
// 	// 	expect(res.statusCode).toEqual(200);
// 	// 	expect(res.body).toHaveProperty("post");
// 	// });
// // });
