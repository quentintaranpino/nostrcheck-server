// https://github.com/nostr-protocol/nips/blob/master/77.md
//
// Negentropy syncing. The record set of a NEG-OPEN comes from the in-memory index for the last
// relay.memoryDays and from MySQL for older events. A filter that matches more than
// NEG_MAX_RECORDS events, or reaches past the memory horizon without ids, authors or a few tag
// values, is refused with "blocked:" so the client can narrow it with since/until.

import WebSocket from "ws";
import { Filter, matchFilter } from "nostr-tools";

import { ExtendedWebSocket, MetadataEvent, eventStore } from "../interfaces/relay.js";
import { socketSafeSend } from "../lib/relay/core.js";
import { validateFilter } from "../lib/relay/utils.js";
import { getArchivedIdsDB, isArchiveFilterSelective } from "../lib/relay/database.js";
import { isRelayHidden } from "../lib/relay/bans.js";
import { NegentropyResponder } from "../lib/relay/negentropy.js";
import { getConfig } from "../lib/config/core.js";
import { createSlots } from "../lib/utils.js";
import { logger } from "../lib/logger.js";

const NEG_MAX_RECORDS = 100000;
// Bytes per reply before hex encoding; a bigger answer is split over more round trips.
const NEG_FRAME_SIZE_LIMIT = 500000;
const NEG_IDLE_MS = 60 * 1000;
const NEG_MAX_PER_SOCKET = 4;
const NEG_BUILD_WAIT_MS = 5000;
// Pending maps are scanned whole; past this size they are left out (same cap as REQ).
const NEG_PENDING_SCAN_MAX = 20000;
const NEG_YIELD_EVERY = 50000;
// Direct messages and gift wraps are only served to their recipients, so they never take part.
const PRIVATE_KINDS = new Set([4, 14, 1059]);
const TAG_FILTER_UNTIL = 2 ** 32;

// Building a record set walks the memory index: two at a time, relay-wide.
const buildSlots = createSlots(2);

type NegSession = { responder: NegentropyResponder, timer: NodeJS.Timeout };
const negSessions = new WeakMap<ExtendedWebSocket, Map<string, NegSession>>();

type Records = { id: string, created_at: number, pubkey: string }[];
type Collected = { records: Records } | { error: string, tooBig?: boolean };

const isTagKey = (filter: Filter, key: string): boolean =>
	key.startsWith("#") && key.length == 2 && Array.isArray((filter as Record<string, unknown>)[key]);

/**
 * The (id, created_at, pubkey) of every event a filter matches, from memory, the pending maps
 * and MySQL, without the REQ limit. Shared by NIP-77 and NIP-45 COUNT.
 * @param socket - The client connection (tenant and IP).
 * @param filter - A validated NIP-01 filter.
 * @param maxRecords - Stops and reports tooBig past this many records.
 * @returns The records, or an error with a "blocked:" reason.
 */
