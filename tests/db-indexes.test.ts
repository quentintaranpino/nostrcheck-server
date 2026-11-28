import { describe, it, expect } from "vitest";
import { buildAddIndexStatement, buildDropIndexStatement, isCompleteIndex, isOnlineIndex, parseDropEntry, parseIndexName, pickIndexJob, requiredFreeBytes, IndexJob } from "../src/lib/database/tables.js";
import { databaseTables } from "../src/interfaces/database.js";

const job = (overrides: Partial<IndexJob>): IndexJob => ({
	table: "events", name: "idx_a", action: "add", statement: "", afterJob: "", afterIndex: "", attempts: 0, nextTry: 0, ...overrides,
});

describe("startup index statements", () => {
	it("reads the index name from a definition", () => {
		expect(parseIndexName("INDEX idx_pubkey_kind_created (pubkey, kind, created_at)")).toBe("idx_pubkey_kind_created");
		expect(parseIndexName("UNIQUE INDEX idx_pubkey_domain (pubkey, hex, domain)")).toBe("idx_pubkey_domain");
		expect(parseIndexName("INDEX idx_tag_created(tag_name, tag_value(100), created_at)")).toBe("idx_tag_created");
		expect(parseIndexName("INDEX `idx_quoted` (a)")).toBe("idx_quoted");
		expect(parseIndexName("KEY nothing")).toBe(null);
	});
	it("only goes online on InnoDB and never for fulltext or spatial indexes", () => {
		expect(isOnlineIndex("InnoDB", "INDEX idx_a (a)")).toBe(true);
		expect(isOnlineIndex("innodb")).toBe(true);
		expect(isOnlineIndex("MyISAM", "INDEX idx_a (a)")).toBe(false);
		expect(isOnlineIndex("", "INDEX idx_a (a)")).toBe(false);
		expect(isOnlineIndex("InnoDB", "FULLTEXT INDEX idx_a (a)")).toBe(false);
		expect(isOnlineIndex("InnoDB", "SPATIAL INDEX idx_a (a)")).toBe(false);
	});
	it("builds the add and drop statements", () => {
		expect(buildAddIndexStatement("eventtags", "INDEX idx_a (a, b(100))", true)).toBe("ALTER TABLE `eventtags` ADD INDEX idx_a (a, b(100)), ALGORITHM=INPLACE, LOCK=NONE");
		expect(buildAddIndexStatement("eventtags", "INDEX idx_a (a)", false)).toBe("ALTER TABLE `eventtags` ADD INDEX idx_a (a)");
		expect(buildDropIndexStatement("events", "idx_pubkey", true)).toBe("ALTER TABLE `events` DROP INDEX `idx_pubkey`, ALGORITHM=INPLACE, LOCK=NONE");
		expect(buildDropIndexStatement("events", "idx_pubkey", false)).toBe("ALTER TABLE `events` DROP INDEX `idx_pubkey`");
	});
});

describe("background index queue", () => {
	it("takes the jobs in order", () => {
		const jobs = [job({ name: "idx_a" }), job({ name: "idx_b" })];
		expect(pickIndexJob(jobs, 1000, new Set())?.name).toBe("idx_a");
	});
	it("skips a job that is waiting to be retried", () => {
		const jobs = [job({ name: "idx_a", nextTry: 2000 }), job({ name: "idx_b" })];
		expect(pickIndexJob(jobs, 1000, new Set())?.name).toBe("idx_b");
		expect(pickIndexJob(jobs, 2000, new Set())?.name).toBe("idx_a");
	});
	it("holds an index back until the job it waits for is done", () => {
		const jobs = [job({ name: "idx_tag_created", afterJob: "eventtags_created_at" }), job({ name: "idx_pubkey", action: "drop" })];
		expect(pickIndexJob(jobs, 1000, new Set())?.name).toBe("idx_pubkey");
		expect(pickIndexJob([jobs[0]], 1000, new Set())).toBe(null);
		expect(pickIndexJob(jobs, 1000, new Set(["eventtags_created_at"]))?.name).toBe("idx_tag_created");
	});
});

describe("conditional index drop", () => {
	it("reads plain and conditional entries", () => {
		expect(parseDropEntry("idx_pubkey")).toEqual({ name: "idx_pubkey", when: "" });
		expect(parseDropEntry({ name: "idx_tag_name_value", when: "idx_tag_created" })).toEqual({ name: "idx_tag_name_value", when: "idx_tag_created" });
		expect(parseDropEntry(null)).toEqual({ name: "", when: "" });
		expect(parseDropEntry({ when: "idx_a" }).name).toBe("");
	});
	it("holds the drop until the index that takes over is whole", () => {
		const jobs = [job({ table: "eventtags", name: "idx_tag_name_value", action: "drop", afterIndex: "idx_tag_created" })];
		expect(pickIndexJob(jobs, 1000, new Set())).toBe(null);
		expect(pickIndexJob(jobs, 1000, new Set(), new Set(["events.idx_tag_created"]))).toBe(null);
		expect(pickIndexJob(jobs, 1000, new Set(), new Set(["eventtags.idx_tag_created"]))?.name).toBe("idx_tag_name_value");
	});
	it("only takes an index that exists, has no prefix and is not ignored", () => {
		expect(isCompleteIndex([])).toBe(false);
		expect(isCompleteIndex([{ Sub_part: null }, { Sub_part: null }, { Sub_part: null }])).toBe(true);
		expect(isCompleteIndex([{ Sub_part: null }, { Sub_part: 100 }, { Sub_part: null }])).toBe(false);
		expect(isCompleteIndex([{ Sub_part: null, Ignored: "YES" }])).toBe(false);
		expect(isCompleteIndex([{ Sub_part: null, Ignored: "NO" }])).toBe(true);
	});
	it("asks for 15 GB of free disk, or twice the index when that is more", () => {
		const gb = 1024 * 1024 * 1024;
		expect(requiredFreeBytes(0)).toBe(15 * gb);
		expect(requiredFreeBytes(5.5 * gb)).toBe(15 * gb);
		expect(requiredFreeBytes(10 * gb)).toBe(20 * gb);
	});
});

describe("declared schema", () => {
	it("never declares an index and drops it at the same time", () => {
		for (const table of databaseTables) {
			for (const [name, fields] of Object.entries(table)) {
				const declared = ((fields as Record<string, unknown>)["_indexes"] as string[] | undefined || []).map(parseIndexName);
				const dropped = ((fields as Record<string, unknown>)["_dropIndexes"] as unknown[] | undefined || []).map(parseDropEntry);
				for (const index of dropped) {
					expect(index.name, name).not.toBe("");
					expect(declared, `${name}.${index.name}`).not.toContain(index.name);
					// An index is only dropped in favour of one the table still declares.
					if (index.when != "") expect(declared, `${name}.${index.name}`).toContain(index.when);
				}
				expect(declared, name).not.toContain(null);
				expect(new Set(declared).size, name).toBe(declared.length);
			}
		}
	});
	it("only makes an index wait for a job when the index is declared", () => {
		for (const table of databaseTables) {
			for (const [name, fields] of Object.entries(table)) {
				const declared = ((fields as Record<string, unknown>)["_indexes"] as string[] | undefined || []).map(parseIndexName);
				const afterJob = (fields as Record<string, unknown>)["_indexAfterJob"] as Record<string, string> | undefined || {};
				for (const index of Object.keys(afterJob)) expect(declared, `${name}.${index}`).toContain(index);
			}
		}
	});
});
