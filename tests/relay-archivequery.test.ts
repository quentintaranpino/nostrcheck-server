import { describe, it, expect } from "vitest";
import { Filter } from "nostr-tools";
import { AUTHOR_KIND_MAX_BRANCHES, TAG_WALK_MAX, buildAuthorKindQuery, archiveUntil, buildArchiveWhere, buildTagCandidatesQuery, buildTagIdsQuery, getArchiveHint, isTagWalkDone, pickDrivingTag, tagWalkLimit } from "../src/lib/relay/archivequery.js";

const pk = "3c9849383bdea883b0bd16fece1ed36d37e37cdde3ce43b17ea4e9192ec11289";
const id = "5b4fc7fed15672fefe65d2426f67197b71ccc82aa0cc8a9e94f683eb78e07651";
const id2 = "000000000e9d97a1ab09fc381030b346cdd7a142ad57e6df0b46dc9bef6c7e2d";
const placeholders = (sql: string): number => (sql.match(/\?/g) || []).length;

describe("archive WHERE", () => {
	it("builds authors + kinds with the time bounds and the tenant", () => {
		const clause = buildArchiveWhere({ authors: [pk], kinds: [1, 7], since: 100 }, 5000, 3);
		expect(clause?.where).toBe(" AND e.pubkey IN (?) AND e.kind IN (?,?) AND e.created_at >= ? AND e.created_at <= ? AND e.tenantid = ?");
		expect(clause?.params).toEqual([pk, 1, 7, 100, 4999, 3]);
	});
	it("never reads past createdBefore", () => {
		expect(archiveUntil({ until: 9000 }, 5000)).toBe(4999);
		expect(archiveUntil({ until: 3000 }, 5000)).toBe(3000);
		expect(archiveUntil({}, 5000)).toBe(4999);
	});
	it("returns null when a list has no usable value", () => {
		expect(buildArchiveWhere({ ids: ["nope"] }, 5000)).toBe(null);
		expect(buildArchiveWhere({ authors: ["nope"] }, 5000)).toBe(null);
		expect(buildArchiveWhere({ "#t": [1 as unknown as string] }, 5000)).toBe(null);
		expect(buildArchiveWhere({ "#t": [1 as unknown as string] }, 5000, undefined, { skipTag: "#t" })).toBe(null);
		expect(buildArchiveWhere({ "#t": ["nostr"] }, 5000, undefined, { skipTag: "#t", eventIds: [] })).toBe(null);
	});
	it("keeps the tag subquery unless the caller resolved that tag", () => {
		const filter: Filter = { kinds: [1], "#t": ["nostr", "bitcoin"], "#p": [pk] };
		const full = buildArchiveWhere(filter, 5000);
		expect(full?.where).toContain("et.tag_name = ? AND et.tag_value IN (?,?)");
		expect(full?.params).toEqual([1, "t", "nostr", "bitcoin", "p", pk, 4999]);
		const skipped = buildArchiveWhere(filter, 5000, undefined, { skipTag: "#p", eventIds: [id, id2] });
		expect(skipped?.where.startsWith(" AND e.event_id IN (?,?) AND e.kind IN (?)")).toBe(true);
		expect(skipped?.params).toEqual([id, id2, 1, "t", "nostr", "bitcoin", 4999]);
		expect(placeholders(skipped!.where)).toBe(skipped!.params.length);
	});
	it("takes every event id it is given, past the cap on filter lists", () => {
		const ids = Array.from({ length: 600 }, (_, i) => i.toString(16).padStart(64, "0"));
		const clause = buildArchiveWhere({ "#t": ["nostr"] }, 5000, undefined, { skipTag: "#t", eventIds: ids });
		expect(clause?.params.length).toBe(601);
	});
});

describe("archive index hint", () => {
	it("forces the author index only when authors lead the query", () => {
		expect(getArchiveHint({ authors: [pk], kinds: [1] })).toBe("FORCE INDEX (idx_pubkey_kind_created)");
		expect(getArchiveHint({ authors: [pk] })).toBe("FORCE INDEX (idx_pubkey_kind_created)");
		expect(getArchiveHint({ ids: [id], authors: [pk] })).toBe("");
		expect(getArchiveHint({ kinds: [1], "#t": ["nostr"] })).toBe("");
	});
});

describe("authors + kinds as ordered index ranges", () => {
	it("reads one branch per author and kind, ordered by created_at alone", () => {
		const q = buildAuthorKindQuery({ authors: [pk], kinds: [1, 7], since: 100 }, 5000, 101, 3)!;
		expect(q.query.match(/FORCE INDEX \(idx_pubkey_kind_created\)/g)?.length).toBe(2);
		expect(q.query.match(/UNION ALL/g)?.length).toBe(1);
		expect(q.query.match(/ORDER BY e\.created_at DESC LIMIT 101/g)?.length).toBe(2);
		expect(q.query).toContain("WHERE e.active = '1' AND e.pubkey = ? AND e.kind = ? AND e.created_at >= ? AND e.created_at <= ? AND e.tenantid = ?");
		expect(q.query.trim().endsWith("b ORDER BY b.created_at DESC, b.event_id DESC LIMIT 101")).toBe(true);
		expect(q.params).toEqual([pk, 1, 100, 4999, 3, pk, 7, 100, 4999, 3]);
		expect(placeholders(q.query)).toBe(q.params.length);
	});
	it("is left for the plain query when the filter has ids, tags, no kinds or bad values", () => {
		expect(buildAuthorKindQuery({ authors: [pk] }, 5000, 10)).toBe(null);
		expect(buildAuthorKindQuery({ kinds: [1] }, 5000, 10)).toBe(null);
		expect(buildAuthorKindQuery({ ids: [id], authors: [pk], kinds: [1] }, 5000, 10)).toBe(null);
		expect(buildAuthorKindQuery({ authors: [pk], kinds: [1], "#t": ["nostr"] }, 5000, 10)).toBe(null);
		expect(buildAuthorKindQuery({ authors: [pk, "nope"], kinds: [1] }, 5000, 10)).toBe(null);
		expect(buildAuthorKindQuery({ authors: [pk], kinds: [1, -1] }, 5000, 10)).toBe(null);
	});
	it("is not used past a few branches", () => {
		const kinds = Array.from({ length: AUTHOR_KIND_MAX_BRANCHES + 1 }, (_, i) => i);
		expect(buildAuthorKindQuery({ authors: [pk], kinds }, 5000, 10)).toBe(null);
		expect(buildAuthorKindQuery({ authors: [pk], kinds: kinds.slice(1) }, 5000, 10)).not.toBe(null);
	});
});