const collectRecords = async (socket: ExtendedWebSocket, filter: Filter, maxRecords: number = NEG_MAX_RECORDS): Promise<Collected> => {

	const tooBig = (): Collected => ({ error: `blocked: this query is too big, more than ${maxRecords} events. Narrow it with since and until`, tooBig: true });

	if (filter.search) return { error: "blocked: search filters can't be synced" };

	const isIsolated = getConfig(socket.reqInfo.domain, ["relay", "isolated"]) == true;
	const tenantid = isIsolated ? socket.reqInfo.domainId : undefined;
	const horizon = eventStore.memoryHorizon || 0;
	const hasTags = Object.keys(filter).some(key => isTagKey(filter, key));
	const now = Math.floor(Date.now() / 1000);

	const records: Records = [];
	const seen = new Set<string>();
	const add = (id: string, created_at: number, pubkey: string): boolean => {
		if (seen.has(id)) return true;
		seen.add(id);
		// Deleted but not yet removed by the worker.
		if (eventStore.pendingDelete?.has(id)) return true;
		records.push({ id, created_at, pubkey });
		return records.length <= maxRecords;
	};
	const isExpired = (event: MetadataEvent): boolean => {
		const tag = event.tags.find(t => t[0] == "expiration");
		return !!tag && Number(tag[1]) < now;
	};
	// Full events waiting to be written: pending (memory window) and pendingArchive (older).
	const addPending = (map: Map<string, MetadataEvent> | undefined): boolean => {
		if (!map || map.size == 0 || map.size > NEG_PENDING_SCAN_MAX) return true;
		for (const event of map.values()) {
			if (PRIVATE_KINDS.has(event.kind) || isRelayHidden(event) || isExpired(event)) continue;
			if (tenantid != undefined && event.tenantid != tenantid) continue;
			if (!matchFilter(filter, event)) continue;
			if (!add(event.id, event.created_at, event.pubkey)) return false;
		}
		return true;
	};

	const reachesPastHorizon = horizon > 0 && (filter.since == undefined || filter.since < horizon);
	const dbNeeded = hasTags || reachesPastHorizon;
	if (dbNeeded && !isArchiveFilterSelective(filter)) {
		const days = getConfig(socket.reqInfo.domain, ["relay", "memoryDays"]) || 90;
		return { error: `blocked: filters reaching back more than ${days} days need ids, authors or up to 20 tag values. Add since to sync recent events` };
	}

	if (!hasTags) {
		// Memory index: everything from the horizon on, including events not flushed yet.
		const ids = filter.ids?.length ? new Set(filter.ids) : null;
		const authors = filter.authors?.length ? new Set(filter.authors) : null;
		const kinds = filter.kinds?.length ? new Set(filter.kinds) : null;
		let scanned = 0;
		for (const entry of eventStore.eventIndex.values()) {
			if (++scanned % NEG_YIELD_EVERY == 0) await new Promise(resolve => setImmediate(resolve));
			if (ids && !ids.has(entry.id)) continue;
			if (authors && (!entry.pubkey || !authors.has(entry.pubkey))) continue;
			if (kinds && (entry.kind == undefined || !kinds.has(entry.kind))) continue;
			if (filter.since != undefined && entry.created_at < filter.since) continue;
			if (filter.until != undefined && entry.created_at > filter.until) continue;
			if (tenantid != undefined && entry.tenantid != tenantid) continue;
			if (entry.kind != undefined && PRIVATE_KINDS.has(entry.kind)) continue;
			if (entry.expiration != undefined && entry.expiration < now) continue;
			if (entry.pubkey && isRelayHidden({ id: entry.id, pubkey: entry.pubkey })) continue;
			if (!add(entry.id, entry.created_at, entry.pubkey || "")) return tooBig();
		}
	} else if (!addPending(eventStore.pending)) {
		return tooBig();
	}
	if (!addPending(eventStore.pendingArchive)) return tooBig();

	if (dbNeeded) {
		// Tag filters can't be answered from the index, so the DB covers every age for them.
		const createdBefore = hasTags ? TAG_FILTER_UNTIL : horizon;
		const rows = await getArchivedIdsDB(filter, createdBefore, maxRecords + 1 - records.length, tenantid, socket.reqInfo.ip, NEG_BUILD_WAIT_MS);
		if (rows == null) return { error: "blocked: the relay is busy, try again later" };
		for (const row of rows) {
			if (isRelayHidden(row)) continue;
			if (!add(row.id, row.created_at, row.pubkey)) return tooBig();
		}
	}

	return { records };
};

const sendNegError = (socket: ExtendedWebSocket, subId: string, reason: string) =>
	socketSafeSend(socket, ["NEG-ERR", subId, reason]);

const closeSession = (socket: ExtendedWebSocket, subId: string): void => {
	const sessions = negSessions.get(socket);
	const session = sessions?.get(subId);
	if (!session) return;
	clearTimeout(session.timer);
	sessions!.delete(subId);
};

