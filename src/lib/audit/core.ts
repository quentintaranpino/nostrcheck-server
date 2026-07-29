import { dbInsert, dbMultiSelect, dbUpdate } from "../database/core.js";
import { logger } from "../logger.js";
import { getConfig } from "../config/core.js";
import { AuditEvent, AuditPayload, AuditResult, AuditTimelineEntry, NotificationStatusInfo, notifiableEventTypes } from "../../interfaces/audit.js";
import { sendWebhook } from "./webhook.js";
import { getReporter } from "./reporter.js";

const payloadVersion = 1;
const sweepInterval = 60000;
const sweepBatch = 50;
const backoffBase = 60000;
const backoffCap = 1800000;

// Next allowed attempt per row id. In memory on purpose: a restart is a clean
// slate and everything still pending gets retried at once, which is also what
// makes the admin "retry" button (status back to pending) work immediately.
const backoffMap = new Map<number, number>();

// Last notifiable event per incident key, for the dedupe window.
const dedupeMap = new Map<string, {time: number, id: number}>();

// Rows with a delivery attempt in progress right now.
const inFlight = new Set<number>();

let rateWindowStart = 0;
let rateWindowCount = 0;
let sweeperStarted = false;

/**
 * UTC timestamp in MySQL datetime shape. Evidence dates must not depend on the
 * timezone of the box, and `getNewDate()` from utils returns local time.
 */
const utcNow = (): string => {
	return new Date().toISOString().slice(0, 19).replace("T", " ");
}

const utcSince = (seconds: number): string => {
	return new Date(Date.now() - (seconds * 1000)).toISOString().slice(0, 19).replace("T", " ");
}

// previous_value / new_value take whatever the caller has at hand.
const asText = (value: string | number | boolean | null | undefined): string => {
	if (value == null || value == undefined) return "";
	return String(value);
}

/**
 * Own rate limit for outbound notifications. An incident in a loop (a bot
 * hammering a banned hash) would otherwise turn into a notification storm.
 * Recording is never rate limited, only sending: rows stay `pending` and the
 * periodic sweep drains them.
 */
const consumeRateToken = (tenant?: string): boolean => {

	const maxPerMinute = Number(getConfig(tenant || null, ["notifications", "maxPerMinute"])) || 20;
	const now = Date.now();

	if (now - rateWindowStart > 60000) {
		rateWindowStart = now;
		rateWindowCount = 0;
	}
	if (rateWindowCount >= maxPerMinute) return false;

	rateWindowCount++;
	return true;
}

/**
 * Returns the id of the last notifiable row for the same incident inside the
 * dedupe window, or 0 when there is none.
 *
 * The key is (eventtype, origintable, originid, filehash); the hash is part of
 * it because reports about different blobs are different incidents even when
 * neither matches a known row and both land on originid 0.
 */
const findRecentDuplicate = async (event: AuditEvent, windowSeconds: number): Promise<number> => {

	const key = `${event.eventtype}:${event.origintable}:${event.originid}:${event.filehash || ""}`;
	const now = Date.now();

	for (const [cachedKey, cached] of dedupeMap) {
		if (now - cached.time > windowSeconds * 1000) dedupeMap.delete(cachedKey);
	}

	const seen = dedupeMap.get(key);
	if (seen != undefined && now - seen.time <= windowSeconds * 1000) return seen.id;

	// The map dies with the process, the table does not.
	try {
		const rows = await dbMultiSelect(
			["id"],
			"auditlog",
			"notified = 1 AND eventtype = ? AND origintable = ? AND originid = ? AND IFNULL(filehash, '') = ? AND createddate >= ? ORDER BY id DESC",
			[event.eventtype, event.origintable, String(event.originid), event.filehash || "", utcSince(windowSeconds)],
			true,
			"LIMIT 1");
		if (rows.length > 0) {
			const duplicateId = Number(rows[0].id) || 0;
			if (duplicateId > 0) dedupeMap.set(key, {time: now, id: duplicateId});
			return duplicateId;
		}
	} catch (error) {
		logger.error(`findRecentDuplicate - Cannot check the dedupe window for ${key}: ${error}`);
	}

	return 0;
}

