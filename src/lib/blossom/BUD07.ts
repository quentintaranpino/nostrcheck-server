import crypto from "crypto";
import { logger } from "../logger.js";
import { collectInvoice, getInvoice } from "../payments/core.js";

/**
 * Result of checking a BUD-07 payment proof sent by a client.
 *
 * - none:    the request carries no proof for this method.
 * - valid:   the proof pays for this request (the invoice is collected if it was still open).
 * - invalid: the proof was sent but can't be accepted. BUD-07 requires a 400 with
 *            `reason` as X-Reason, never another 402.
 */
type PaymentProof =
	| { status: "none" }
	| { status: "valid" }
	| { status: "invalid"; reason: string };

/**
 * Checks the `X-Lightning` proof (a payment preimage) of a BUD-07 request. Visit for more information:
 * https://github.com/hzrd149/blossom/blob/master/buds/07.md
 *
 * @param tenant - The tenant (hostname) of the request.
 * @param header - The raw value of the `X-Lightning` request header, if any.
 * @param transactionId - The transaction the request has to be paid with ("" if none yet).
 * @returns The check result. On "valid" the invoice is already marked as paid.
 */
const checkLightningProof = async (tenant: string, header: string | undefined, transactionId: string): Promise<PaymentProof> => {

	if (header == undefined || header.trim() == "") return { status: "none" };

	const preimage = header.trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(preimage)) {
		return { status: "invalid", reason: "Invalid Lightning preimage" };
	}

	const paymentHash = crypto.createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
	const invoice = await getInvoice(tenant, paymentHash);

	// An expired invoice is replaced by a new one with a new payment hash, so its preimage is unknown too.
	if (invoice.paymentHash == "") {
		return { status: "invalid", reason: "Unknown or expired Lightning invoice" };
	}

	if (transactionId == "" || invoice.transactionid.toString() != transactionId.toString()) {
		return { status: "invalid", reason: "Lightning invoice was issued for a different request" };
	}

	if (invoice.isPaid != true) {
		invoice.preimage = preimage;
		if (!await collectInvoice(tenant, invoice, false, true)) {
			logger.error(`checkLightningProof - Error collecting invoice for transaction: ${transactionId}`);
		}
	}

	return { status: "valid" };
};

export { checkLightningProof, PaymentProof };
