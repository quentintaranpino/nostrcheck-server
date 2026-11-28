// https://github.com/nostr-protocol/nips/blob/master/86.md

import crypto from "crypto";
import net from "net";
import { Request, Response } from "express";

import { logger } from "../lib/logger.js";
import { isIpAllowed } from "../lib/security/ips.js";
import { isModuleEnabled, getConfig } from "../lib/config/core.js";
import { parseAuthHeader } from "../lib/authorization.js";
import { banEntity, unbanEntity } from "../lib/security/banned.js";
import { dbInsert, dbMultiSelect } from "../lib/database/core.js";
import { setRelayEventBan, setRelayPubkeyBan } from "../lib/relay/bans.js";
import { eventStore } from "../interfaces/relay.js";
import { storeEvents } from "../lib/relay/database.js";
import { createClaim, deleteClaim, getPubkeyRowId, listAllowedPubkeys, listClaims, setRelayMember } from "../lib/relay/members.js";
import { generateInviteCode } from "../lib/invitations.js";

type RpcResult = { result?: unknown, error?: string };

const HEX64 = /^[a-f0-9]{64}$/;
const BAN_CATEGORY = "OTHER";

const supportedMethods = [
	"supportedmethods",
	"banpubkey", "unbanpubkey", "listbannedpubkeys",
	"banevent", "unbanevent", "listbannedevents",
	"blockip", "unblockip", "listblockedips",
	"allowpubkey", "unallowpubkey", "listallowedpubkeys",
	"createclaim", "listclaims", "deleteclaim",
];

const CLAIM_CODE = /^[A-Za-z0-9_-]{6,32}$/;

const reasonOf = (value: unknown): string => typeof value == "string" ? value.slice(0, 150) : "";

// The auth event travels base64 in the header; parseAuthHeader already checked it, this only
// reads the payload tag back.
const getAuthPayloadTag = (req: Request): string => {
	try {
		const raw = (req.headers.authorization || "").split(" ")[1] || "";
		const event = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
		const tag = (event.tags || []).find((t: string[]) => t[0] == "payload");
		return tag && typeof tag[1] == "string" ? tag[1].toLowerCase() : "";
	} catch {
		return "";
	}
};


const getIpRowId = async (ip: string): Promise<number> => {
	const existing = await dbMultiSelect(["id"], "ips", "ip = ?", [ip], true);
	if (existing.length > 0) return Number(existing[0].id);
	const now = Math.floor(Date.now() / 1000);
	return await dbInsert("ips", ["ip", "firstseen", "lastseen", "comments"], [ip, now, now, "nip86"]);
};

const banPubkey = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const hex = String(params[0] ?? "").toLowerCase();
	if (!HEX64.test(hex)) return { error: "invalid pubkey" };
	if (hex == getConfig(null, ["server", "pubkey"])) return { error: "can't ban the server pubkey" };

	const registered = await dbMultiSelect(["id"], "registered", "hex = ?", [hex], true);
	const result = registered.length > 0
		? await banEntity(Number(registered[0].id), "registered", reasonOf(params[1]), admin, "admin", BAN_CATEGORY)
		: await banEntity(await getPubkeyRowId(hex, "nip86"), "pubkeys", reasonOf(params[1]), admin, "admin", BAN_CATEGORY);
	if (result.status != "success") return { error: result.message };

	// A ban also takes the pubkey off the allow list (NIP-86).
	const allowed = await dbMultiSelect(["id"], "pubkeys", "hex = ? AND relaymember = 1", [hex], true);
	if (allowed.length > 0) await setRelayMember(hex, false, "nip86");

	setRelayPubkeyBan(hex, true);
	return { result: true };
};

const unbanPubkey = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const hex = String(params[0] ?? "").toLowerCase();
	if (!HEX64.test(hex)) return { error: "invalid pubkey" };

	const registered = await dbMultiSelect(["id"], "registered", "hex = ?", [hex], true);
	if (registered.length > 0) await unbanEntity(Number(registered[0].id), "registered", admin, "admin");
	const unregistered = await dbMultiSelect(["id"], "pubkeys", "hex = ?", [hex], true);
	if (unregistered.length > 0) await unbanEntity(Number(unregistered[0].id), "pubkeys", admin, "admin");

	setRelayPubkeyBan(hex, false);
	return { result: true };
};

