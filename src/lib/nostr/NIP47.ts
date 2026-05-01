// https://github.com/getAlby/js-sdk
// https://github.com/getAlby/js-lightning-tools
// https://github.com/getAlby/js-sdk/tree/master/examples/nwc
// https://github.com/nostr-protocol/nips/blob/master/47.md

import { emptyInvoice, Invoice } from "../../interfaces/payments.js";
import { logger } from "../logger.js";
import WebSocket from 'ws'
import { execWithTimeout } from "../utils.js";
import { getConfig } from "../config/core.js";
global.WebSocket = WebSocket as any;
import { NWCClient } from "@getalby/sdk/nwc";

// Lazy NWC client
let nwc: NWCClient | null = null;
let nwcUrl: string | null = null;

function getNwc(): NWCClient | null {
    const url = getConfig(null, ["payments", "paymentProviders", "nwc", "url"]);
    if (!url) return null;

    // recreate client if url changed
    if (!nwc || nwcUrl !== url) {
        nwc = new NWCClient({ nostrWalletConnectUrl: url });
        nwcUrl = url;
    }
    return nwc;
}

const generateNwcInvoice = async (LNAddress: string, amount:number) : Promise<Invoice> => {

    if (LNAddress == "" || amount == 0) return emptyInvoice;

    const nwcClient = getNwc();
    if (!nwcClient) return emptyInvoice;

    // NWC roundtrips a relay → wallet → relay; under congestion 2s isn't
    // enough and the user is told the invoice failed when really we just
    // gave up too soon. Give it 8s and one retry on timeout.
    const TIMEOUT_MS = 8000;
    const MAX_ATTEMPTS = 2;

    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await execWithTimeout(
                nwcClient.makeInvoice({ amount: amount * 1000, description: "" }),
                TIMEOUT_MS,
            );

            if (!response || response.invoice == "") {
                logger.error(`generateNwcInvoice - Empty response for LNAddress: ${LNAddress} amount: ${amount} (attempt ${attempt}/${MAX_ATTEMPTS})`);
                continue;
            }

            return {paymentRequest: response.invoice,
                    paymentHash: response.payment_hash,
                    satoshi: response.amount,
                    isPaid: false,
                    preimage: "",
                    createdDate: new Date(response.created_at * 1000).toISOString().slice(0, 19).replace('T', ' '),
                    expiryDate: new Date(response.expires_at * 1000).toISOString().slice(0, 19).replace('T', ' '),
                    paidDate: "",
                    description: response.description,
                    transactionid: 0,
                    accountid: 0};

        } catch (e) {
            lastErr = e;
            const msg = (e as any)?.message || String(e);
            const transient = /timeout|relay/i.test(msg);
            logger.warn(`generateNwcInvoice - Attempt ${attempt}/${MAX_ATTEMPTS} failed for ${LNAddress} amount ${amount}: ${msg}`);
            if (!transient) break;
        }
    }

    logger.error(`generateNwcInvoice - Giving up for LNAddress: ${LNAddress} amount: ${amount} after ${MAX_ATTEMPTS} attempts; last error: ${lastErr}`);
    return emptyInvoice;

}

const isInvoicePaidNwc = async (paymentHash: string): Promise<{ paiddate: string; preimage: string }> => {

    if (paymentHash === "") return { paiddate: "", preimage: "" };

    const maxRetries = 3;
    const emptyResponse = { paiddate: "", preimage: "" };

    const lookupWithRetry = async (retries: number): Promise<{ paiddate: string, preimage: string }> => {
        while (retries > 0) {
            try {

                const nwcClient = getNwc();
                if (!nwcClient) return emptyResponse;

                const invoice = await nwcClient.lookupInvoice({ payment_hash: paymentHash });
                if (invoice && invoice.preimage && invoice.preimage !== "null") {
                    return { paiddate: invoice.settled_at.toString(), preimage: invoice.preimage };
                }
                return emptyResponse;
            } catch (e: any) {
                if (e.message && (e.message.includes("timeout") || e.message.includes("relay connection closed"))) {
                    logger.debug(`isInvoicePaidNwc - Error checking nwc invoice status for paymentHash: ${paymentHash}, retries left: ${retries - 1}`, e.message);
                } else {
                    logger.error(`isInvoicePaidNwc - Error checking nwc invoice status for paymentHash: ${paymentHash}`, e.message);
                    break;
                }
            }
            retries--;
        }
        logger.debug(`isInvoicePaidNwc - Failed to check nwc invoice status for paymentHash: ${paymentHash}`);
        return emptyResponse;
    };

    return await lookupWithRetry(maxRetries);
    
};

export { isInvoicePaidNwc, generateNwcInvoice };