const backoffDelay = (attempts: number): number => {
	return Math.min(backoffBase * Math.pow(2, Math.max(0, attempts - 1)), backoffCap);
}

/**
 * Attempts delivery of one notifiable row and writes the outcome back to it.
 * Never throws: a notification failure must not surface anywhere.
 */
const attemptDelivery = async (row: {id: number, eventtype: string, tenant: string, payload: string, attempts: number}): Promise<boolean> => {

	const url = getConfig(row.tenant || null, ["notifications", "webhook", "url"]) || "";
	const secret = getConfig(row.tenant || null, ["notifications", "webhook", "secret"]) || "";
	const timeout = Number(getConfig(row.tenant || null, ["notifications", "timeout"])) || 10000;
	const retries = Number(getConfig(row.tenant || null, ["notifications", "retries"])) || 3;
	const attempts = Number(row.attempts) || 0;

	// Nothing to deliver to. The audit row is already written, which is the part
	// that matters; retrying can't help until config changes, so stop here
	// instead of burning the retry budget.
	if (url == "") {
		try {
			await dbUpdate("auditlog", {"channel": "none", "status": "failed", "lasterror": "No delivery channel configured"}, ["id"], [row.id]);
		} catch (error) {
			logger.error(`deliver - Cannot mark event ${row.id} as undeliverable: ${error}`);
		}
		backoffMap.delete(row.id);
		logger.info(`deliver - Event ${row.id} (${row.eventtype}) recorded but not sent: no webhook url configured`);
		return false;
	}

	let result: AuditResult = { status: "error", message: "Not attempted" };
	try {
		result = await sendWebhook(url, row.payload, secret, timeout, row.eventtype, row.id);
	} catch (error) {
		result = { status: "error", message: `${error}` };
	}

	if (result.status == "success") {
		try {
			await dbUpdate("auditlog", {"channel": "webhook", "status": "sent", "attempts": attempts + 1, "lasterror": "", "sentdate": utcNow()}, ["id"], [row.id]);
		} catch (error) {
			logger.error(`deliver - Cannot mark event ${row.id} as sent: ${error}`);
		}
		backoffMap.delete(row.id);

		// External authority reporting is a contract with a noop behind it, see
		// reporter.ts. Kept here so the call site exists once and only once.
		try {
			const reporter = getReporter(row.tenant);
			if (reporter.enabled) {
				const reported = await reporter.report(JSON.parse(row.payload) as AuditPayload);
				logger.info(`deliver - Reporter '${reporter.name}' for event ${row.id}: ${reported.status} - ${reported.message}`);
			}
		} catch (error) {
			logger.error(`deliver - Reporter failed for event ${row.id}: ${error}`);
		}

		return true;
	}

	const nextAttempts = attempts + 1;
	const exhausted = nextAttempts >= retries;

	try {
		await dbUpdate("auditlog", {"channel": "webhook", "status": exhausted ? "failed" : "pending", "attempts": nextAttempts, "lasterror": result.message.substring(0, 250)}, ["id"], [row.id]);
	} catch (error) {
		logger.error(`deliver - Cannot update event ${row.id} after a failed attempt: ${error}`);
	}

	if (exhausted) {
		backoffMap.delete(row.id);
		logger.warn(`deliver - Event ${row.id} (${row.eventtype}) failed after ${nextAttempts} attempts: ${result.message}`);
	} else {
		backoffMap.set(row.id, Date.now() + backoffDelay(nextAttempts));
		logger.warn(`deliver - Event ${row.id} (${row.eventtype}) attempt ${nextAttempts}/${retries} failed, retrying in ${backoffDelay(nextAttempts) / 1000}s: ${result.message}`);
	}

	return false;
}

/**
 * Single entry point for delivery. The immediate attempt fired by
 * logAuditEvent() and the periodic sweep can look at the same row at once:
 * without this guard a slow webhook would get the same notice twice.
 */
