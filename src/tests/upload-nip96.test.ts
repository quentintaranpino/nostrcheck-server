import { describe, test, expect, beforeAll } from "vitest";
import { getPublicKey, generateSecretKey, finalizeEvent } from "nostr-tools";
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

const signNip98 = (sk: Uint8Array, url: string, method: string, extraTags: string[][] = []) =>
	finalizeEvent(
		{
			kind: 27235,
			created_at: Math.floor(Date.now() / 1000),
			tags: [["u", url], ["method", method], ...extraTags],
			content: "",
		},
		sk,
	);

const makeForm = () => {
	const f = new FormData();
	f.append("file", new Blob([png], { type: "image/png" }), "test.png");
	return f;
};

describe("NIP-96 upload auth (NIP-98 binding)", () => {

	test("Happy path with correct payload hash; replay is rejected", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/api/v2/media`;
		const event = signNip98(sk, url, "POST", [["payload", fileHash]]);
		const header = authHeader(event);

		const first = await fetch(url, { method: "POST", headers: { Authorization: header }, body: makeForm() });
		expect([200, 201, 202]).toContain(first.status);

		const replay = await fetch(url, { method: "POST", headers: { Authorization: header }, body: makeForm() });
		expect(replay.status).toEqual(401);
	});

	// Per NIP-98 the payload tag is SHOULD (not MUST). Missing it on an upload
	// is allowed; the signature, method/u-tag and anti-replay still gate the
	// request. We just log a warning when the tag isn't there.
	test("Accepts an upload without a payload tag (lenient per spec)", async () => {
		const sk = generateSecretKey();
		const url = `${BASE}/api/v2/media`;
		const event = signNip98(sk, url, "POST");
		const res = await fetch(url, { method: "POST", headers: { Authorization: authHeader(event) }, body: makeForm() });
		expect([200, 201, 202]).toContain(res.status);
	});

	test("409 when payload hash does not match file", async () => {
		// Hash mismatch is a content conflict, not an auth failure.
		const sk = generateSecretKey();
		const url = `${BASE}/api/v2/media`;
		const event = signNip98(sk, url, "POST", [["payload", "a".repeat(64)]]);
		const res = await fetch(url, { method: "POST", headers: { Authorization: authHeader(event) }, body: makeForm() });
		expect(res.status).toEqual(409);
	});

});

describe("Sanity", () => {
	test("pubkey derivation smoke", () => {
		const sk = generateSecretKey();
		expect(getPublicKey(sk)).toMatch(/^[0-9a-f]{64}$/);
	});
});
