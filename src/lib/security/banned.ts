import fs from "fs";

import { ResultMessagev2 } from "../../interfaces/server.js";
import { dbInsert, dbMultiSelect, dbUpdate } from "../database/core.js";
import { logger } from "../logger.js";
import { getConfig, isModuleEnabled } from "../config/core.js";
import { getResource } from "../frontend.js";
import { generateVideoFromImage } from "../utils.js";
import { initRedis } from "../redis/client.js";

const redisCore = await initRedis(0, false);

const manageEntity = async (originId: number, originTable: string, action: "ban" | "unban", reason?: string): Promise<ResultMessagev2> => {

    if (!isModuleEnabled("security", ""))  return { status: "error", message: "Security module is not enabled" };

    if (originId == 0 || originId == null || originTable == "" || originTable == null || (action === "ban" && (!reason || reason === ""))) {
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
            return manageEntity(result[0].originid, result[0].origintable, action, reason);
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
                    const updateResult = await dbUpdate("banned", {"active": "1"}, ["originid", "origintable"], [record.id, originTable]);
                    if (!updateResult) {
                        return { status: "error", message: "Error setting active ban to record" };
                    }
                    continue;
                }

                const insertResult = await dbInsert("banned", ["originid", "origintable", "createddate", "reason"], [record.id, originTable, Math.floor(Date.now() / 1000), reason]);
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
            await redisCore.set(redisKeyPrimary, JSON.stringify("1"));

            switch (originTable) {
                case "registered": {
                    const redisKeyHex = `banned:${originTable}:${result[0].hex}`;
                    await redisCore.set(redisKeyHex, JSON.stringify("1"));
                    break;
                }
                case "mediafiles": {
                    const redisKeyHash = `banned:${originTable}:${result[0].original_hash}`;
                    await redisCore.set(redisKeyHash, JSON.stringify("1"));
                    break;
                }
                case "ips": {
                    const redisKeyIp = `banned:${originTable}:${result[0].ip}`;
                    await redisCore.set(redisKeyIp, JSON.stringify("1"));
                    break;
                }
                case "events": {
                    const redisKeyEvent = `banned:${originTable}:${result[0].event_id}`;
                    await redisCore.set(redisKeyEvent, JSON.stringify("1"));
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

        return { status: "success", message: `Records with ${keyField} : ${result[0][keyField]} from table ${originTable} ${action}ned successfully` };
    }

    return { status: "error", message: `No records found to ${action}` };
};

/**
 * Bans an entity.
 * @param originId - The ID of the entity to ban.
 * @param originTable - The table where the entity is stored.
 * @param reason - The reason for banning the entity.
 * @returns Promise resolving to a `ResultMessagev2` object.
 * @async
 * @example
 * ```typescript
 * const banResult = await banEntity(1, "registered", "Spamming the network");
 * ```
 **/
const banEntity = async (originId: number, originTable: string, reason: string): Promise<ResultMessagev2> => {
    return manageEntity(originId, originTable, "ban", reason);
};

/**
 * Unbans an entity.
 * @param originId - The ID of the entity to unban.
 * @param originTable - The table where the entity is stored.
 * @returns Promise resolving to a `ResultMessagev2` object.
 * @async
 * @example
 * ```typescript
 * const unbanResult = await unbanEntity(1, "registered");
 * ```
 **/
const unbanEntity = async (originId: number, originTable: string): Promise<ResultMessagev2> => {
    return manageEntity(originId, originTable, "unban");
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
        await redisCore.set(redisKeyPrimary, JSON.stringify("1"));

        switch (entity.origintable) {
            case "registered": {
                const regResult = await dbMultiSelect(["hex"], "registered", "id = ?", [entity.originid], true);
                if (regResult.length > 0) {
                    const redisKeyHex = `banned:registered:${regResult[0].hex}`;
                    await redisCore.set(redisKeyHex, JSON.stringify("1"));
                }
                break;
            }
            case "mediafiles": {
                const mediaResult = await dbMultiSelect(["original_hash"], "mediafiles", "id = ?", [entity.originid], true);
                if (mediaResult.length > 0) {
                    const redisKeyHash = `banned:mediafiles:${mediaResult[0].original_hash}`;
                    await redisCore.set(redisKeyHash, JSON.stringify("1"));
                }
                break;
            }
            case "ips": {
                const ipResult = await dbMultiSelect(["ip"], "ips", "id = ?", [entity.originid], true);
                if (ipResult.length > 0) {
                    const redisKeyIp = `banned:ips:${ipResult[0].ip}`;
                    await redisCore.set(redisKeyIp, JSON.stringify("1"));
                }
                break;
            }
            case "events": {
                const eventResult = await dbMultiSelect(["event_id"], "events", "id = ?", [entity.originid], true);
                if (eventResult.length > 0) {
                    const redisKeyEvent = `banned:events:${eventResult[0].event_id}`;
                    await redisCore.set(redisKeyEvent, JSON.stringify("1"));
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


export { banEntity, unbanEntity, isEntityBanned, getBannedFileBanner };