const deliver = async (row: {id: number, eventtype: string, tenant: string, payload: string, attempts: number}): Promise<boolean> => {

	if (inFlight.has(row.id)) return false;
	inFlight.add(row.id);

	try {
		return await attemptDelivery(row);
	} finally {
		inFlight.delete(row.id);
	}
}

/**
 * True when a notifiable event is allowed out by config. The master switch and
 * the per-event flag only govern *delivery*: the audit row is written either way.
 */
const isDeliveryEnabled = (event: AuditEvent): boolean => {

	if (getConfig(event.tenant || null, ["notifications", "enabled"]) != true) return false;

	// A missing per-event flag means enabled: silence has to be asked for.
	if (getConfig(event.tenant || null, ["notifications", "events", event.eventtype]) == false) return false;

	return true;
}

const buildPayload = (event: AuditEvent, id: number, createddate: string, dedupedFrom: number): AuditPayload => {

	const details = { ...(event.details || {}) };
	if (dedupedFrom > 0) details.deduped_from = dedupedFrom;

	return {
		version: payloadVersion,
		id: id,
		eventtype: event.eventtype,
		detectedat: `${createddate.replace(" ", "T")}Z`,
		server: getConfig(null, ["server", "host"]) || "",
		tenant: event.tenant || "",
		origin: { table: event.origintable, id: String(event.originid) },
		actor: event.actor || "system",
		source: event.source || "system",
		pubkey: event.pubkey || "",
		ip: event.ip || "",
		previous_value: asText(event.previous_value),
		new_value: asText(event.new_value),
		filehash: event.filehash || "",
		action: event.action || "",
		reason: event.reason || "",
		details: details,
	};
}

/**
 * Records one state change in the `auditlog` table and, when the event is one of
 * the notifiable ones, attempts to deliver it right away.
 *
 * The row is always written: auditing is not optional and does not depend on any
 * webhook being configured or reachable. Delivery is detached, so the caller (an
 * upload, a report, a ban, an admin click) gets its answer without waiting for
 * anyone's endpoint, and a notification failure can never break the flow that
 * triggered it. Never throws.
 *
 * @param event.eventtype - One of the types in `auditEventTypes` (uploaded,
 * classified, checked_set, checked_unset, activated, deactivated, nsfw_set,
 * nsfw_unset, visibility_changed, banned, unbanned, deleted, csam_report,
 * illegal_report, banned_hash_reupload).
 * @param event.origintable - Table of the affected record (mediafiles, registered, events, ips).
 * @param event.originid - Id of the affected record.
 * @param event.actor - Who did it: pubkey in hex, or "system" / "classifier". Defaults to "system".
 * @param event.source - Where it came from: user | admin | classifier | report | system. Defaults to "system".
 * @param event.tenant - Hostname the action came through, for per-tenant config. Optional.
 * @param event.pubkey - Owner of the affected record, when it is not the actor. Optional.
 * @param event.ip - IP of the actor, when there is a request behind it. Optional.
 * @param event.filehash - SHA-256 of the blob, for events about files. Optional.
 * @param event.previous_value - Value before the change. Only for transitions.
 * @param event.new_value - Value after the change. Only for transitions.
 * @param event.action - What the server did on its own, in one line. Optional.
 * @param event.reason - Free text reason (a ban reason, a classifier verdict). Optional.
 * @param event.details - Any extra context, stored inside `payload`. Optional.
 * @param event.notify - Forces delivery on or off. Left out, the event type decides:
 * csam_report, illegal_report, banned_hash_reupload and banned notify, the rest
 * are audit only.
 * @returns `{status, message, id}` with the id of the row written.
 *
 * @example
 * ```typescript
 * await logAuditEvent({
 *     eventtype: "checked_set",
 *     origintable: "mediafiles",
 *     originid: 1234,
 *     actor: adminPubkey,
 *     source: "admin",
 *     previous_value: 0,
 *     new_value: 1,
 *     reason: "reviewed from the moderation gallery",
 * });
 * ```
 */
