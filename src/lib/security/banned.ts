import fs from "fs";

import { ResultMessagev2 } from "../../interfaces/server.js";
import { dbInsert, dbMultiSelect, dbUpdate } from "../database/core.js";
import { logger } from "../logger.js";
import { getConfig, isModuleEnabled } from "../config/core.js";
import { getResource } from "../frontend.js";
import { generateVideoFromImage } from "../utils.js";
import { initRedis } from "../redis/client.js";
import { logAuditEvent } from "../audit/core.js";
import { deleteFile } from "../storage/core.js";

const redisCore = await initRedis(0, false);

// Ban keys are a cache of the `banned` table, not the source of truth.
// Without TTL they grow forever in Redis — give them a finite lifetime so
// expired or rotated entries can't pile up. The periodic reload from DB
// re-populates them when needed.
const BAN_KEY_TTL = 7 * 24 * 60 * 60; // 7 days

const manageEntity = async (originId: number, originTable: string, action: "ban" | "unban", reason?: string, actor?: string, source?: string, category?: string): Promise<ResultMessagev2> => {

    if (!isModuleEnabled("security", ""))  return { status: "error", message: "Security module is not enabled" };

    // A ban needs a category, which is the closed set the admin dialog offers.
    // Before the category column that requirement fell on `reason`, and free text
    // produced 32 spellings for five real categories. `reason` is now an optional
    // comment, so callers that only send one still work.
    if (originId == 0 || originId == null || originTable == "" || originTable == null ||
        (action === "ban" && (!category || category === "") && (!reason || reason === ""))) {
        return { status: "error", message: "Invalid parameters" };
    }

    const whereFields = [];
    let keyField = "";

    switch (originTable) {
        case "registered":
            whereFields.push("hex");
            keyField = "hex";
            break;
    
        case "mediafiles":
            whereFields.push("original_hash");
            keyField = "original_hash";
            break;
    
        case "ips":
            whereFields.push("ip");
            keyField = "ip";
            break;

        case "events":
            whereFields.push("event_id");
            keyField = "event_id";
            break;
    
        case "banned": {
            const result = await dbMultiSelect(["originid", "origintable"], "banned", "id = ?", [originId], true) as any;
            if (!result || result.length === 0) {
                return { status: "error", message: "Record not found" };
            }
            return manageEntity(result[0].originid, result[0].origintable, action, reason, actor, source, category);
        }
        default: {
            return { status: "error", message: "Invalid table name" };
        }
    }

    const result = await dbMultiSelect(whereFields, originTable, "id = ?", [originId], true) as any;
    if (originTable == "registered" && result.hex == getConfig(null, ["server", "pubkey"])) {
        return { status: "error", message: `You can't ${action} the server pubkey` };
    }

    if (result.length == 0) {
        return { status: "error", message: "Record not found" };
    }

    // Find all records with the same keyField value
    const resultRecords = await dbMultiSelect(["id"], originTable, `${keyField} = ?`, [result[0][keyField]], false);
    if (resultRecords.length > 0) {
        for (const record of resultRecords) {

            const resultBanTable = await dbMultiSelect(["active"], "banned", "originid = ? and origintable = ?", [record.id, originTable], false);

            if (action === "ban") {
                if (resultBanTable.length > 0 && resultBanTable[0].active == 1) { continue; }
                if (resultBanTable.length > 0 && resultBanTable[0].active == 0) {
                    // Re-banning an old row: the category and comment of this
                    // decision replace the ones from the previous ban.
                    const updateResult = await dbUpdate("banned", {"active": "1", "category": category || "", "reason": reason || ""}, ["originid", "origintable"], [record.id, originTable]);
                    if (!updateResult) {
                        return { status: "error", message: "Error setting active ban to record" };
                    }
                    continue;
                }

                const insertResult = await dbInsert("banned", ["originid", "origintable", "createddate", "category", "reason"], [record.id, originTable, Math.floor(Date.now() / 1000), category || "", reason || ""]);
                if (insertResult == 0) {
                    return { status: "error", message: "Error inserting record ban" };
                }
            } else if (action === "unban") {
                if (resultBanTable.length == 0 || (resultBanTable.length > 0 && resultBanTable[0].active == 0)) { continue; }

                const updateResult = await dbUpdate("banned", {"active": "0"}, ["originid", "origintable"], [record.id, originTable]);
                if (!updateResult) {
                    return { status: "error", message: "Error setting inactive ban to record" };
                }
            }
        }

        const redisKeyPrimary = `banned:${originTable}:${originId}`;
        if (action === "ban") {
            await redisCore.set(redisKeyPrimary, JSON.stringify("1"), { EX: BAN_KEY_TTL });

            switch (originTable) {
                case "registered": {
                    const redisKeyHex = `banned:${originTable}:${result[0].hex}`;
                    await redisCore.set(redisKeyHex, JSON.stringify("1"), { EX: BAN_KEY_TTL });
                    break;
                }
                case "mediafiles": {
                    const redisKeyHash = `banned:${originTable}:${result[0].original_hash}`;
                    await redisCore.set(redisKeyHash, JSON.stringify("1"), { EX: BAN_KEY_TTL });

                    // getMediabyURL caches a per-file "servable" flag under `<filename>-<pubkey>`
                    // (plus host-prefixed variants), and a cache hit short-circuits this very ban
                    // check. Drop those keys or the file keeps being served until they expire.
                    const bannedFiles = await dbMultiSelect(["filename"], "mediafiles", "original_hash = ?", [result[0].original_hash], false);
                    for (const bannedFile of bannedFiles) {
                        if (bannedFile.filename) await redisCore.delByPattern(`*${bannedFile.filename}*`);
                    }
                    break;
                }
                case "ips": {
                    const redisKeyIp = `banned:${originTable}:${result[0].ip}`;
                    await redisCore.set(redisKeyIp, JSON.stringify("1"), { EX: BAN_KEY_TTL });
                    break;
                }
                case "events": {
                    const redisKeyEvent = `banned:${originTable}:${result[0].event_id}`;
                    await redisCore.set(redisKeyEvent, JSON.stringify("1"), { EX: BAN_KEY_TTL });
                    break;
                }
            }
        } else if (action === "unban") {
            await redisCore.del(redisKeyPrimary);

            switch (originTable) {
                case "registered": {
                    const redisKeyHex = `banned:${originTable}:${result[0].hex}`;
                    await redisCore.del(redisKeyHex);
                    break;
                }
                case "mediafiles": {
                    const redisKeyHash = `banned:${originTable}:${result[0].original_hash}`;
                    await redisCore.del(redisKeyHash);

                    // Same cache as in the ban branch: clear it so the file is servable again at once.
                    const unbannedFiles = await dbMultiSelect(["filename"], "mediafiles", "original_hash = ?", [result[0].original_hash], false);
                    for (const unbannedFile of unbannedFiles) {
                        if (unbannedFile.filename) await redisCore.delByPattern(`*${unbannedFile.filename}*`);
                    }
                    break;
                }
                case "ips": {
                    const redisKeyIp = `banned:${originTable}:${result[0].ip}`;
                    await redisCore.del(redisKeyIp);
                    break;
                }
                case "events": {
                    const redisKeyEvent = `banned:${originTable}:${result[0].event_id}`;
                    await redisCore.del(redisKeyEvent);
                    break;
                }
            }
        }

        // Every ban and unban is audited, ips included. Only content bans are
        // notified: the infraction autoban in ips.ts would flood the channel.
        const notifiableBan = originTable == "mediafiles" || originTable == "registered" || originTable == "events";
        await logAuditEvent({
            eventtype: action === "ban" ? "banned" : "unbanned",
            origintable: originTable,
            originid: originId,
            actor: actor,
            source: source,
            pubkey: originTable == "registered" ? result[0].hex || "" : "",
            filehash: originTable == "mediafiles" ? result[0].original_hash || "" : "",
            previous_value: action === "ban" ? "not banned" : "banned",
            new_value: action === "ban" ? "banned" : "not banned",
            action: `${resultRecords.length} row(s) ${action}ned in ${originTable}`,
            reason: reason || "",
            details: {keyfield: keyField, keyvalue: result[0][keyField], rows: resultRecords.length, category: category || ""},
            notify: action === "ban" && notifiableBan,
        });

        return { status: "success", message: `Records with ${keyField} : ${result[0][keyField]} from table ${originTable} ${action}ned successfully` };
    }

    return { status: "error", message: `No records found to ${action}` };
};