describe("tag filters through idx_tag_created", () => {
	it("is only used when no ids or authors lead the query", () => {
		expect(pickDrivingTag({ "#t": ["nostr"] })?.name).toBe("t");
		expect(pickDrivingTag({ kinds: [7], "#e": [id] })?.key).toBe("#e");
		expect(pickDrivingTag({ authors: [pk], "#t": ["nostr"] })).toBe(null);
		expect(pickDrivingTag({ ids: [id], "#t": ["nostr"] })).toBe(null);
		expect(pickDrivingTag({ kinds: [1] })).toBe(null);
		expect(pickDrivingTag({ "#t": [] })).toBe(null);
	});
	it("drives from the tag with fewer values and drops repeated ones", () => {
		const tag = pickDrivingTag({ "#t": ["nostr", "bitcoin", "nostr"], "#p": [pk] });
		expect(tag).toEqual({ key: "#p", name: "p", values: [pk] });
		expect(pickDrivingTag({ "#t": ["nostr", "nostr"] })?.values).toEqual(["nostr"]);
	});
	it("reads one value straight from the index, newest first", () => {
		const q = buildTagCandidatesQuery({ key: "#t", name: "t", values: ["nostr"] }, 0, 4999, 200, 3);
		expect(q.query).toContain("SET STATEMENT max_statement_time = 3 FOR SELECT et.event_id, et.created_at FROM eventtags et FORCE INDEX (idx_tag_created)");
		expect(q.query).toContain("ORDER BY et.created_at DESC LIMIT 200");
		expect(q.query).not.toContain("UNION");
		expect(q.query).not.toContain("et.created_at >= ?");
		expect(q.params).toEqual(["t", "nostr", 4999]);
	});
	it("reads each value on its own branch and merges them", () => {
		const q = buildTagCandidatesQuery({ key: "#t", name: "t", values: ["nostr", "bitcoin"] }, 100, 4999, 200, 3);
		expect(q.query.match(/UNION ALL/g)?.length).toBe(1);
		expect(q.query.match(/FORCE INDEX \(idx_tag_created\)/g)?.length).toBe(2);
		expect(q.query.trim().endsWith("c ORDER BY c.created_at DESC LIMIT 200")).toBe(true);
		expect(q.params).toEqual(["t", "nostr", 4999, 100, "t", "bitcoin", 4999, 100]);
		expect(placeholders(q.query)).toBe(q.params.length);
	});
	it("builds the id query for NIP-77 with the tag rows first", () => {
		const filter: Filter = { kinds: [1], "#t": ["nostr", "bitcoin"], since: 100 };
		const tag = pickDrivingTag(filter)!;
		const clause = buildArchiveWhere(filter, 5000, 2, { skipTag: tag.key })!;
		const q = buildTagIdsQuery(tag, 100, 4999, clause.where, 1001, 5);
		expect(q.query).toContain("FROM eventtags et FORCE INDEX (idx_tag_created)");
		expect(q.query).toContain("STRAIGHT_JOIN events e ON e.event_id = et.event_id");
		expect(q.query).toContain("e.kind NOT IN (4, 14, 1059)");
		expect(q.query).not.toContain("SELECT et.event_id FROM eventtags");
		expect(q.query.trim().endsWith("LIMIT 1001")).toBe(true);
		expect([...q.params, ...clause.params]).toEqual(["t", "nostr", "bitcoin", 4999, 100, 1, 100, 4999, 2]);
		expect(placeholders(q.query)).toBe(q.params.length + clause.params.length);
	});
	it("asks for more tag rows on each round, up to the cap", () => {
		expect(tagWalkLimit(10, 0)).toBe(100);
		expect(tagWalkLimit(101, 0)).toBe(202);
		expect(tagWalkLimit(101, 1)).toBe(808);
		expect(tagWalkLimit(101, 2)).toBe(TAG_WALK_MAX);
		expect(tagWalkLimit(501, 0)).toBe(1002);
	});
	it("stops when the tag has no more rows", () => {
		expect(isTagWalkDone([], 10, true, 0)).toBe(true);
		expect(isTagWalkDone([900, 800], 10, true, 0)).toBe(true);
	});
	it("stops only when enough events are newer than the oldest tag row read", () => {
		expect(isTagWalkDone([900, 800, 700], 3, false, 600)).toBe(true);
		// The third event shares its second with unread tag rows: they could sort before it.
		expect(isTagWalkDone([900, 800, 700], 3, false, 700)).toBe(false);
		expect(isTagWalkDone([900, 800], 3, false, 100)).toBe(false);
		expect(isTagWalkDone([900, 800, 700, 650], 3, false, 650)).toBe(true);
	});
});
