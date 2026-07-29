
/**
 * Contracts for the audit layer.
 *
 * An `auditlog` row is the record of one state change in the life of a record:
 * what happened, when (UTC), to which file or user, who did it and what the
 * value went from and to. Some of those events also have to reach the operator,
 * and for those the same row carries the delivery state: `notified = 1` plus
 * `channel`, `status`, `attempts`, `lasterror` and `sentdate`. Notification is
 * an attribute of an event, not the reason the row exists.
 *
 * `payload` is the structured record of the event. On notifiable rows it holds
 * the exact bytes that were signed and POSTed, so a third party can recompute
 * the HMAC months later and get the same digest.
 */

type AuditDeliveryStatus = "pending" | "sent" | "failed";

// Sources a change can come from.
const auditSources = ["user", "admin", "classifier", "report", "system"] as const;
type AuditSource = typeof auditSources[number];

/**
 * Every event the layer knows about. Life cycle first, incidents last.
 *
 * `banned` covers what an earlier draft called `ban_executed`: they are the same
 * fact, and two names for it would split both the timeline of a file and the
 * dedupe key.
 */
const auditEventTypes = [
	"uploaded",
	"classified",
	"checked_set",
	"checked_unset",
	"activated",
	"deactivated",
	"nsfw_set",
	"nsfw_unset",
	"visibility_changed",
	"banned",
	"unbanned",
	"deleted",
	"csam_report",
	"illegal_report",
	"banned_hash_reupload",
] as const;

type AuditEventType = typeof auditEventTypes[number];

// Events that reach the operator unless config says otherwise. Everything else
// is recorded and stays in the table.
const notifiableEventTypes: string[] = ["csam_report", "illegal_report", "banned_hash_reupload", "banned"];

interface AuditEvent {
	eventtype: AuditEventType | string;
	origintable: string;
	originid: string | number;
	actor?: string;
	source?: AuditSource | string;
	tenant?: string;
	pubkey?: string;
	ip?: string;
	filehash?: string;
	previous_value?: string | number | boolean | null;
	new_value?: string | number | boolean | null;
	action?: string;
	reason?: string;
	details?: Record<string, any>;
	notify?: boolean;
}

/**
 * Structured record of the event, stored in `auditlog.payload`. On a notifiable
 * row this is also the exact body POSTed to the webhook; `id` is the row id so
 * the receiver can deduplicate on it, and it is 0 on rows that are never sent.
 */
interface AuditPayload {
	version: number;
	id: number;
	eventtype: string;
	detectedat: string;
	server: string;
	tenant: string;
	origin: {
		table: string;
		id: string;
	};
	actor: string;
	source: string;
	pubkey: string;
	ip: string;
	filehash: string;
	previous_value: string;
	new_value: string;
	action: string;
	reason: string;
	details: Record<string, any>;
}

interface AuditResult {
	status: "success" | "error" | "skipped";
	message: string;
	id?: number;
}

/**
 * Delivery state of the notifiable events of a record. Rows that were only
 * audited (`notified = 0`) never appear here.
 */
interface NotificationStatusInfo {
	id: number;
	eventtype: string;
	status: string;
	channel: string;
	attempts: number;
	lasterror: string;
	createddate: string;
	sentdate: string;
}

/**
 * One entry of the life cycle of a record, newest first.
 */
interface AuditTimelineEntry {
	id: number;
	eventtype: string;
	actor: string;
	source: string;
	previous_value: string;
	new_value: string;
	reason: string;
	notified: boolean;
	status: string;
	createddate: string;
}

/**
 * External authority reporting (NCMEC CyberTipline is the reference case).
 * The contract exists so the call site is already in place; there is no real
 * implementation and config keeps it off.
 */
interface ExternalReporter {
	name: string;
	enabled: boolean;
	report: (payload: AuditPayload) => Promise<AuditResult>;
}

export {
	AuditDeliveryStatus,
	AuditSource,
	auditSources,
	AuditEventType,
	auditEventTypes,
	notifiableEventTypes,
	AuditEvent,
	AuditPayload,
	AuditResult,
	NotificationStatusInfo,
	AuditTimelineEntry,
	ExternalReporter,
};