const listBannedPubkeys = async (): Promise<RpcResult> => {
	const rows = [
		...await dbMultiSelect(["r.hex AS pubkey", "b.reason AS reason"], "banned b JOIN registered r ON r.id = b.originid", "b.origintable = 'registered' AND b.active = 1", [], false),
		...await dbMultiSelect(["p.hex AS pubkey", "b.reason AS reason"], "banned b JOIN pubkeys p ON p.id = b.originid", "b.origintable = 'pubkeys' AND b.active = 1", [], false),
	];
	const seen = new Set<string>();
	const result = rows.filter(row => !seen.has(row.pubkey) && seen.add(row.pubkey)).map(row => ({ pubkey: row.pubkey, reason: row.reason || "" }));
	return { result };
};

const banEvent = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const id = String(params[0] ?? "").toLowerCase();
	if (!HEX64.test(id)) return { error: "invalid event id" };

	let row = await dbMultiSelect(["id"], "events", "event_id = ?", [id], true);
	// A ban points at the DB row. An event still waiting for the flush (up to a minute, or the
	// whole store load after a restart) is stored now; the flush skips it later as a duplicate.
	const pendingEvent = eventStore.pending?.get(id);
	if (row.length == 0 && pendingEvent) {
		await storeEvents(pendingEvent);
		row = await dbMultiSelect(["id"], "events", "event_id = ?", [id], true);
	}
	if (row.length == 0) return { error: "event not found" };
	const result = await banEntity(Number(row[0].id), "events", reasonOf(params[1]), admin, "admin", BAN_CATEGORY);
	if (result.status != "success") return { error: result.message };

	setRelayEventBan(id, true);
	return { result: true };
};

const unbanEvent = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const id = String(params[0] ?? "").toLowerCase();
	if (!HEX64.test(id)) return { error: "invalid event id" };

	const row = await dbMultiSelect(["id"], "events", "event_id = ?", [id], true);
	if (row.length > 0) await unbanEntity(Number(row[0].id), "events", admin, "admin");

	setRelayEventBan(id, false);
	return { result: true };
};

const listBannedEvents = async (): Promise<RpcResult> => {
	const rows = await dbMultiSelect(["e.event_id AS id", "b.reason AS reason"], "banned b JOIN events e ON e.id = b.originid", "b.origintable = 'events' AND b.active = 1", [], false);
	return { result: rows.map(row => ({ id: row.id, reason: row.reason || "" })) };
};

const blockIp = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const ip = String(params[0] ?? "").trim();
	if (net.isIP(ip) == 0) return { error: "invalid ip address" };

	const rowId = await getIpRowId(ip);
	if (!rowId) return { error: "could not store the ip address" };
	const result = await banEntity(rowId, "ips", reasonOf(params[1]), admin, "admin", BAN_CATEGORY);
	if (result.status != "success") return { error: result.message };
	return { result: true };
};

const unblockIp = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const ip = String(params[0] ?? "").trim();
	if (net.isIP(ip) == 0) return { error: "invalid ip address" };

	const row = await dbMultiSelect(["id"], "ips", "ip = ?", [ip], true);
	if (row.length > 0) await unbanEntity(Number(row[0].id), "ips", admin, "admin");
	return { result: true };
};

const listBlockedIps = async (): Promise<RpcResult> => {
	const rows = await dbMultiSelect(["i.ip AS ip", "b.reason AS reason"], "banned b JOIN ips i ON i.id = b.originid", "b.origintable = 'ips' AND b.active = 1", [], false);
	return { result: rows.map(row => ({ ip: row.ip, reason: row.reason || "" })) };
};

// NIP-43 membership. allowpubkey also lifts a ban, as the spec says; unallowpubkey doesn't ban.
const allowPubkey = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const hex = String(params[0] ?? "").toLowerCase();
	if (!HEX64.test(hex)) return { error: "invalid pubkey" };
	const unbanned = await unbanPubkey([hex], admin);
	if (unbanned.error) return unbanned;
	if (!await setRelayMember(hex, true, reasonOf(params[1]) || "nip86")) return { error: "could not store the pubkey" };
	return { result: true };
};

const unallowPubkey = async (params: unknown[]): Promise<RpcResult> => {
	const hex = String(params[0] ?? "").toLowerCase();
	if (!HEX64.test(hex)) return { error: "invalid pubkey" };
	if (!await setRelayMember(hex, false, "nip86")) return { error: "could not store the pubkey" };
	return { result: true };
};

