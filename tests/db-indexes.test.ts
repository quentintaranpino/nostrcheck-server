import { describe, it, expect } from "vitest";
import { buildAddIndexStatement, buildDropIndexStatement, isOnlineIndex, parseIndexName, pickIndexJob, IndexJob } from "../src/lib/database/tables.js";
import { databaseTables } from "../src/interfaces/database.js";

const job = (overrides: Partial<IndexJob>): IndexJob => ({
	table: "events", name: "idx_a", action: "add", statement: "", afterJob: "", attempts: 0, nextTry: 0, ...overrides,
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

describe("declared schema", () => {
	it("never declares an index and drops it at the same time", () => {
		for (const table of databaseTables) {
			for (const [name, fields] of Object.entries(table)) {
				const declared = ((fields as Record<string, unknown>)["_indexes"] as string[] | undefined || []).map(parseIndexName);
				const dropped = (fields as Record<string, unknown>)["_dropIndexes"] as string[] | undefined || [];
				for (const index of dropped) expect(declared, `${name}.${index}`).not.toContain(index);
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
