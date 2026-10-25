import { describe, expect, test } from 'vitest';
import { moduleDataColumns, safeSortColumn, safeSortOrder } from '../lib/admin.js';

describe("Admin module data list - sort/filter column whitelist", () => {
	test("a column that belongs to the module is accepted as a sort column", () => {
		expect(safeSortColumn("media", "mediafiles.filename")).toEqual("mediafiles.filename");
	});

	test("a column outside the module's own list is refused, not interpolated", () => {
		expect(safeSortColumn("media", "mediafiles.id) UNION SELECT password FROM registered--")).toBeUndefined();
	});

	test("an unknown module has no columns to sort or filter on", () => {
		expect(moduleDataColumns("not-a-real-module")).toEqual([]);
		expect(safeSortColumn("not-a-real-module", "id")).toBeUndefined();
	});

	test("sort order only ever becomes ASC or DESC, whatever the request sends", () => {
		expect(safeSortOrder("asc")).toEqual("ASC");
		expect(safeSortOrder("ASC")).toEqual("ASC");
		expect(safeSortOrder("desc")).toEqual("DESC");
		expect(safeSortOrder("id; DROP TABLE registered;--")).toEqual("DESC");
		expect(safeSortOrder(undefined as unknown as string)).toEqual("DESC");
	});
});
