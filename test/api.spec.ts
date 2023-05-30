import request from "supertest";

import app from "../src/app.js";

//Registered usernames
describe("GET /api/v1/registered", () => {
	it("should return 400 Bad request", () => {
		return request(app).get("/api/v1/nostraddress").expect(400);
	});

	it("Should return 400 without name parameter", () => {
		return request(app).get("/api/v1/nostraddress?name=").expect(400);
	});

	it("Should be CORS enabled", () => {
		return request(app)
			.get("/api/v1/nostraddress?name=_")
			.expect("Access-Control-Allow-Origin", "*");
	});

	it("Should return 200 with name parameter", () => {
		return request(app).get("/api/v1/nostraddress?name=_").expect(200);
	});
});

//API root
describe("GET /api", () => {
	it("Should be CORS enabled", () => {
		return request(app).get("/api").expect("Access-Control-Allow-Origin", "*");
	});

	it("Should return 200", () => {
		return request(app).get("/api").expect(200);
	});
});

//Register endpoint
describe("POST /api/v1/register/", () => {
	it("Should return 400 without body", () => {
		return request(app).post("/api/register").expect(400);
	});
	// it("Should return 400 without id", () => {
	// 	return request(app).post("/api/register").send({}).expect(400);
	// }
	// );
	// it("Should return 400 without hex", () => {
	// 	return request(app).post("/api/register").send({ id: "test" }).expect(400);
	// }
	// );
	// it("Should return 400 without date", () => {
	// 	return request(app).post("/api/register").send({ id: "test", hex: "test" }).expect(400);
	// }
	// );
	// it("Should return 400 without kind", () => {
	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0 }).expect(400);
	// }
	// );
	// it("Should return 400 without tags", () => {
	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0" }).expect(400);
	// }
	// );
	// it("Should return 400 without username", () => {
	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0", tags: ["test"] }).expect(400);
	// }
	// );
	// it("Should return 400 without signature", () => {
	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0", tags: ["test"], username: "test" }).expect(400);
	// }
	// );
	// it("Should return 400 without remoteip", () => {
	// 	return request(app).post("/api/register").send({ id: "test", hex: "test", date: 0, kind: "0", tags: ["test"], username: "test", signature: "test" }).expect(400);
	// }
	// );

	// it("should create a new post", async () => {
	// 	const res = await request(app)
	// 		.post("/api/c1register")
	// 		.send({
	// 			id: "test",
	// 			hex: "test",
	// 			date: 1111111111111,
	// 			kind: "0",
	// 			tags: ["test"],
	// 			username: "test",
	// 		});
	// 	expect(res.statusCode).toEqual(200);
	// 	expect(res.body).toHaveProperty("post");
	// });
});
