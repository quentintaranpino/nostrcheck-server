import { describe, it, expect } from "vitest";
import { hasCommentRootScope } from "../src/lib/nostr/NIP22.js";
import { checkPow, countLeadingZeroes } from "../src/lib/nostr/NIP13.js";
import { getDeletionTargets, getEventAddress, parseAddress } from "../src/lib/nostr/NIP09.js";
import { cacheDeleted, isDeletedCached, isDeletedRecently, rememberDeletion } from "../src/lib/relay/deletions.js";

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

describe("NIP-09 deletion targets", () => {
	const other = "a".repeat(64);
	it("parses addresses, with colons in the d identifier", () => {
		expect(parseAddress(`30023:${pk}:my:post`)).toEqual({ kind: 30023, pubkey: pk, d: "my:post" });
		expect(parseAddress(`30023:${pk}:`)).toEqual({ kind: 30023, pubkey: pk, d: "" });
		expect(parseAddress(`10002:${pk}:ignored`)).toEqual({ kind: 10002, pubkey: pk, d: "" });
		expect(parseAddress(`1:${pk}:`)).toBeNull();
		expect(parseAddress(id)).toBeNull();
		expect(parseAddress(`30023:${pk}`)).toBeNull();
	});
	it("builds the address of an event the way an a tag writes it", () => {
		expect(getEventAddress({ kind: 30023, pubkey: pk, tags: [["d", "post"]] })).toBe(`30023:${pk}:post`);
		expect(getEventAddress({ kind: 30023, pubkey: pk, tags: [] })).toBe(`30023:${pk}:`);
		expect(getEventAddress({ kind: 0, pubkey: pk, tags: [] })).toBe(`0:${pk}:`);
		expect(getEventAddress({ kind: 1, pubkey: pk, tags: [] })).toBeNull();
	});
	it("splits e and a targets and drops addresses of other authors", () => {
		const targets = getDeletionTargets({ pubkey: pk, tags: [["e", id], ["e", id], ["e", "nothex"], ["a", `30023:${pk}:post`], ["a", `30023:${other}:post`], ["k", "1"]] });
		expect(targets.ids).toEqual([id]);
		expect(targets.addresses).toEqual([{ kind: 30023, pubkey: pk, d: "post" }]);
		expect(targets.hasTargets).toBe(true);
		expect(getDeletionTargets({ pubkey: pk, tags: [["k", "1"], ["e"]] }).hasTargets).toBe(false);
	});
});

describe("NIP-09 deletions waiting for the flush", () => {
	const author = "b".repeat(64);
	const base = { sig: "", content: "", tenantid: 1 };
	const deletion = { ...base, id: "d".repeat(64), pubkey: author, kind: 5, created_at: 1000, tags: [["e", id], ["a", `30023:${author}:post`]] };
	const now = 1_000_000;
	rememberDeletion(deletion, now);

	it("refuses the deleted id only from the same author", () => {
		expect(isDeletedRecently({ ...base, id, pubkey: author, kind: 1, created_at: 500, tags: [] }, undefined, now)).toBe(true);
		expect(isDeletedRecently({ ...base, id, pubkey: pk, kind: 1, created_at: 500, tags: [] }, undefined, now)).toBe(false);
	});
	it("refuses versions of the address up to the deletion, not newer ones", () => {
		const version = { ...base, id: "e".repeat(64), pubkey: author, kind: 30023, tags: [["d", "post"]] };
		expect(isDeletedRecently({ ...version, created_at: 1000 }, undefined, now)).toBe(true);
		expect(isDeletedRecently({ ...version, created_at: 1001 }, undefined, now)).toBe(false);
		expect(isDeletedRecently({ ...version, created_at: 900, tags: [["d", "other"]] }, undefined, now)).toBe(false);
	});
	it("keeps tenants apart in isolated mode", () => {
		expect(isDeletedRecently({ ...base, id, pubkey: author, kind: 1, created_at: 500, tags: [] }, 2, now)).toBe(false);
		expect(isDeletedRecently({ ...base, id, pubkey: author, kind: 1, created_at: 500, tags: [] }, 1, now)).toBe(true);
	});
	it("forgets a deletion once it has left the pending maps and the grace time", () => {
		expect(isDeletedRecently({ ...base, id, pubkey: author, kind: 1, created_at: 500, tags: [] }, undefined, now + 10 * 60 * 1000)).toBe(false);
	});
	it("caches the ids found deleted in the DB for a while", () => {
		cacheDeleted(id, undefined, now);
		expect(isDeletedCached(id, undefined, now + 1000)).toBe(true);
		expect(isDeletedCached(id, 2, now + 1000)).toBe(false);
		expect(isDeletedCached(id, undefined, now + 11 * 60 * 1000)).toBe(false);
	});
});