/**
 * Bans an entity.
 * @param originId - The ID of the entity to ban.
 * @param originTable - The table where the entity is stored.
 * @param reason - The reason for banning the entity.
 * @param actor - Who ordered the ban: pubkey in hex, or "system". Ends up in the audit log.
 * @param source - Where it came from: admin | user | system | report. Defaults to "system".
 * @returns Promise resolving to a `ResultMessagev2` object.
 * @async
 * @example
 * ```typescript
 * const banResult = await banEntity(1, "registered", "Spamming the network", adminPubkey, "admin");
 * ```
 **/
const banEntity = async (originId: number, originTable: string, reason: string, actor?: string, source?: string, category?: string): Promise<ResultMessagev2> => {
    return manageEntity(originId, originTable, "ban", reason, actor, source, category);
};

/**
 * Unbans an entity.
 * @param originId - The ID of the entity to unban.
 * @param originTable - The table where the entity is stored.
 * @param actor - Who ordered the unban: pubkey in hex, or "system". Ends up in the audit log.
 * @param source - Where it came from: admin | user | system. Defaults to "system".
 * @returns Promise resolving to a `ResultMessagev2` object.
 * @async
 * @example
 * ```typescript
 * const unbanResult = await unbanEntity(1, "registered", adminPubkey, "admin");
 * ```
 **/