// The claim is the invite code. Without one, a random code is created; listclaims shows it.
const createClaimMethod = async (params: unknown[], admin: string): Promise<RpcResult> => {
	const code = params[0] === undefined || params[0] === "" ? generateInviteCode() : String(params[0]);
	if (!CLAIM_CODE.test(code)) return { error: "invalid claim: use 6-32 letters, digits, - or _" };
	const origin = await dbMultiSelect(["id"], "registered", "hex = ?", [admin], true);
	if (origin.length == 0) return { error: "the admin pubkey is not registered" };
	if (!await createClaim(code, Number(origin[0].id))) return { error: "claim already exists" };
	return { result: true };
};

const deleteClaimMethod = async (params: unknown[]): Promise<RpcResult> => {
	const code = String(params[0] ?? "");
	if (!CLAIM_CODE.test(code)) return { error: "invalid claim" };
	await deleteClaim(code);
	return { result: true };
};

const runMethod = async (method: string, params: unknown[], admin: string): Promise<RpcResult> => {
	switch (method) {
		case "supportedmethods": return { result: supportedMethods };
		case "banpubkey": return banPubkey(params, admin);
		case "unbanpubkey": return unbanPubkey(params, admin);
		case "listbannedpubkeys": return listBannedPubkeys();
		case "banevent": return banEvent(params, admin);
		case "unbanevent": return unbanEvent(params, admin);
		case "listbannedevents": return listBannedEvents();
		case "blockip": return blockIp(params, admin);
		case "unblockip": return unblockIp(params, admin);
		case "listblockedips": return listBlockedIps();
		case "allowpubkey": return allowPubkey(params, admin);
		case "unallowpubkey": return unallowPubkey(params);
		case "listallowedpubkeys": return { result: await listAllowedPubkeys() };
		case "createclaim": return createClaimMethod(params, admin);
		case "listclaims": return { result: await listClaims() };
		case "deleteclaim": return deleteClaimMethod(params);
		default: return { error: `unsupported method: ${method}` };
	}
};

/**
 * NIP-86 relay management API. Served on the relay URL itself for POST requests with
 * Content-Type application/nostr+json+rpc. Auth is NIP-98 from an admin pubkey, and the
 * payload tag must be the sha256 of the exact request body.
 */
const handleNIP86 = async (req: Request, res: Response): Promise<Response> => {

	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`handleNIP86 - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({ error: reqInfo.comments });
	}

	if (!isModuleEnabled("relay", req.hostname)) {
		logger.warn(`handleNIP86 - Attempt to access a non-active module: relay | IP:`, reqInfo.ip);
		return res.status(403).send({ error: "relay module is not enabled" });
	}

	const body = typeof req.body == "string" ? req.body : "";

	const auth = await parseAuthHeader(req, "nip86", true, true, true);
	if (auth.status != "success" || auth.kind != 27235) {
		logger.warn(`handleNIP86 - Unauthorized: ${auth.message} | IP:`, reqInfo.ip);
		return res.status(401).send({ error: "unauthorized" });
	}
	const bodyHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");
	if (getAuthPayloadTag(req) != bodyHash) {
		logger.warn(`handleNIP86 - Payload tag does not match the body | IP:`, reqInfo.ip);
		return res.status(401).send({ error: "unauthorized: payload tag must be the sha256 of the request body" });
	}

	let call: { method?: unknown, params?: unknown };
	try {
		call = JSON.parse(body);
	} catch {
		return res.status(400).send({ error: "invalid JSON body" });
	}
	const method = typeof call?.method == "string" ? call.method : "";
	const params = Array.isArray(call?.params) ? call.params : [];

	try {
		const outcome = await runMethod(method, params, auth.pubkey);
		logger.info(`handleNIP86 - ${method} by ${auth.pubkey}${outcome.error ? ` failed: ${outcome.error}` : ""} | IP:`, reqInfo.ip);
		res.setHeader("Content-Type", "application/nostr+json+rpc");
		return res.status(200).send(JSON.stringify(outcome.error ? { result: null, error: outcome.error } : { result: outcome.result }));
	} catch (error) {
		logger.error(`handleNIP86 - Internal server error on ${method}: ${error}`);
		return res.status(500).send({ error: "internal server error" });
	}
};

export { handleNIP86 };
