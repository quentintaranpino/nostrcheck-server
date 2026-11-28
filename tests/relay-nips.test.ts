import { describe, it, expect } from "vitest";
import { hasCommentRootScope } from "../src/lib/nostr/NIP22.js";
import { checkPow, countLeadingZeroes } from "../src/lib/nostr/NIP13.js";

const pk = "3c9849383bdea883b0bd16fece1ed36d37e37cdde3ce43b17ea4e9192ec11289";
const id = "5b4fc7fed15672fefe65d2426f67197b71ccc82aa0cc8a9e94f683eb78e07651";

describe("NIP-22 comment root scope", () => {
	it("accepts a NIP-7D thread reply", () => {
		expect(hasCommentRootScope([["K", "11"], ["E", id, "", pk]])).toBe(true);
	});
	it("accepts comments on articles, URLs and files", () => {
		expect(hasCommentRootScope([["A", `30023:${pk}:post`], ["K", "30023"], ["a", `30023:${pk}:post`], ["k", "30023"]])).toBe(true);
		expect(hasCommentRootScope([["I", "https://example.com/page"], ["K", "web"]])).toBe(true);
		expect(hasCommentRootScope([["E", id], ["K", "1063"], ["e", id], ["k", "1063"]])).toBe(true);
	});
	it("rejects a comment without a root kind or a root pointer", () => {
		expect(hasCommentRootScope([["E", id]])).toBe(false);
		expect(hasCommentRootScope([["K", "11"]])).toBe(false);
		expect(hasCommentRootScope([["K", "11"], ["E", ""]])).toBe(false);
		expect(hasCommentRootScope([["k", "11"], ["e", id]])).toBe(false);
	});
});

describe("NIP-13 proof of work", () => {
	// 36 leading zero bits (the NIP-13 example)
	const mined = "000000000e9d97a1ab09fc381030b346cdd7a142ad57e6df0b46dc9bef6c7e2d";
	it("counts the leading zero bits of the id", () => {
		expect(countLeadingZeroes(mined)).toBe(36);
		expect(countLeadingZeroes("002f" + "0".repeat(60))).toBe(10);
		expect(countLeadingZeroes("f".repeat(64))).toBe(0);
	});
	it("does nothing when the relay asks for no work", () => {
		expect(checkPow("f".repeat(64), [], 0)).toBe("");
	});
	it("measures the id against the relay minimum, not the declared target", () => {
		expect(checkPow("0f" + "f".repeat(62), [["nonce", "1", "4"]], 20)).toContain("difficulty 4 is less than 20");
		expect(checkPow(mined, [["nonce", "1", "36"]], 20)).toBe("");
		expect(checkPow(mined, [["nonce", "1", "36"]], 40)).toContain("less than 40");
	});
	it("accepts a mined id without a committed target", () => {
		expect(checkPow(mined, [], 20)).toBe("");
		expect(checkPow(mined, [["nonce", "1"]], 20)).toBe("");
	});
	it("refuses a committed target below the minimum, even with a lucky id", () => {
		expect(checkPow(mined, [["nonce", "1", "10"]], 20)).toContain("committed target difficulty 10");
		expect(checkPow(mined, [["nonce", "1", "abc"]], 20)).toContain("invalid target");
	});
});