const logAuditEvent = async (event: AuditEvent): Promise<AuditResult> => {

	if (event == null || event == undefined) return { status: "error", message: "Empty audit event" };
	if (event.eventtype == "" || event.origintable == "") return { status: "error", message: "Audit event without event type or origin table" };

	const wantsDelivery = event.notify != undefined ? event.notify == true : notifiableEventTypes.includes(event.eventtype);
	let notified = wantsDelivery ? isDeliveryEnabled(event) : false;

	// Deduplication suppresses the notice, never the record: two reports about
	// the same blob are two facts, and dropping the second one would leave a hole
	// in the trail. The row keeps a pointer to the notice that did go out.
	let dedupedFrom = 0;
	if (notified) {
		const dedupeWindow = Number(getConfig(event.tenant || null, ["notifications", "dedupeWindow"])) || 300;
		dedupedFrom = await findRecentDuplicate(event, dedupeWindow);
		if (dedupedFrom > 0) {
			notified = false;
			logger.debug(`logAuditEvent - ${event.eventtype} for ${event.origintable}:${event.originid} repeats event ${dedupedFrom} inside the ${dedupeWindow}s window, recorded without notifying`);
		}
	}

	const createddate = utcNow();
	const fields = ["eventtype", "origintable", "originid", "tenant", "actor", "source", "pubkey", "ip", "filehash", "previous_value", "new_value", "reason", "payload", "notified", "createddate"];
	const values: (string | number | boolean)[] = [
		event.eventtype,
		event.origintable,
		String(event.originid),
		event.tenant || "",
		(event.actor || "system").substring(0, 64),
		(event.source || "system").substring(0, 20),
		event.pubkey || "",
		event.ip || "",
		event.filehash || "",
		asText(event.previous_value).substring(0, 250),
		asText(event.new_value).substring(0, 250),
		(event.reason || "").substring(0, 250),
		notified ? "" : JSON.stringify(buildPayload(event, 0, createddate, dedupedFrom)),
		notified ? 1 : 0,
		createddate,
	];

	// channel and status are delivery columns: they stay NULL on rows that are
	// only audited, so the queue query never has to look at them.
	if (notified) {
		fields.push("channel", "status");
		values.push("webhook", "pending");
	}

	let auditId = 0;
	try {
		auditId = await dbInsert("auditlog", fields, values);
		if (auditId == 0) {
			logger.error(`logAuditEvent - Cannot record ${event.eventtype} for ${event.origintable}:${event.originid}`);
			return { status: "error", message: "Cannot record audit event" };
		}
	} catch (error) {
		logger.error(`logAuditEvent - Cannot record ${event.eventtype} for ${event.origintable}:${event.originid}: ${error}`);
		return { status: "error", message: "Cannot record audit event" };
	}

	if (!notified) {
		logger.debug(`logAuditEvent - Recorded ${event.eventtype} for ${event.origintable}:${event.originid} as event ${auditId} by ${event.actor || "system"}`);
		return { status: "success", message: "Recorded", id: auditId };
	}

	// Serialized once and stored as it goes out, so the signature stays
	// verifiable against the stored bytes long after the fact.
	let body = "";
	try {
		body = JSON.stringify(buildPayload(event, auditId, createddate, dedupedFrom));
		await dbUpdate("auditlog", {"payload": body}, ["id"], [auditId]);
	} catch (error) {
		logger.error(`logAuditEvent - Cannot store the payload of event ${auditId}: ${error}`);
		return { status: "error", message: "Cannot store audit payload", id: auditId };
	}

	logger.info(`logAuditEvent - Recorded ${event.eventtype} for ${event.origintable}:${event.originid} as event ${auditId}, notification pending`, "|", event.ip || "no ip");

	if (!consumeRateToken(event.tenant)) {
		logger.warn(`logAuditEvent - Rate limit reached, event ${auditId} stays pending for the next sweep`);
		return { status: "success", message: "Recorded, delivery deferred by rate limit", id: auditId };
	}

	void deliver({id: auditId, eventtype: event.eventtype, tenant: event.tenant || "", payload: body, attempts: 0})
		.catch(error => logger.error(`logAuditEvent - Unhandled error delivering event ${auditId}: ${error}`));

	return { status: "success", message: "Recorded", id: auditId };
}

