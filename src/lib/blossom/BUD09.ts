
import { Event } from "nostr-tools";
import { Request } from "express";
import { logger } from "../logger.js";
import { BUDKinds, BUD09_reportTypes } from "../../interfaces/blossom.js";
import { ResultMessagev2 } from "../../interfaces/server.js";
import { MetadataEvent } from "../../interfaces/relay.js";
import { getClientInfo } from "../security/ips.js";
import { getDomainId } from "../security/domain.js";
import { isEventValid } from "../nostr/core.js";
import { storeEvents } from "../relay/database.js";
import { dbMultiSelect, dbUpdate } from "../database/core.js";
import { logAuditEvent } from "../audit/core.js";


/**
 * Parses a NIP-56 / BUD-09 blob report event (kind 1984) and checks if it is valid. Visit for more information:
 * https://github.com/hzrd149/blossom/blob/master/buds/09.md
 *
 * The report event is a signed kind 1984 event with one or more `x` tags
 * listing the blob sha256 hashes being reported. The optional second value of
 * each `x` tag is the NIP-56 report type (nudity, malware, profanity, illegal,
 * spam, csam, other). The event content is a human-readable explanation.
 *
 * @param reportEvent - The BUD-09 report event.
 * @param req - The request object.
 * @returns A promise that resolves to a ResultMessagev2 indicating success or the rejection reason.
 */