const unbanEntity = async (originId: number, originTable: string, actor?: string, source?: string): Promise<ResultMessagev2> => {
    return manageEntity(originId, originTable, "unban", undefined, actor, source);
};

/**
 * Deletes the stored objects of a banned media file, keeping every database row.
 *
 * Bans are resolved by `original_hash` and cover every row that shares it, so
 * deletion follows the same boundary: one hash, every filename it produced,
 * processed variants included. Leaving those behind would keep bytes on disk
 * under an active ban.
 *
 * The rows stay: `mediafiles`, `banned` and the audit trail are the record that
 * the file existed and what was done with it. Only the bytes go.
 *
 * @param originId - Id of any `mediafiles` row of the hash.
 * @param actor - Who ordered it: pubkey in hex, or "system".
 * @param source - admin | user | system | report. Defaults to "admin".
 * @param reason - Free text stored in the audit row.
 * @returns `{status, message, deleted, failed}` with the object counts.
 */
const deleteBannedObjects = async (originId: number, actor?: string, source?: string, reason?: string): Promise<{status: "success" | "error", message: string, deleted: number, failed: number}> => {

	if (!isModuleEnabled("security", "")) return { status: "error", message: "Security module is not enabled", deleted: 0, failed: 0 };

	if (originId == 0 || originId == null) {
		return { status: "error", message: "Invalid parameters", deleted: 0, failed: 0 };
	}

	const originRecord = await dbMultiSelect(["original_hash"], "mediafiles", "id = ?", [originId], true);
	if (originRecord.length == 0 || !originRecord[0].original_hash) {
		return { status: "error", message: "Record not found", deleted: 0, failed: 0 };
	}
	const originalHash = originRecord[0].original_hash;

	// Same query the ban path uses to purge the cache: one hash, every row, every
	// filename. Deleting only the selected row's file leaves processed variants.
	const hashRecords = await dbMultiSelect(["id", "filename"], "mediafiles", "original_hash = ?", [originalHash], false);
	if (hashRecords.length == 0) {
		return { status: "error", message: "No records found for that hash", deleted: 0, failed: 0 };
	}

	const seenFilenames: string[] = [];
	let deleted = 0;
	let failed = 0;

	for (const record of hashRecords) {
		if (!record.filename || seenFilenames.includes(record.filename)) continue;
		seenFilenames.push(record.filename);

		let removed = false;
		try {
			removed = await deleteFile(record.filename);
		} catch (error) {
			logger.error(`deleteBannedObjects - Cannot delete object: ${record.filename} with error: ${error}`);
			removed = false;
		}

		if (removed == false) {
			// The ban is the protection, deletion is hygiene: a storage failure is
			// logged and the rest of the hash still gets cleaned.
			failed++;
			logger.warn(`deleteBannedObjects - Object not deleted: ${record.filename} | hash: ${originalHash}`);
			continue;
		}

		deleted++;
		await logAuditEvent({
			eventtype: "deleted",
			origintable: "mediafiles",
			originid: record.id,
			actor: actor,
			source: source || "admin",
			filehash: originalHash,
			previous_value: record.filename,
			new_value: "deleted from storage",
			action: "object deleted, database record kept",
			reason: reason || "",
			details: {hash: originalHash, filename: record.filename, rows: hashRecords.length},
		});
	}

	logger.info(`deleteBannedObjects - hash: ${originalHash} | deleted: ${deleted} | failed: ${failed}`);

	return {
		status: failed > 0 && deleted == 0 ? "error" : "success",
		message: `${deleted} object(s) deleted, ${failed} failed`,
		deleted: deleted,
		failed: failed,
	};
};

