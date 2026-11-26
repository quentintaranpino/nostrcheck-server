import { dbMultiSelect } from "../database/core.js";
import { logger } from "../logger.js";

// Bans the relay applies when serving: events from banned pubkeys and banned events stay out of
// REQ results and live subscriptions without being deleted, so an unban brings them back.
// isEntityBanned is a Redis round trip per call, too slow for every served event. These sets
// hold a few dozen entries and are reloaded every minute and after each NIP-86 change.
const bannedPubkeys = new Set<string>();
const bannedEventIds = new Set<string>();

const refreshRelayBans = async (): Promise<void> => {

	try {
		const pubkeyRows = [
			...await dbMultiSelect(["r.hex AS hex"], "banned b JOIN registered r ON r.id = b.originid", "b.origintable = 'registered' AND b.active = 1", [], false),
			...await dbMultiSelect(["p.hex AS hex"], "banned b JOIN pubkeys p ON p.id = b.originid", "b.origintable = 'pubkeys' AND b.active = 1", [], false),
		];
		const eventRows = await dbMultiSelect(["e.event_id AS event_id"], "banned b JOIN events e ON e.id = b.originid", "b.origintable = 'events' AND b.active = 1", [], false);

		// dbMultiSelect answers [] on a DB error too. An empty result never wipes a set that
		// has entries: dropping every ban on a transient error is worse than a stale unban,
		// which the NIP-86 calls apply directly anyway.
		if (pubkeyRows.length > 0 || bannedPubkeys.size == 0) {
			bannedPubkeys.clear();
			for (const row of pubkeyRows) bannedPubkeys.add(row.hex);
		}
		if (eventRows.length > 0 || bannedEventIds.size == 0) {
			bannedEventIds.clear();
			for (const row of eventRows) bannedEventIds.add(row.event_id);
		}
	} catch (error) {
		logger.error(`refreshRelayBans - Error loading relay bans: ${error}`);
	}
};

const isRelayHidden = (event: { id: string, pubkey: string }): boolean =>
	bannedPubkeys.has(event.pubkey) || bannedEventIds.has(event.id);

const setRelayPubkeyBan = (pubkey: string, banned: boolean): void => {
	if (banned) bannedPubkeys.add(pubkey); else bannedPubkeys.delete(pubkey);
};

const setRelayEventBan = (id: string, banned: boolean): void => {
	if (banned) bannedEventIds.add(id); else bannedEventIds.delete(id);
};

await refreshRelayBans();
setInterval(refreshRelayBans, 60 * 1000).unref();

export { refreshRelayBans, isRelayHidden, setRelayPubkeyBan, setRelayEventBan };