const isBUD09ReportValid = async (reportEvent: Event, req: Request): Promise<ResultMessagev2> => {

	// Check if event is valid (id, sig, basic shape).
	try {
		const isValid = (await isEventValid(reportEvent)).status === "success";
		if (!isValid) {
			logger.warn(`isBUD09ReportValid - Report event is not valid`, "|", getClientInfo(req).ip);
			return {status: "error", message: "Report event is not valid"};
		}
	} catch (error) {
		logger.error(`isBUD09ReportValid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Report event is not valid"};
	}

	// Check if report kind is valid (Must be 1984).
	try {
		const eventkind: number = +reportEvent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != BUDKinds.BUD09_report) {
			logger.warn(`isBUD09ReportValid - Report event kind is not 1984, event: ${reportEvent.id}, kind: ${eventkind} | ${getClientInfo(req).ip}`);
			return {status: "error", message: "Report event kind is not 1984"};
		}
	} catch (error) {
		logger.error(`isBUD09ReportValid - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return {status: "error", message: "Report event kind is not 1984"};
	}

	// At least one `x` tag with a valid sha256 hex must be present.
	const xTags = reportEvent.tags.filter(tag => tag[0] === "x" && /^[a-f0-9]{64}$/i.test(tag[1] || ""));
	if (xTags.length == 0) {
		logger.warn(`isBUD09ReportValid - Report event has no x tag with a valid sha256 | ${getClientInfo(req).ip}`);
		return {status: "error", message: "Report event has no x tag with a valid sha256"};
	}

	return {status: "success", message: "Report event is valid"};
}

/**
 * Persists a validated BUD-09 report event into the existing `events` /
 * `eventtags` / `eventmetadata` tables (same store the relay uses for nostr
 * events) and, for any `csam`-typed `x` tag, immediately marks the matching
 * mediafile rows as `active = 0` so they stop being served until an admin
 * reviews them. `csam` and `illegal` tags also leave a record in the
 * `notifications` table and reach the operator through it. Other report types
 * are stored without taking action.
 *
 * Duplicates of the same `event_id` are silently ignored (UNIQUE constraint
 * on `events.event_id`).
 *
 * @param reportEvent - A previously validated kind 1984 event.
 * @param req - The request object (used for tenant resolution and log prefixes).
 * @returns A promise that resolves to true if the event was persisted.
 */
const saveBlobReport = async (reportEvent: Event, req: Request): Promise<boolean> => {

	const xTags = reportEvent.tags.filter(tag => tag[0] === "x" && /^[a-f0-9]{64}$/i.test(tag[1] || ""));
	if (xTags.length == 0) {
		logger.warn(`saveBlobReport - No reportable x tag in event ${reportEvent.id} | ${getClientInfo(req).ip}`);
		return false;
	}

	// Persist via the relay's bulk-insert path so we get events + eventtags +
	// eventmetadata wiring for free. Reports are scoped to the tenant of the
	// hostname that received the HTTP request.
	const tenantid = await getDomainId(req.hostname) || 1;
	const metadataEvent: MetadataEvent = { ...reportEvent, tenantid };

	try {
		const inserted = await storeEvents(metadataEvent);
		if (inserted == 0) {
			logger.warn(`saveBlobReport - storeEvents inserted 0 rows (likely duplicate event_id): ${reportEvent.id}`);
			return false;
		}
	} catch (error) {
		logger.error(`saveBlobReport - Internal server error: ${error}`, "|", getClientInfo(req).ip);
		return false;
	}

	// CSAM-typed x tags trigger an immediate auto-hide of the matching blobs.
	// Hiding is reversible (active flag), it is not a permanent ban; admins
	// still need to review and decide.
	for (const tag of xTags) {
		const blobHash = tag[1].toLowerCase();
		const tagType = tag[2] && BUD09_reportTypes.includes(tag[2]) ? tag[2] : "other";

		if (tagType != "csam" && tagType != "illegal") continue;

		// Rows are resolved before hiding them so the record says exactly which
		// ones were affected, who uploaded them and what their state was.
		let affected: any[] = [];
		try {
			affected = await dbMultiSelect(["id", "pubkey", "ip_address", "active"], "mediafiles", "original_hash = ?", [blobHash], false);
		} catch (error) {
			logger.error(`saveBlobReport - Cannot resolve mediafile rows for blob ${blobHash}: ${error}`);
		}

		if (tagType == "csam") {
			try {
				const updated = await dbUpdate("mediafiles", {"active": 0}, ["original_hash"], [blobHash]);
				if (updated) {
					logger.warn(`saveBlobReport - CSAM report received, auto-hid mediafile rows for blob ${blobHash} | reporter: ${reportEvent.pubkey} | ${getClientInfo(req).ip}`);

					// The hide is a state change of its own, and the trail has to
					// answer "who deactivated this file" without going through the
					// report that caused it.
					for (const row of affected) {
						if (row.active == 0) continue;
						await logAuditEvent({eventtype: "deactivated", origintable: "mediafiles", originid: row.id, actor: "system", source: "report", tenant: req.hostname, pubkey: row.pubkey || "", filehash: blobHash, previous_value: row.active, new_value: 0, reason: `Auto-hidden by a BUD-09 csam report from ${reportEvent.pubkey}`, details: {reporteventid: reportEvent.id}});
					}
				}
			} catch (error) {
				logger.error(`saveBlobReport - Failed to auto-hide CSAM-reported blob ${blobHash}: ${error}`);
			}
		}

		const eventtype = tagType == "csam" ? "csam_report" : "illegal_report";
		const action = tagType == "csam"
			? (affected.length > 0 ? `${affected.length} mediafile row(s) hidden (active = 0)` : "nothing to hide, no mediafile row matched the blob")
			: "none, report stored for review";
		const details = {
			reporttype: tagType,
			reporterpubkey: reportEvent.pubkey,
			reporterip: getClientInfo(req).ip,
			reporteventid: reportEvent.id,
			reportcontent: (reportEvent.content || "").substring(0, 500),
			affectedrows: affected.length,
		};

		// The actor is the reporter, the pubkey and the ip belong to the uploader:
		// the report is what happened, the file is what it happened to.
		if (affected.length == 0) {
			await logAuditEvent({eventtype: eventtype, origintable: "mediafiles", originid: "0", actor: reportEvent.pubkey, source: "report", tenant: req.hostname, pubkey: "", ip: "", filehash: blobHash, action: action, reason: `BUD-09 report type '${tagType}' on blob ${blobHash}`, details: details});
			continue;
		}

		for (const row of affected) {
			await logAuditEvent({eventtype: eventtype, origintable: "mediafiles", originid: row.id, actor: reportEvent.pubkey, source: "report", tenant: req.hostname, pubkey: row.pubkey || "", ip: row.ip_address || "", filehash: blobHash, action: action, reason: `BUD-09 report type '${tagType}' on blob ${blobHash}`, details: details});
		}
	}

	logger.info(`saveBlobReport - Stored report event ${reportEvent.id} covering ${xTags.length} blob(s) | ${getClientInfo(req).ip}`);
	return true;
}

export { isBUD09ReportValid, saveBlobReport };