/**
 * Drains the notification queue. Only looks at rows flagged `notified = 1`, and
 * picks up every one of them still in `pending` regardless of how many attempts
 * it already burned, so setting a row back to `pending` from the admin is all a
 * manual retry needs to be.
 */
const processPending = async (): Promise<void> => {

	if (getConfig(null, ["notifications", "enabled"]) != true) return;

	let rows: any[] = [];
	try {
		rows = await dbMultiSelect(
			["id", "eventtype", "tenant", "payload", "attempts"],
			"auditlog",
			"notified = 1 AND status = 'pending' ORDER BY createddate ASC",
			[],
			false,
			`LIMIT ${sweepBatch}`);
	} catch (error) {
		logger.error(`processPending - Cannot read the pending queue: ${error}`);
		return;
	}

	if (rows.length == 0) return;

	const now = Date.now();
	let attempted = 0;

	for (const row of rows) {

		if (inFlight.has(Number(row.id))) continue;

		const nextAttempt = backoffMap.get(Number(row.id));
		if (nextAttempt != undefined && nextAttempt > now) continue;

		if (!consumeRateToken(row.tenant)) {
			logger.warn(`processPending - Rate limit reached, ${rows.length - attempted} pending notification(s) left for the next sweep`);
			break;
		}

		if (row.payload == null || row.payload == "") {
			try {
				await dbUpdate("auditlog", {"status": "failed", "lasterror": "Empty payload, nothing to deliver"}, ["id"], [row.id]);
			} catch (error) {
				logger.error(`processPending - Cannot fail event ${row.id} with an empty payload: ${error}`);
			}
			continue;
		}

		attempted++;
		await deliver({id: Number(row.id), eventtype: row.eventtype, tenant: row.tenant || "", payload: row.payload, attempts: Number(row.attempts) || 0});
	}

	if (attempted > 0) logger.debug(`processPending - Attempted ${attempted} pending notification(s)`);
}

const statusFields = ["id", "originid", "eventtype", "status", "channel", "attempts", "lasterror", "createddate", "sentdate"];

const mapStatusRow = (row: any): NotificationStatusInfo => {
	return {
		id: Number(row.id) || 0,
		eventtype: row.eventtype || "",
		status: row.status || "",
		channel: row.channel || "",
		attempts: Number(row.attempts) || 0,
		lasterror: row.lasterror || "",
		createddate: row.createddate ? String(row.createddate) : "",
		sentdate: row.sentdate ? String(row.sentdate) : "",
	};
}

// A record can collect several notifiable events (a report and a ban, plus
// manual retries). The one that matters is not the newest but the worst: a
// failure masked by a later success is somebody believing they warned an
// authority when they didn't. Newest breaks the tie.
const statusSeverity: Record<string, number> = { sent: 0, pending: 1, failed: 2 };

const worstStatus = (current: NotificationStatusInfo | undefined, candidate: NotificationStatusInfo): NotificationStatusInfo => {
	if (current == undefined) return candidate;
	const currentWeight = statusSeverity[current.status] || 0;
	const candidateWeight = statusSeverity[candidate.status] || 0;
	if (candidateWeight > currentWeight) return candidate;
	if (candidateWeight == currentWeight && candidate.id > current.id) return candidate;
	return current;
}

/**
 * Notification state of a record: which row to retry, how the delivery went and
 * why it failed. Audit-only events are ignored, they were never meant to be sent.
 *
 * @param origintable - Table the record belongs to (mediafiles, registered, events).
 * @param originid - Record id.
 * @returns The state of the row that matters (failed over pending over sent, newest
 * to break ties), or null when the record never had a notifiable event. Never throws.
 */
const getNotificationStatus = async (origintable: string, originid: string | number): Promise<NotificationStatusInfo | null> => {

	if (origintable == "" || origintable == null || originid == null || originid == "") return null;

	try {
		const rows = await dbMultiSelect(
			statusFields,
			"auditlog",
			"notified = 1 AND origintable = ? AND originid = ? ORDER BY id DESC",
			[origintable, String(originid)],
			false);
		if (rows.length == 0) return null;

		let status: NotificationStatusInfo | undefined = undefined;
		for (const row of rows) {
			status = worstStatus(status, mapStatusRow(row));
		}
		return status || null;
	} catch (error) {
		logger.error(`getNotificationStatus - Cannot read the status for ${origintable}:${originid}: ${error}`);
		return null;
	}
}

