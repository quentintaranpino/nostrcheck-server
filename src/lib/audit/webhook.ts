import axios from "axios";
import crypto from "crypto";

import { logger } from "../logger.js";
import { AuditResult } from "../../interfaces/audit.js";

const signatureHeader = "X-Nostrcheck-Signature";

/**
 * HMAC-SHA256 of the exact body bytes, so the receiver can tell a real notice
 * from anyone who guessed the endpoint URL.
 */
const signBody = (body: string, secret: string): string => {

	try {
		return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
	} catch (error) {
		logger.error(`signBody - Cannot sign notification body: ${error}`);
		return "";
	}
}

/**
 * POSTs a notification body to the configured webhook.
 *
 * @param url - Webhook endpoint.
 * @param body - Pre-serialized JSON body. Sent verbatim on purpose: the HMAC
 * covers these exact bytes, so letting axios re-serialize an object would
 * break verification on the other side.
 * @param secret - Shared secret for the signature header. Empty means unsigned.
 * @param timeout - Request timeout in ms.
 * @param eventtype - Event type, echoed in a header for cheap routing.
 * @param auditId - Audit row id, echoed in a header as an idempotency key.
 * @returns A structured result. Never throws.
 */
const sendWebhook = async (url: string, body: string, secret: string, timeout: number, eventtype: string, auditId: number): Promise<AuditResult> => {

	if (url == "" || url == null || url == undefined) return { status: "error", message: "No webhook url configured" };
	if (body == "" || body == null || body == undefined) return { status: "error", message: "Empty notification body" };

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "nostrcheck-server",
		"X-Nostrcheck-Event": eventtype,
		"X-Nostrcheck-Id": String(auditId),
	};

	if (secret != "" && secret != null && secret != undefined) {
		const signature = signBody(body, secret);
		if (signature != "") headers[signatureHeader] = `sha256=${signature}`;
	} else {
		logger.debug(`sendWebhook - No webhook secret configured, notification ${auditId} goes out unsigned`);
	}

	try {
		// maxRedirects 0: following a redirect would hand the signed body, and the
		// signature, to whatever host the 3xx points at.
		const response = await axios.post(url, body, { timeout: timeout, headers: headers, maxRedirects: 0 });
		logger.info(`sendWebhook - Notification ${auditId} (${eventtype}) delivered to ${url} with status ${response.status}`);
		return { status: "success", message: `Delivered with status ${response.status}` };
	} catch (error) {
		const status = (error as any)?.response?.status;
		const reason = status ? `HTTP ${status}` : ((error as any)?.code || (error as any)?.message || String(error));
		logger.warn(`sendWebhook - Notification ${auditId} (${eventtype}) not delivered to ${url}: ${reason}`);
		return { status: "error", message: `${reason}` };
	}
}

export { sendWebhook, signBody, signatureHeader };
