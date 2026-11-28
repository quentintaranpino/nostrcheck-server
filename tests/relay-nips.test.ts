import { describe, it, expect } from "vitest";
import { hasCommentRootScope } from "../src/lib/nostr/NIP22.js";

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