/**
 * Same as getNotificationStatus for a whole page of records, in one query, so a
 * moderation screen doesn't fire one lookup per card. Ids with no notifiable
 * event are simply absent from the map.
 *
 * @param origintable - Table the records belong to.
 * @param originids - Record ids.
 * @returns A map of record id to its notification state. Never throws.
 */
const getNotificationStatusBulk = async (origintable: string, originids: (string | number)[]): Promise<Record<string, NotificationStatusInfo>> => {

	const statuses: Record<string, NotificationStatusInfo> = {};

	if (origintable == "" || origintable == null) return statuses;
	if (originids == null || originids.length == 0) return statuses;

	const ids = originids.map(id => String(id)).filter(id => id != "" && id != "null" && id != "undefined");
	if (ids.length == 0) return statuses;

	try {
		const placeholders = ids.map(() => "?").join(",");
		// Ids bound as strings: originid is a varchar and letting MySQL cast the
		// column would stop idx_auditlog_origin_created from being usable.
		const rows = await dbMultiSelect(
			statusFields,
			"auditlog",
			`notified = 1 AND origintable = ? AND originid IN (${placeholders}) ORDER BY id DESC`,
			[origintable, ...ids],
			false);
		for (const row of rows) {
			const key = String(row.originid);
			statuses[key] = worstStatus(statuses[key], mapStatusRow(row));
		}
	} catch (error) {
		logger.error(`getNotificationStatusBulk - Cannot read the status for ${ids.length} record(s) of ${origintable}: ${error}`);
	}

	return statuses;
}

/**
 * Life cycle of one record, newest event first. This is the reader behind a
 * per-file history view.
 *
 * @param origintable - Table the record belongs to.
 * @param originid - Record id.
 * @param limit - Maximum number of entries, capped at 200.
 * @returns The events recorded for that record. Empty on error, never throws.
 */
const getAuditTimeline = async (origintable: string, originid: string | number, limit = 50): Promise<AuditTimelineEntry[]> => {

	if (origintable == "" || origintable == null || originid == null || originid == "") return [];

	const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

	try {
		const rows = await dbMultiSelect(
			["id", "eventtype", "actor", "source", "previous_value", "new_value", "reason", "notified", "status", "createddate"],
			"auditlog",
			"origintable = ? AND originid = ? ORDER BY createddate DESC, id DESC",
			[origintable, String(originid)],
			false,
			`LIMIT ${safeLimit}`);

		return rows.map(row => ({
			id: Number(row.id) || 0,
			eventtype: row.eventtype || "",
			actor: row.actor || "",
			source: row.source || "",
			previous_value: row.previous_value || "",
			new_value: row.new_value || "",
			reason: row.reason || "",
			notified: row.notified == 1,
			status: row.status || "",
			createddate: row.createddate ? String(row.createddate) : "",
		}));
	} catch (error) {
		logger.error(`getAuditTimeline - Cannot read the timeline for ${origintable}:${originid}: ${error}`);
		return [];
	}
}

/**
 * Starts the periodic sweep. Called once from server startup, after the
 * database is up: whatever was left `pending` by the previous run is retried on
 * the first pass.
 */
const initAudit = async (): Promise<void> => {

	if (sweeperStarted) return;
	sweeperStarted = true;

	setTimeout(() => {
		void processPending().catch(error => logger.error(`initAudit - Unhandled error on the first sweep: ${error}`));
	}, 5000);

	setInterval(() => {
		void processPending().catch(error => logger.error(`initAudit - Unhandled error on a sweep: ${error}`));
	}, sweepInterval);

	logger.info(`initAudit - Audit notification sweeper started, every ${sweepInterval / 1000}s`);
}

export { logAuditEvent, processPending, initAudit, getNotificationStatus, getNotificationStatusBulk, getAuditTimeline };