const armTimer = (socket: ExtendedWebSocket, subId: string): NodeJS.Timeout => {
	const timer = setTimeout(() => {
		closeSession(socket, subId);
		if (socket.readyState == WebSocket.OPEN) sendNegError(socket, subId, "closed: you took too long to respond!");
	}, NEG_IDLE_MS);
	timer.unref();
	return timer;
};

const handleNegOpen = async (socket: ExtendedWebSocket, args: unknown[]): Promise<void> => {
	const [subId, filter, message] = args;
	if (typeof subId != "string" || subId.length == 0) {
		await socketSafeSend(socket, ["NOTICE", "invalid: NEG-OPEN needs a subscription id"]);
		return;
	}
	if (subId.length > (Number(getConfig(socket.reqInfo.domain, ["relay", "limitation", "max_subid_length"])) || 64)) {
		await sendNegError(socket, subId, "invalid: subscription id too long");
		return;
	}
	if (!validateFilter(filter) || typeof message != "string") {
		await sendNegError(socket, subId, "invalid: NEG-OPEN needs a filter and an initial message");
		return;
	}

	// Reopening an id replaces the old sync (NIP-77).
	closeSession(socket, subId);
	let sessions = negSessions.get(socket);
	if (!sessions) {
		sessions = new Map();
		negSessions.set(socket, sessions);
	}
	if (sessions.size >= NEG_MAX_PER_SOCKET) {
		await sendNegError(socket, subId, `blocked: at most ${NEG_MAX_PER_SOCKET} syncs at once per connection`);
		return;
	}

	if (!await buildSlots.acquire(NEG_BUILD_WAIT_MS)) {
		await sendNegError(socket, subId, "blocked: the relay is busy, try again later");
		return;
	}
	let collected: Collected;
	const started = Date.now();
	try {
		collected = await collectRecords(socket, filter as Filter);
	} catch (error) {
		logger.error(`handleNegOpen - Error collecting records: ${error}`);
		collected = { error: "error: could not read the events" };
	} finally {
		buildSlots.release();
	}
	if ("error" in collected) {
		logger.debug(`handleNegOpen - ${collected.error} | ${JSON.stringify(filter)} |`, socket.reqInfo.ip);
		await sendNegError(socket, subId, collected.error);
		return;
	}

	let responder: NegentropyResponder;
	let reply: string;
	try {
		responder = new NegentropyResponder(collected.records, NEG_FRAME_SIZE_LIMIT);
		reply = responder.reconcile(message);
	} catch (error) {
		await sendNegError(socket, subId, `invalid: ${error instanceof Error ? error.message : "bad negentropy message"}`);
		return;
	}
	logger.debug(`handleNegOpen - ${subId}: ${responder.size} records in ${Date.now() - started} ms |`, socket.reqInfo.ip);

	if (socket.readyState != WebSocket.OPEN) return;
	sessions.set(subId, { responder, timer: armTimer(socket, subId) });
	await socketSafeSend(socket, ["NEG-MSG", subId, reply]);
};

const handleNegMsg = async (socket: ExtendedWebSocket, args: unknown[]): Promise<void> => {
	const [subId, message] = args;
	if (typeof subId != "string" || typeof message != "string") {
		await socketSafeSend(socket, ["NOTICE", "invalid: NEG-MSG needs a subscription id and a message"]);
		return;
	}
	const session = negSessions.get(socket)?.get(subId);
	if (!session) {
		await sendNegError(socket, subId, "closed: no open sync with this id");
		return;
	}
	clearTimeout(session.timer);
	try {
		const reply = session.responder.reconcile(message);
		session.timer = armTimer(socket, subId);
		await socketSafeSend(socket, ["NEG-MSG", subId, reply]);
	} catch (error) {
		closeSession(socket, subId);
		await sendNegError(socket, subId, `invalid: ${error instanceof Error ? error.message : "bad negentropy message"}`);
	}
};

const handleNegClose = (socket: ExtendedWebSocket, args: unknown[]): void => {
	if (typeof args[0] == "string") closeSession(socket, args[0]);
};

export { collectRecords, handleNegOpen, handleNegMsg, handleNegClose };
