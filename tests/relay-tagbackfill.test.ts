import { describe, it, expect } from "vitest";
import { BATCH_MAX, BATCH_MIN, backfillPauseReason, batchSleepMs, nextBatchRange, nextBatchSize, parseBackfillState } from "../src/lib/relay/tagbackfill.js";

const idle = { loaded: true, paused: false, indexBuilding: false, lagMs: 0 };

describe("eventtags.created_at backfill", () => {
	it("starts from zero when there is no usable state", () => {
		const zero = { lastId: 0, maxId: 0, updated: 0, orphans: 0, startedAt: 0, finishedAt: 0 };
		expect(parseBackfillState(null)).toEqual(zero);
		expect(parseBackfillState("")).toEqual(zero);
		expect(parseBackfillState("{not json")).toEqual(zero);
		expect(parseBackfillState("[1,2]")).toEqual(zero);
	});
	it("resumes from the saved state and ignores bad values", () => {
		const state = parseBackfillState(JSON.stringify({ lastId: 40000, maxId: 48700000, updated: 39000, orphans: "12", startedAt: -5, other: 1 }));
		expect(state).toEqual({ lastId: 40000, maxId: 48700000, updated: 39000, orphans: 12, startedAt: 0, finishedAt: 0 });
		expect(parseBackfillState({ lastId: 7.9 }).lastId).toBe(7);
	});
	it("walks the table by id range and stops at the end", () => {
		const state = parseBackfillState({ lastId: 0, maxId: 45000 });
		expect(nextBatchRange(state, 20000)).toEqual({ from: 0, to: 20000 });
		state.lastId = 40000;
		expect(nextBatchRange(state, 20000)).toEqual({ from: 40000, to: 45000 });
		state.lastId = 45000;
		expect(nextBatchRange(state, 20000)).toBe(null);
		expect(nextBatchRange(parseBackfillState(null), 20000)).toBe(null);
	});
	it("waits while the store loads, an index is built, the loop is slow or it is paused by hand", () => {
		expect(backfillPauseReason(idle)).toBe("");
		expect(backfillPauseReason({ ...idle, lagMs: 250 })).toBe("");
		expect(backfillPauseReason({ ...idle, loaded: false })).not.toBe("");
		expect(backfillPauseReason({ ...idle, indexBuilding: true })).not.toBe("");
		expect(backfillPauseReason({ ...idle, lagMs: 251 })).not.toBe("");
		expect(backfillPauseReason({ ...idle, paused: true })).toContain("paused");
	});
	it("shrinks the batch when the DB is slow and grows it back when it is fast", () => {
		expect(nextBatchSize(20000, 2500)).toBe(10000);
		expect(nextBatchSize(20000, 100, true)).toBe(10000);
		expect(nextBatchSize(1500, 5000)).toBe(BATCH_MIN);
		expect(nextBatchSize(5000, 100)).toBe(10000);
		expect(nextBatchSize(20000, 100)).toBe(BATCH_MAX);
		expect(nextBatchSize(10000, 1000)).toBe(10000);
	});
	it("rests at least a second, and twice what the batch took", () => {
		expect(batchSleepMs(50)).toBe(1000);
		expect(batchSleepMs(1800)).toBe(3600);
	});
});
