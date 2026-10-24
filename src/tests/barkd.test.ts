import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import bolt11 from "bolt11";

// Unit tests for the barkd payment provider and the X-Ark flow, against a mocked barkd
// HTTP server (bark-rest 0.8.0 endpoints). No running nostrcheck server or database needed:
// the database is an in-memory fake below.

// vi.mock factories are hoisted, so the state they use is too.
type Row = Record<string, string | number | null>;
const { config, getPath, db } = vi.hoisted(() => {
	const config: Record<string, unknown> = {};
	const getPath = (path: string[]) => path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], config);
	const db = { transactions: [] as Record<string, string | number | null>[], ledger: [] as Record<string, string | number | null>[], nextId: 1 };
	return { config, getPath, db };
});

vi.mock("../lib/config/core.js", () => ({
	getConfig: (_tenant: string | null, path: string[]) => getPath(path),
	getTenants: () => [],
	isModuleEnabled: () => true,
}));
vi.mock("../lib/logger.js", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/utils.js", () => ({ getNewDate: () => new Date().toISOString().slice(0, 19).replace("T", " ") }));
vi.mock("../lib/nostr/NIP04.js", () => ({ sendMessage: vi.fn() }));
vi.mock("../lib/nostr/NIP47.js", () => ({ generateNwcInvoice: vi.fn(), isInvoicePaidNwc: vi.fn() }));
vi.mock("../lib/payments/lnbits.js", () => ({ generateLNBitsInvoice: vi.fn(), isInvoicePaidLNbits: vi.fn() }));

// In-memory "transactions" and "ledger" tables, enough for the queries payments/core.ts makes.
vi.mock("../lib/database/core.js", () => ({
	dbSelect: async (query: string, field: string, params: string[]) => {
		if (query.startsWith("SELECT SUM(credit)")) return "0";
		const m = query.match(/FROM transactions WHERE (\w+) = \?/);
		if (!m) return "";
		const row = db.transactions.find(r => String(r[m[1]]) == String(params[0]));
		return row && row[field] != null ? String(row[field]) : "";
	},
	dbMultiSelect: async (fields: string[], table: string, where: string, params: unknown[]) => {
		if (table != "transactions") return [];
		const column = where.split(" ")[0];
		return db.transactions
			.filter(r => String(r[column]) == String(params[0]))
			.map(r => Object.fromEntries(fields.map(f => [f, r[f] ?? null])));
	},
	dbUpdate: async (table: string, fields: Row, whereFields: string[], whereValues: unknown[]) => {
		if (table != "transactions") return true;
		const rows = db.transactions.filter(r => whereFields.every((f, i) => String(r[f]) == String(whereValues[i])));
		rows.forEach(r => Object.assign(r, fields));
		return rows.length > 0;
	},
	dbInsert: async (table: string, fields: string[], values: unknown[]) => {
		const row = Object.fromEntries(fields.map((f, i) => [f, values[i]])) as Row;
		row.id = db.nextId++;
		(table == "ledger" ? db.ledger : db.transactions).push(row);
		return row.id;
	},
	dbDelete: async () => true,
}));

import { generateBarkdInvoice, getBarkdArkReceived, isInvoicePaidBarkd, newBarkdArkAddress } from "../lib/payments/barkd.js";
import { getArkPaymentRequest, getTransaction } from "../lib/payments/core.js";
import { checkArkProof } from "../lib/blossom/BUD07.js";

// --- mocked barkd ------------------------------------------------------------------------------

const TOKEN = "test-token";
const barkd = {
	addresses: 0,
	receives: new Map<string, { state: string, payment_preimage: string | null, settled_at: string | null }>(),
	movements: [] as { status: string, effective_balance_sat: number, received_on: { destination: { type: string, value: string }, amount_sat: number }[] }[],
	requests: [] as string[],
	signet: false,
};

const SIGNET = { bech32: "tbs", pubKeyHash: 0x6f, scriptHash: 0xc4, validWitnessVersions: [0, 1] };

const makeInvoice = (sats: number, paymentHash: string) => bolt11.sign(bolt11.encode({
	...(barkd.signet ? { network: SIGNET } : {}),
	satoshis: sats,
	timestamp: Math.floor(Date.now() / 1000),
	tags: [{ tagName: "payment_hash", data: paymentHash }, { tagName: "description", data: "" }, { tagName: "expire_time", data: 3600 }],
}), "11".repeat(32)).paymentRequest as string;

const arkPayment = (address: string, sats: number, status = "successful") => barkd.movements.push({
	status, effective_balance_sat: sats, received_on: [{ destination: { type: "ark", value: address }, amount_sat: sats }],
});

let server: http.Server;

beforeAll(async () => {
	server = http.createServer((req, res) => {
		const url = new URL(req.url || "", "http://localhost");
		barkd.requests.push(`${req.method} ${url.pathname}`);
		const send = (status: number, body?: unknown) => {
			res.writeHead(status, { "Content-Type": "application/json" });
			res.end(body === undefined ? "" : JSON.stringify(body));
		};
		if (req.headers.authorization != `Bearer ${TOKEN}`) return send(401, { message: "unauthorized" });

		let body = "";
		req.on("data", chunk => body += chunk);
		req.on("end", () => {
			const path = url.pathname;
			if (req.method == "POST" && path == "/api/v1/lightning/receives/invoice") {
				const { amount_sat } = JSON.parse(body);
				// barkd refuses an invoice whose amount is below its Lightning receive fee.
				if (amount_sat < 15) return send(500, { message: `Failed to create invoice: Fee (0.00000015 BTC) exceeds amount (${(amount_sat / 1e8).toFixed(8)} BTC)` });
				return send(200, { invoice: makeInvoice(amount_sat, "ab".repeat(32)) });
			}
			const receive = path.match(/^\/api\/v1\/lightning\/receives\/([0-9a-f]{64})$/);
			if (req.method == "GET" && receive) {
				const r = barkd.receives.get(receive[1]);
				return r ? send(200, { payment_hash: receive[1], amount_sat: 21, invoice: "", htlc_vtxo_ids: [], ...r }) : send(404, { message: "not found" });
			}
			if (req.method == "POST" && path == "/api/v1/wallet/addresses/next") return send(200, { address: `tark1testaddress${++barkd.addresses}` });
			if (req.method == "POST" && path == "/api/v1/wallet/sync/mailbox") return send(200, { checkpoint: 1 });
			if (req.method == "GET" && path == "/api/v1/history") {
				if (url.searchParams.get("type") != "ark") return send(400, { message: "bad request" });
				const address = url.searchParams.get("value");
				return send(200, barkd.movements.filter(m => m.received_on.some(d => d.destination.value == address)));
			}
			send(404, { message: "not found" });
		});
	});
	await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
	config.payments = {
		paymentProvider: "barkd",
		invoicePaidInterval: 3600,
		paymentProviders: { barkd: { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, authToken: TOKEN, ark: true } },
	};
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

beforeEach(() => {
	barkd.receives.clear();
	barkd.movements = [];
	barkd.requests = [];
	db.transactions = [];
	db.ledger = [];
});

const addTransaction = (satoshi: number) : Row => {
	const row: Row = {
		id: db.nextId++, type: "invoice", accountid: "1100000000", paymentrequest: "lntbs1testinvoice", paymenthash: "cd".repeat(32),
		arkaddress: null, satoshi, paid: 0, preimage: "", createddate: "2026-10-23 10:00:00",
		expirydate: "2999-01-01 00:00:00", paiddate: null, comments: "Invoice for: mediafiles:1",
	};
	db.transactions.push(row);
	return row;
};

// --- barkd provider ----------------------------------------------------------------------------

describe("barkd provider (bark-rest 0.8.0)", () => {

	test("Lightning invoice via barkd", async () => {
		const invoice = await generateBarkdInvoice(21, "");
		expect(invoice.paymentRequest.startsWith("lnbc")).toBe(true);
		expect(invoice.paymentHash).toBe("ab".repeat(32));
		expect(invoice.satoshi).toBe(21);
		expect(invoice.isPaid).toBe(false);
		expect(barkd.requests).toContain("POST /api/v1/lightning/receives/invoice");
	});

	test("An amount below the Lightning receive fee is still charged, over Ark only", async () => {
		// Before, the failed invoice came back empty and the upload went through unpaid.
		const invoice = await generateBarkdInvoice(12, "");
		expect(invoice.paymentRequest).toBe("");
		expect(invoice.paymentHash).toMatch(/^[0-9a-f]{64}$/);
		expect(invoice.satoshi).toBe(12);

		const row = addTransaction(12);
		row.paymentrequest = "";
		row.paymenthash = invoice.paymentHash;
		const uri = await getArkPaymentRequest("", await getTransaction("", String(row.id)));
		expect(uri).toMatch(/^bitcoin:\?ark=tark1testaddress\d+/);
		expect(uri).not.toContain("lightning=");
	});

	test("Lightning invoice on signet (lntbs prefix)", async () => {
		barkd.signet = true;
		try {
			const invoice = await generateBarkdInvoice(21, "");
			expect(invoice.paymentRequest.startsWith("lntbs")).toBe(true);
			expect(invoice.paymentHash).toBe("ab".repeat(32));
			expect(invoice.satoshi).toBe(21);
		} finally {
			barkd.signet = false;
		}
	});

	test("Lightning receive is paid only once settled", async () => {
		const hash = "ef".repeat(32);
		expect(await isInvoicePaidBarkd(hash)).toEqual({ paiddate: "", preimage: "" }); // 404
		barkd.receives.set(hash, { state: "preimage-revealed", payment_preimage: "12".repeat(32), settled_at: null });
		expect(await isInvoicePaidBarkd(hash)).toEqual({ paiddate: "", preimage: "" });
		barkd.receives.set(hash, { state: "settled", payment_preimage: "12".repeat(32), settled_at: "2026-10-23T10:00:00Z" });
		expect(await isInvoicePaidBarkd(hash)).toEqual({ paiddate: String(Date.parse("2026-10-23T10:00:00Z") / 1000), preimage: "12".repeat(32) });
	});

	test("Ark address and settled receipts", async () => {
		const address = await newBarkdArkAddress();
		expect(address).toMatch(/^tark1testaddress\d+$/);
		expect(await newBarkdArkAddress()).not.toBe(address);

		arkPayment(address, 2);
		arkPayment(address, 5, "pending");
		arkPayment("tark1someoneelse", 100);
		arkPayment(address, 1);
		expect(await getBarkdArkReceived(address)).toBe(3);
		expect(barkd.requests).toContain("POST /api/v1/wallet/sync/mailbox");
	});

	test("Errors are reported as -1, not as unpaid", async () => {
		const payments = config.payments as { paymentProviders: { barkd: { authToken: string } } };
		payments.paymentProviders.barkd.authToken = "wrong";
		try {
			expect(await getBarkdArkReceived("tark1x", false)).toBe(-1);
			expect(await newBarkdArkAddress()).toBe("");
		} finally {
			payments.paymentProviders.barkd.authToken = TOKEN;
		}
	});
});

// --- X-Ark flow --------------------------------------------------------------------------------

describe("X-Ark (Blossom BUD-07, hzrd149/blossom#116)", () => {

	test("402 carries a BIP-321 URI (ark + lightning + amount) with a fresh address per unpaid file", async () => {
		const a = addTransaction(3);
		const b = addTransaction(1500);
		const ta = await getTransaction("example.com", String(a.id));
		const uriA = await getArkPaymentRequest("example.com", ta);
		expect(uriA).toMatch(/^bitcoin:\?ark=tark1testaddress\d+&lightning=lntbs1testinvoice&amount=0\.00000003$/);
		// Only standard BIP-321 parameters: the address already encodes its Ark server
		expect(uriA).not.toContain("ark-server");

		// Same file, same address; another file, another address
		expect(await getArkPaymentRequest("example.com", await getTransaction("example.com", String(a.id)))).toBe(uriA);
		const uriB = await getArkPaymentRequest("example.com", await getTransaction("example.com", String(b.id)));
		expect(new URL(uriB).searchParams.get("amount")).toBe("0.000015");
		expect(new URL(uriB).searchParams.get("ark")).not.toBe(new URL(uriA).searchParams.get("ark"));
	});

	test("No lightning instruction when the transaction has no invoice", async () => {
		const a = addTransaction(3);
		a.paymentrequest = "";
		const uri = await getArkPaymentRequest("example.com", await getTransaction("example.com", String(a.id)));
		expect(uri).toMatch(/^bitcoin:\?ark=tark1testaddress\d+&amount=0\.00000003$/);
	});

	test("Concurrent 402s for one file get one address", async () => {
		const a = addTransaction(3);
		const t = await getTransaction("example.com", String(a.id));
		const [x, y] = await Promise.all([getArkPaymentRequest("example.com", { ...t }), getArkPaymentRequest("example.com", { ...t })]);
		expect(x).toBe(y);
		expect(barkd.requests.filter(r => r == "POST /api/v1/wallet/addresses/next")).toHaveLength(1);
	});

	test("No X-Ark when Ark payments are off", async () => {
		const payments = config.payments as { paymentProviders: { barkd: { ark: boolean } } };
		payments.paymentProviders.barkd.ark = false;
		try {
			const a = addTransaction(3);
			expect(await getArkPaymentRequest("example.com", await getTransaction("example.com", String(a.id)))).toBe("");
		} finally {
			payments.paymentProviders.barkd.ark = true;
		}
	});

	test("Proof: unknown, other request, unpaid, partial, paid, then redeemed once", async () => {
		const a = addTransaction(3);
		const other = addTransaction(3);
		await getArkPaymentRequest("example.com", await getTransaction("example.com", String(a.id)));
		const address = String(db.transactions.find(r => r.id == a.id)?.arkaddress);

		expect(await checkArkProof("example.com", undefined, String(a.id))).toEqual({ status: "none" });
		expect(await checkArkProof("example.com", "tark1unknown", String(a.id))).toEqual({ status: "invalid", reason: "Unknown Ark payment address" });
		expect(await checkArkProof("example.com", address, String(other.id))).toEqual({ status: "invalid", reason: "Ark payment address was issued for a different request" });
		expect(await checkArkProof("example.com", address, String(a.id))).toEqual({ status: "invalid", reason: "No settled Ark payment to this address yet" });

		arkPayment(address, 1);
		expect(await checkArkProof("example.com", address, String(a.id))).toEqual({ status: "invalid", reason: "Ark payment incomplete: 1 of 3 sats received" });

		arkPayment(address, 2);
		expect(await checkArkProof("example.com", address, String(a.id))).toEqual({ status: "valid" });
		expect(db.transactions.find(r => r.id == a.id)?.paid).toBe("1");
		const ledgerEntries = db.ledger.length;
		expect(ledgerEntries).toBeGreaterThan(0);

		// Already redeemed: the file is paid, nothing is collected twice
		expect(await checkArkProof("example.com", address, String(a.id))).toEqual({ status: "valid" });
		expect(db.ledger.length).toBe(ledgerEntries);
		// and the address can't pay for anything else
		expect((await checkArkProof("example.com", address, String(other.id))).status).toBe("invalid");
	});

	test("Overpayment is accepted", async () => {
		const a = addTransaction(3);
		await getArkPaymentRequest("example.com", await getTransaction("example.com", String(a.id)));
		const address = String(db.transactions.find(r => r.id == a.id)?.arkaddress);
		arkPayment(address, 10);
		expect(await checkArkProof("example.com", address, String(a.id))).toEqual({ status: "valid" });
	});
});
