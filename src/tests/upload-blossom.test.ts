import { describe, test, expect, beforeAll } from "vitest";
import { generateSecretKey, finalizeEvent } from "nostr-tools";
import crypto from "crypto";
import sharp from "sharp";

const BASE = "http://localhost:3000";

// Using a fresh ArrayBuffer-backed Uint8Array so the value satisfies fetch's
// BodyInit / Blob part typing under @types/node >= 20 (Buffer<ArrayBufferLike> doesn't).
let png: Uint8Array<ArrayBuffer>;
let fileHash: string;

beforeAll(async () => {
	const buf = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 1 } } }).png().toBuffer();
	const ab = new ArrayBuffer(buf.length);
	png = new Uint8Array(ab);
	png.set(buf);
	fileHash = crypto.createHash("sha256").update(png).digest("hex");
});

const authHeader = (event: unknown) => "Nostr " + Buffer.from(JSON.stringify(event)).toString("base64");

const signBud11 = (sk: Uint8Array, verb: string, extraTags: string[][] = [], expirationOffsetSec = 300) =>
	finalizeEvent(
		{
			kind: 24242,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				["t", verb],
				["expiration", String(Math.floor(Date.now() / 1000) + expirationOffsetSec)],
				...extraTags,
			],
			content: `${verb} test`,
		},
		sk,
	);

describe("Blossom upload auth (BUD-11 binding)", () => {

	test("Happy path with correct x tag; replay is rejected", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload", [["x", fileHash]]);
		const header = authHeader(event);

		const first = await fetch(url, { method: "PUT", headers: { Authorization: header, "Content-Type": "image/png" }, body: png });
		expect([200, 201, 202]).toContain(first.status);

		const replay = await fetch(url, { method: "PUT", headers: { Authorization: header, "Content-Type": "image/png" }, body: png });
		expect(replay.status).toEqual(401);
	});

	test("401 when x tag is missing on an upload", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload");
		const res = await fetch(url, { method: "PUT", headers: { Authorization: authHeader(event), "Content-Type": "image/png" }, body: png });
		expect(res.status).toEqual(401);
	});

	test("401 when x tag does not match blob", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload", [["x", "a".repeat(64)]]);
		const res = await fetch(url, { method: "PUT", headers: { Authorization: authHeader(event), "Content-Type": "image/png" }, body: png });
		expect(res.status).toEqual(401);
	});

	test("401 when event expiration is in the past", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload", [["x", fileHash]], -60);
		const res = await fetch(url, { method: "PUT", headers: { Authorization: authHeader(event), "Content-Type": "image/png" }, body: png });
		expect(res.status).toEqual(401);
	});

	test("HEAD /upload (pre-flight) passes auth when x tag is present even without a body", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload", [["x", fileHash]]);
		const res = await fetch(url, {
			method: "HEAD",
			headers: {
				Authorization: authHeader(event),
				"x-sha-256": fileHash,
				"x-content-length": String(png.length),
				"x-content-type": "image/png",
			},
		});
		expect(res.status).not.toEqual(401);
	});

	test("HEAD /upload is rejected when x tag is missing", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload");
		const res = await fetch(url, {
			method: "HEAD",
			headers: {
				Authorization: authHeader(event),
				"x-sha-256": fileHash,
				"x-content-length": String(png.length),
				"x-content-type": "image/png",
			},
		});
		expect(res.status).toEqual(401);
	});

});

