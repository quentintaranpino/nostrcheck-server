// https://github.com/nostr-protocol/nips/blob/master/43.md
//
// Relay membership. A relay with auth_required only lets members in: registered users plus the
// pubkeys an admin allowed (NIP-86 allowpubkey) or that joined with an invite code (kind 28934).
// pubkeys.relaymember overrides the default: 1 = member, 0 = left or removed, NULL = registered
// users are members, everyone else is not.

import { Event, finalizeEvent } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";

import { dbInsert, dbMultiSelect, dbUpdate } from "../database/core.js";
import { getConfig } from "../config/core.js";
import { getNewDate } from "../utils.js";
import { logger } from "../logger.js";

const MEMBERSHIP_LIST_KIND = 13534;
const MEMBERSHIP_LIST_TTL_MS = 5 * 60 * 1000;

// Unregistered pubkeys get a row in `pubkeys` so bans and membership have something to point at.
const getPubkeyRowId = async (hex: string, comment: string): Promise<number> => {
	const existing = await dbMultiSelect(["id"], "pubkeys", "hex = ?", [hex], true);
	if (existing.length > 0) return Number(existing[0].id);
	return await dbInsert("pubkeys", ["hex", "createddate", "comments"], [hex, Math.floor(Date.now() / 1000), comment]);
};

const isRelayMember = async (hex: string): Promise<boolean> => {
	const row = await dbMultiSelect(["relaymember"], "pubkeys", "hex = ?", [hex], true);
	if (row.length > 0 && row[0].relaymember !== null && row[0].relaymember !== undefined) return Number(row[0].relaymember) == 1;
	const registered = await dbMultiSelect(["id"], "registered", "hex = ?", [hex], true);
	return registered.length > 0;
};

const isRegisteredPubkey = async (hex: string): Promise<boolean> =>
	(await dbMultiSelect(["id"], "registered", "hex = ?", [hex], true)).length > 0;

// Signed membership lists, per domain. Dropped on every membership change.
const membershipLists = new Map<string, { event: Event, expires: number }>();

const setRelayMember = async (hex: string, member: boolean, comment: string): Promise<boolean> => {
	const rowId = await getPubkeyRowId(hex, comment);
	if (!rowId) return false;
	const updated = await dbUpdate("pubkeys", { relaymember: member ? 1 : 0, relaymemberdate: Math.floor(Date.now() / 1000) }, ["id"], [rowId]);
	if (updated) membershipLists.clear();
	return updated;
};

const listAllowedPubkeys = async (): Promise<{ pubkey: string, reason: string }[]> => {
	const rows = await dbMultiSelect(["hex", "comments"], "pubkeys", "relaymember = 1", [], false);
	return rows.map(row => ({ pubkey: row.hex, reason: row.comments || "" }));
};

// Spends an invite code. Codes are single use; a used one is deactivated and records who took it.
const redeemClaim = async (code: string, hex: string): Promise<boolean> => {
	if (!code || code.length > 32) return false;
	const invite = await dbMultiSelect(["id"], "invitations", "code = ? AND active = 1 AND inviteeid IS NULL", [code], true);
	if (invite.length == 0) return false;
	const spent = await dbUpdate("invitations", { active: 0, inviteedate: getNewDate(), comments: `relay member ${hex}` }, ["id"], [invite[0].id]);
	if (!spent) return false;
	return await setRelayMember(hex, true, "nip43 claim");
};

const createClaim = async (code: string, originId: number): Promise<boolean> => {
	const existing = await dbMultiSelect(["id"], "invitations", "code = ?", [code], true);
	if (existing.length > 0) return false;
	const id = await dbInsert("invitations", ["active", "code", "originid", "createdate", "comments"], [1, code, originId, getNewDate(), "nip86 claim"]);
	return id > 0;
};

const listClaims = async (): Promise<string[]> => {
	const rows = await dbMultiSelect(["code"], "invitations", "active = 1 AND inviteeid IS NULL", [], false);
	return rows.map(row => row.code);
};

const deleteClaim = async (code: string): Promise<boolean> =>
	await dbUpdate("invitations", { active: 0 }, ["code"], [code]);

/**
 * Kind 13534 membership list for a domain, signed with its server key (the NIP-11 `self`).
 * Built on demand and cached; null when the domain has no key or the query fails.
 */
const getMembershipList = async (domain: string): Promise<Event | null> => {
	const cached = membershipLists.get(domain);
	if (cached && cached.expires > Date.now()) return cached.event;

	const secretKey = getConfig(domain, ["server", "secretKey"]);
	if (!secretKey) return null;

	try {
		const registered = await dbMultiSelect(["DISTINCT r.hex AS hex"], "registered r LEFT JOIN pubkeys p ON p.hex = r.hex", "(p.relaymember IS NULL OR p.relaymember = 1)", [], false);
		const allowed = await dbMultiSelect(["hex"], "pubkeys", "relaymember = 1", [], false);
		const members = [...new Set([...registered, ...allowed].map(row => row.hex))].filter(hex => /^[a-f0-9]{64}$/.test(hex)).sort();

		const event = finalizeEvent({
			kind: MEMBERSHIP_LIST_KIND,
			created_at: Math.floor(Date.now() / 1000),
			tags: [["-"], ...members.map(hex => ["member", hex])],
			content: "",
		}, hexToBytes(secretKey));
		membershipLists.set(domain, { event, expires: Date.now() + MEMBERSHIP_LIST_TTL_MS });
		return event;
	} catch (error) {
		logger.error(`getMembershipList - Error building the membership list for ${domain}: ${error}`);
		return null;
	}
};

export { MEMBERSHIP_LIST_KIND, getPubkeyRowId, isRelayMember, isRegisteredPubkey, setRelayMember, listAllowedPubkeys, redeemClaim, createClaim, listClaims, deleteClaim, getMembershipList };
