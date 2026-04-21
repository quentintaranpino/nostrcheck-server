import { describe, test, expect } from "vitest";
import { getPublicKey, generateSecretKey, finalizeEvent } from "nostr-tools";
import crypto from "crypto";

const BASE = "http://localhost:3000";

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

describe("Register with NIP-98 (JSON body payload binding)", () => {

	// The /register endpoint always reaches the payment flow in this dev env and returns
	// 500 "Failed to generate payment request" regardless of whether NIP-98 was accepted
	// or fell back to OTC. So we can't assert end-to-end success. What we CAN assert is
	// that a correctly bound payload is NOT rejected by the auth layer — this protects
	// against a regression in the JSON-body hashing path of isNIP98Valid.
	test("Correctly bound payload is not rejected by the NIP-98 auth layer", async () => {
		const sk = generateSecretKey();
		const pk = getPublicKey(sk);
		const body = {
			pubkey: pk,
			username: "t" + crypto.randomBytes(4).toString("hex"),
			domain: "localhost",
			password: "testpassword12",
			inviteCode: "",
		};
		const payload = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
		const url = `${BASE}/api/v2/register`;
		const event = signNip98(sk, url, "POST", [["payload", payload]]);

		const res = await fetch(url, {
			method: "POST",
			headers: { Authorization: authHeader(event), "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (res.status === 429) return; // daily register quota exhausted, inconclusive
		const text = await res.text();

		expect(res.status).not.toEqual(401);
		expect(text).not.toContain("Missing payload tag");
		expect(text).not.toContain("payload mismatch");
		expect(text).not.toContain("payload hash mismatch");
	}, 60000); // /register reaches the payment flow in dev (lightning invoice gen + OTC DM), which can exceed vitest's 5s default, especially when the server is under concurrent load from upload tests.

});