describe("Blossom BUD-11 hardening (new rules)", () => {

	// DELETE now demands an `x` tag just like upload. Previously the delete endpoint
	// accepted any Blossom auth event with t=delete regardless of blob scoping.
	test("DELETE returns 401 when the Blossom auth event is missing the x tag", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/api/v2/media/${fileHash}`;
		const event = signBud11(sk, "delete");
		const res = await fetch(url, { method: "DELETE", headers: { Authorization: authHeader(event) } });
		expect(res.status).toEqual(401);
	});

	// The `x` tag in the auth event must include the blob hash that the URL refers
	// to. Signing `x: A` and sending DELETE /B should not authorise the second.
	test("DELETE returns 401 when the x tag does not match the URL blob hash", async () => {
		const sk = generateSecretKey();
		const otherHash = "a".repeat(64);
		const url = `${BASE}/api/v2/media/${fileHash}`;
		const event = signBud11(sk, "delete", [["x", otherHash]]);
		const res = await fetch(url, { method: "DELETE", headers: { Authorization: authHeader(event) } });
		expect(res.status).toEqual(401);
	});

	// BUD-11 `server` tag is optional, but when present MUST include the server's host.
	test("PUT /upload returns 401 when the server tag does not include this host", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload", [["x", fileHash], ["server", "some-other-domain.example"]]);
		const res = await fetch(url, { method: "PUT", headers: { Authorization: authHeader(event), "Content-Type": "image/png" }, body: png });
		expect(res.status).toEqual(401);
	});

	// HEAD /upload pre-flight declares the intended blob via X-SHA-256. The auth `x` tag
	// must include that same hash (BUD-11 cross-check).
	test("HEAD /upload returns 401 when X-SHA-256 header disagrees with the x tag", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/upload`;
		const event = signBud11(sk, "upload", [["x", fileHash]]);
		const res = await fetch(url, {
			method: "HEAD",
			headers: {
				Authorization: authHeader(event),
				"x-sha-256": "b".repeat(64),
				"x-content-length": String(png.length),
				"x-content-type": "image/png",
			},
		});
		expect(res.status).toEqual(401);
	});

});

describe("Blossom BUD-09 blob reports", () => {

	const REPORT_URL = `${BASE}/report`;

	const signReport = (sk: Uint8Array, xTags: string[][], content = "test report") =>
		finalizeEvent(
			{
				kind: 1984,
				created_at: Math.floor(Date.now() / 1000),
				tags: xTags,
				content,
			},
			sk,
		);

	test("Accepts a well-formed kind 1984 report event", async () => {
		const sk = generateSecretKey();
		const event = signReport(sk, [["x", fileHash, "spam"]], "test spam report");
		const res = await fetch(REPORT_URL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(event),
		});
		expect(res.status).toEqual(200);
	});

	test("Rejects a non-1984 event with 400", async () => {
		const sk = generateSecretKey();
		const wrongKind = finalizeEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [["x", fileHash]], content: "" }, sk);
		const res = await fetch(REPORT_URL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(wrongKind),
		});
		expect(res.status).toEqual(400);
	});

	test("Rejects a 1984 event without any x tag with 400", async () => {
		const sk = generateSecretKey();
		const event = signReport(sk, [["e", "f".repeat(64)]], "missing x tag");
		const res = await fetch(REPORT_URL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(event),
		});
		expect(res.status).toEqual(400);
	});

	test("Rejects a non-JSON body with 400", async () => {
		const res = await fetch(REPORT_URL, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: "not a json object",
		});
		expect(res.status).toEqual(400);
	});

});

describe("Blossom BUD-04 mirror SSRF guard", () => {

	// The /mirror endpoint fetches an arbitrary URL server-side. Without an SSRF
	// guard an attacker could ask the server to fetch the cloud metadata endpoint
	// (AWS / GCP / Azure at 169.254.169.254) or poke internal services. These
	// tests assert that the guard in `lib/security/urls.ts` refuses such URLs.
	// The mirror endpoint returns 400 when the fetch fails (empty file).

	const mirror = async (url: string): Promise<Response> => {
		const sk = generateSecretKey();
		const event = signBud11(sk, "upload", [["x", fileHash]]);
		return fetch(`${BASE}/mirror`, {
			method: "PUT",
			headers: { Authorization: authHeader(event), "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});
	};

	test("refuses http://127.0.0.1 (IPv4 loopback literal)", async () => {
		const res = await mirror("http://127.0.0.1/anything");
		expect(res.status).toEqual(400);
	});

	test("refuses AWS / GCP metadata 169.254.169.254", async () => {
		const res = await mirror("http://169.254.169.254/latest/meta-data/");
		expect(res.status).toEqual(400);
	});

	test("refuses an RFC1918 private range", async () => {
		const res = await mirror("http://10.0.0.1/x");
		expect(res.status).toEqual(400);
	});

	test("refuses the IPv6 loopback ::1", async () => {
		const res = await mirror("http://[::1]/x");
		expect(res.status).toEqual(400);
	});

	test("refuses a non http(s) scheme (file://)", async () => {
		const res = await mirror("file:///etc/passwd");
		expect(res.status).toEqual(400);
	});

});
