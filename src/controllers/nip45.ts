// https://github.com/nostr-protocol/nips/blob/master/45.md
//
// COUNT without the REQ limit, plus HyperLogLog registers (lib/relay/hll.ts) where NIP-45
// defines them, so clients can merge counts across relays.

import { Filter } from "nostr-tools";

import { ExtendedWebSocket } from "../interfaces/relay.js";
import { socketSafeSend } from "../lib/relay/core.js";
import { createSlots } from "../lib/utils.js";
import { logger } from "../lib/logger.js";
import { collectRecords } from "./nip77.js";
import { buildHll, getHllOffset } from "../lib/relay/hll.js";

const COUNT_MAX_RECORDS = 100000;
const COUNT_WAIT_MS = 3000;
const countSlots = createSlots(4);

/**
 * Answers a COUNT exactly (up to COUNT_MAX_RECORDS) with an HLL when the filter allows one.
 * Returns false when it can't (broad filter, relay busy) so the caller falls back to the
 * in-memory count.
 * @param socket - The client connection.
 * @param subId - The COUNT query id.
 * @param filters - The client filters (already validated).
 * @returns True when the COUNT was answered here.
 */
const handleCount = async (socket: ExtendedWebSocket, subId: string, filters: Filter[]): Promise<boolean> => {

	// Filters without tags are answered from the memory index; without authors or ids that is
	// a full walk of the index, which the in-memory count already does more cheaply.
	const selective = filters.every(f => (f.ids && f.ids.length > 0) || (f.authors && f.authors.length > 0) || Object.keys(f).some(key => key.startsWith("#")));
	if (!selective) return false;

	if (!await countSlots.acquire(COUNT_WAIT_MS)) return false;
	const pubkeys = new Map<string, string>();
	let approximate = false;
	try {
		for (const filter of filters) {
			const collected = await collectRecords(socket, filter, COUNT_MAX_RECORDS);
			if ("error" in collected) {
				if (!collected.tooBig) return false;
				approximate = true;
				break;
			}
			for (const record of collected.records) pubkeys.set(record.id, record.pubkey);
		}
	} catch (error) {
		logger.error(`handleCount - Error counting events: ${error}`);
		return false;
	} finally {
		countSlots.release();
	}

	const result: { count: number, approximate?: boolean, hll?: string } = { count: approximate ? Math.max(COUNT_MAX_RECORDS, pubkeys.size) : pubkeys.size };
	if (approximate) result.approximate = true;
	const offset = filters.length == 1 && !approximate ? getHllOffset(filters[0]) : -1;
	if (offset >= 0) result.hll = buildHll(pubkeys.values(), offset);

	await socketSafeSend(socket, ["COUNT", subId, result]);
	return true;
};

export { handleCount };