/**
 * Checks if an entity is banned.
 * @param id - The ID of the entity to check.
 * @param table - The table where the entity is stored.
 * @returns Promise resolving to `true` if the entity is banned, otherwise `false`.
 * @async
 * @example
 * ```typescript
 * const isBanned = await isEntityBanned("1", "registered");
 * ```
**/
const isEntityBanned = async (id: string, table: string): Promise<boolean> => {

    if (!isModuleEnabled("security", ""))  return false;

    if (id === "" || table === "") return true;

    // If the cache is empty, we need to fill it with the database status
    if (await redisCore.get("banned:cache") === null) {
        await loadBannedEntities();
        return await isEntityBanned(id, table);
    }

    const redisKey = `banned:${table}:${id}`;
    const cachedStatus = await redisCore.get(redisKey);
    if (cachedStatus !== null) {
        logger.debug(`isEntityBanned - Content is banned: ${id} | ${table}`);
        return true;
    }
    
    return false;
};

/**
 * Gets the banned file banner.
 * @param domain - The domain of the resource.
 * @param mimeType - The MIME type of the resource.
 * @returns Promise resolving to a `Buffer` with the banned file banner.
 * @async
**/
const getBannedFileBanner = async (domain: string, mimeType: string): Promise<{ buffer: Buffer; type: 'image/webp' | 'video/mp4' }> => {

	const bannedPath = await getResource(domain, "media-file-banned.default.webp");

	if (bannedPath == null) {
		logger.error(`getBannedFileBanner - Error getting banned file banner, path is null`);
		return { buffer: Buffer.from(""), type: "image/webp" };
	}

	try {
        const buffer = await fs.promises.readFile(bannedPath);
		if (mimeType.startsWith('video')) {
			const videoBuffer = await generateVideoFromImage(buffer);
			return { buffer: videoBuffer, type: "video/mp4" };
		} else {
			return { buffer, type: "image/webp" };
		}
	} catch (err) {
		logger.error(`getBannedFileBanner - Error reading file: ${bannedPath} with error: ${err}`);
		return { buffer: Buffer.from(""), type: "image/webp" };
	}
};

/**
* Loads the banned entities from the database into Redis.
**/
const loadBannedEntities = async (): Promise<void> => {

    if (!isModuleEnabled("security", "")) return;

    const bannedEntities = await dbMultiSelect(["originid", "origintable"], "banned", "active = 1", [], false);

    for (const entity of bannedEntities) {
        const redisKeyPrimary = `banned:${entity.origintable}:${entity.originid}`;
        await redisCore.set(redisKeyPrimary, JSON.stringify("1"), { EX: BAN_KEY_TTL });

        switch (entity.origintable) {
            case "registered": {
                const regResult = await dbMultiSelect(["hex"], "registered", "id = ?", [entity.originid], true);
                if (regResult.length > 0) {
                    const redisKeyHex = `banned:registered:${regResult[0].hex}`;
                    await redisCore.set(redisKeyHex, JSON.stringify("1"), { EX: BAN_KEY_TTL });
                }
                break;
            }
            case "mediafiles": {
                const mediaResult = await dbMultiSelect(["original_hash"], "mediafiles", "id = ?", [entity.originid], true);
                if (mediaResult.length > 0) {
                    const redisKeyHash = `banned:mediafiles:${mediaResult[0].original_hash}`;
                    await redisCore.set(redisKeyHash, JSON.stringify("1"), { EX: BAN_KEY_TTL });
                }
                break;
            }
            case "ips": {
                const ipResult = await dbMultiSelect(["ip"], "ips", "id = ?", [entity.originid], true);
                if (ipResult.length > 0) {
                    const redisKeyIp = `banned:ips:${ipResult[0].ip}`;
                    await redisCore.set(redisKeyIp, JSON.stringify("1"), { EX: BAN_KEY_TTL });
                }
                break;
            }
            case "events": {
                const eventResult = await dbMultiSelect(["event_id"], "events", "id = ?", [entity.originid], true);
                if (eventResult.length > 0) {
                    const redisKeyEvent = `banned:events:${eventResult[0].event_id}`;
                    await redisCore.set(redisKeyEvent, JSON.stringify("1"), { EX: BAN_KEY_TTL });
                }
                break;
            }
            default: {
                logger.warn(`loadBanEntities - Unsupported table for banned entity: ${entity.origintable}`);
                break;
            }
        }
    }

    await redisCore.set('banned:cache', '1', { EX: Number(getConfig(null, ['redis','expireTime'])) || 300 } );

};


export { banEntity, unbanEntity, isEntityBanned, getBannedFileBanner, deleteBannedObjects };