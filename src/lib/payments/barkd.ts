// barkd is the REST daemon of the Bark wallet (https://gitlab.com/ark-bitcoin/bark, crate bark-rest).
// Written against bark-rest 0.8.0. All endpoints live under /api/v1 and take the auth token as a bearer token.
//
// Two ways to get paid:
// - Lightning: BOLT11 invoices, received through the Ark server's Lightning gateway.
// - Ark: a fresh Ark address per unpaid file, paid off-chain by wallets on the same Ark server
//   (Blossom X-Ark: https://github.com/hzrd149/blossom/pull/116).

import { randomBytes } from "crypto";
import bolt11 from 'bolt11';
import { emptyInvoice, Invoice } from "../../interfaces/payments.js";
import { logger } from "../logger.js";
import { getNewDate } from "../utils.js";
import { getConfig } from "../config/core.js";

const BARKD_TIMEOUT_MS = 10000;

// The bolt11 library only knows the bc, tb, bcrt and sb prefixes. Signet invoices (lntbs…, as made by
// barkd on a signet Ark server) need their network passed in, or decode throws "Unknown coin bech32 prefix".
const SIGNET = { bech32: "tbs", pubKeyHash: 0x6f, scriptHash: 0xc4, validWitnessVersions: [0, 1] };
const decodeInvoice = (invoice: string) =>
    bolt11.decode(invoice, invoice.toLowerCase().startsWith("lntbs") ? SIGNET : undefined);

const barkdRequest = async (method: "GET" | "POST", path: string, body?: object) : Promise<unknown> => {

    const url = String(getConfig(null, ["payments", "paymentProviders", "barkd", "url"]) || "").replace(/\/+$/, "");
    if (url == "") throw new Error("barkd url not set");
    const token = getConfig(null, ["payments", "paymentProviders", "barkd", "authToken"]) || "";

    const headers: Record<string, string> = { "Accept": "application/json" };
    if (token != "") headers["Authorization"] = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(url + "/api/v1" + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(BARKD_TIMEOUT_MS),
    });

    const text = await response.text();
    if (!response.ok) {
        const error = new Error(`barkd ${method} ${path} returned ${response.status}: ${text.slice(0, 200)}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
    }
    return text == "" ? null : JSON.parse(text);
}

const generateBarkdInvoice = async (amount: number, memo: string) : Promise<Invoice> => {

    if (amount == 0) return emptyInvoice;

    try {
        const data = await barkdRequest("POST", "/lightning/receives/invoice", { amount_sat: amount, description: memo }) as { invoice?: string };
        if (!data || !data.invoice) return emptyInvoice;

        const decoded = decodeInvoice(data.invoice);
        const paymentHash = decoded.tags.find(t => t.tagName == "payment_hash")?.data?.toString() || "";
        if (paymentHash == "") return emptyInvoice;

        return {
            paymentRequest: data.invoice,
            paymentHash: paymentHash,
            satoshi: decoded.satoshis ? decoded.satoshis : amount,
            isPaid: false,
            preimage: "",
            createdDate: decoded.timestampString ? new Date(decoded.timestampString).toISOString().slice(0, 19).replace('T', ' ') : getNewDate(),
            expiryDate: decoded.timeExpireDateString ? new Date(decoded.timeExpireDateString).toISOString().slice(0, 19).replace('T', ' ') : getNewDate(),
            paidDate: "",
            description: memo,
            transactionid: 0,
            accountid: 0
        };

    } catch (e) {
        // An amount below barkd's Lightning receive fee cannot get an invoice, but it can still be
        // paid over Ark, which has no receive fee. Returning no invoice here would let the file
        // through unpaid, so the charge is kept and made payable by its Ark address only (X-Ark).
        if (getConfig(null, ["payments", "paymentProviders", "barkd", "ark"]) == true && /exceeds amount/.test(String(e))) {
            logger.info(`generateBarkdInvoice - ${amount} sat is below the Lightning receive fee; charging over Ark only`);
            return arkOnlyInvoice(amount, memo);
        }
        logger.error(`generateBarkdInvoice - Error generating barkd invoice with error ${e}`);
        return emptyInvoice;
    }
}

// A charge with no Lightning invoice. It still needs a payment hash, because transactions are keyed by
// it; a random one never matches a real invoice, so only the Ark address can settle it.
const arkOnlyInvoice = (amount: number, memo: string) : Invoice => {
    const now = new Date();
    return {
        paymentRequest: "",
        paymentHash: randomBytes(32).toString("hex"),
        satoshi: amount,
        isPaid: false,
        preimage: "",
        createdDate: now.toISOString().slice(0, 19).replace('T', ' '),
        expiryDate: new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        paidDate: "",
        description: memo,
        transactionid: 0,
        accountid: 0
    };
}

const isInvoicePaidBarkd = async (paymentHash: string) : Promise<{paiddate : string, preimage : string}> => {

    if (paymentHash == "") return {paiddate: "", preimage: ""};

    try {
        const data = await barkdRequest("GET", "/lightning/receives/" + paymentHash) as { state?: string, payment_preimage?: string | null, settled_at?: string | null };

        // "settled": the wallet has claimed the payment from the Ark server and can spend it.
        if (data && data.state == "settled" && data.payment_preimage) {
            const settled = data.settled_at ? new Date(data.settled_at) : new Date();
            return {paiddate: Math.floor(settled.getTime() / 1000).toString(), preimage: data.payment_preimage};
        }
        return {paiddate: "", preimage: ""};

    } catch (e) {
        // 404: not a receive of this wallet (for example an invoice made by another provider).
        if ((e as { status?: number }).status != 404) {
            logger.error(`isInvoicePaidBarkd - Error checking barkd invoice status with error ${e}`);
        }
        return {paiddate: "", preimage: ""};
    }
}

const newBarkdArkAddress = async () : Promise<string> => {
    try {
        const data = await barkdRequest("POST", "/wallet/addresses/next") as { address?: string };
        return data?.address || "";
    } catch (e) {
        logger.error(`newBarkdArkAddress - Error getting a new Ark address from barkd with error ${e}`);
        return "";
    }
}

// Pull pending arkoor receives from the Ark server mailbox, so the history is current.
const syncBarkdMailbox = async () : Promise<void> => {
    try {
        await barkdRequest("POST", "/wallet/sync/mailbox");
    } catch (e) {
        logger.debug(`syncBarkdMailbox - Error syncing barkd mailbox with error ${e}`);
    }
}

interface BarkdMovement {
    status: string;
    effective_balance_sat: number;
    received_on: { destination: { type: string, value: string }, amount_sat: number }[];
}

/**
 * Returns the satoshis received on an Ark address and settled in the wallet
 * (successful movements only), or -1 if barkd could not be asked.
 */
const getBarkdArkReceived = async (address: string, sync = true) : Promise<number> => {

    if (address == "") return 0;
    if (sync) await syncBarkdMailbox();

    try {
        const movements = await barkdRequest("GET", "/history?type=ark&value=" + encodeURIComponent(address)) as BarkdMovement[];
        let received = 0;
        for (const movement of movements || []) {
            if (movement.status != "successful") continue;
            const onAddress = (movement.received_on || []).filter(d => d.destination?.type == "ark" && d.destination?.value == address);
            received += onAddress.reduce((sum, d) => sum + Number(d.amount_sat || 0), 0);
        }
        return received;
    } catch (e) {
        logger.error(`getBarkdArkReceived - Error reading barkd history for ${address} with error ${e}`);
        return -1;
    }
}

export { generateBarkdInvoice, isInvoicePaidBarkd, newBarkdArkAddress, getBarkdArkReceived, syncBarkdMailbox };
