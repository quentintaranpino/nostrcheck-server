import { describe, test, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Unit tests: no running server or database needed. The payments core is mocked.
vi.mock("../lib/logger.js", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/payments/core.js", () => ({ getInvoice: vi.fn(), collectInvoice: vi.fn(), getTransactionByArkAddress: vi.fn(), redeemArkPayment: vi.fn() }));

import { checkLightningProof } from "../lib/blossom/BUD07.js";
import { collectInvoice, getInvoice } from "../lib/payments/core.js";
import { emptyInvoice, Invoice } from "../interfaces/payments.js";

const preimage = "11".repeat(32);
const paymentHash = crypto.createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
const openInvoice: Invoice = { ...emptyInvoice, paymentHash, paymentRequest: "lnbc1...", satoshi: 21, isPaid: false, transactionid: 7, accountid: 1100000001 };

describe("BUD-07 X-Lightning proof", () => {

	beforeEach(() => {
		vi.mocked(getInvoice).mockReset();
		vi.mocked(collectInvoice).mockReset().mockResolvedValue(true);
	});

	test("No header means no proof", async () => {
		expect(await checkLightningProof("example.com", undefined, "7")).toEqual({ status: "none" });
		expect(await checkLightningProof("example.com", " ", "7")).toEqual({ status: "none" });
		expect(getInvoice).not.toHaveBeenCalled();
	});

	test("A malformed preimage is invalid (400), not another 402", async () => {
		const result = await checkLightningProof("example.com", "not-a-preimage", "7");
		expect(result).toEqual({ status: "invalid", reason: "Invalid Lightning preimage" });
		expect(getInvoice).not.toHaveBeenCalled();
	});

	test("An unknown or expired preimage is invalid", async () => {
		vi.mocked(getInvoice).mockResolvedValue({ ...emptyInvoice });
		const result = await checkLightningProof("example.com", preimage, "7");
		expect(result).toEqual({ status: "invalid", reason: "Unknown or expired Lightning invoice" });
		expect(getInvoice).toHaveBeenCalledWith("example.com", paymentHash);
	});

	test("A preimage for another file is invalid", async () => {
		vi.mocked(getInvoice).mockResolvedValue({ ...openInvoice });
		const result = await checkLightningProof("example.com", preimage, "8");
		expect(result.status).toBe("invalid");
		expect(collectInvoice).not.toHaveBeenCalled();
	});

	test("A valid preimage collects the open invoice once", async () => {
		vi.mocked(getInvoice).mockResolvedValue({ ...openInvoice });
		const result = await checkLightningProof("example.com", preimage.toUpperCase(), "7");
		expect(result).toEqual({ status: "valid" });
		expect(collectInvoice).toHaveBeenCalledTimes(1);
		expect(vi.mocked(collectInvoice).mock.calls[0][1].preimage).toBe(preimage);
	});

	test("A valid preimage for an already collected invoice is accepted without collecting again", async () => {
		vi.mocked(getInvoice).mockResolvedValue({ ...openInvoice, isPaid: true });
		expect(await checkLightningProof("example.com", preimage, "7")).toEqual({ status: "valid" });
		expect(collectInvoice).not.toHaveBeenCalled();
	});
});
