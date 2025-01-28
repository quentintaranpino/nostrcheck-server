import path from "path";
import fs from "fs";
import app from "../app.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { dbInsert, dbMultiSelect, dbUpdate } from "./database.js";
import { logger } from "./logger.js";
import { redisDel, redisGet, redisSet } from "./redis.js";

const manageEntity = async (originId: number, originTable: string, action: "ban" | "unban", reason?: string): Promise<ResultMessagev2> => {

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
    
        case "banned":
            const result = await dbMultiSelect(["originid", "origintable"], "banned", "id = ?", [originId], true) as any;
            if (!result || result.length === 0) {
                return { status: "error", message: "Record not found" };
            }
            return manageEntity(result[0].originid, result[0].origintable, action, reason);
    
        default:
            return { status: "error", message: "Invalid table name" };
    }

    const result = await dbMultiSelect(whereFields, originTable, "id = ?", [originId], true) as any;
    if (originTable == "registered" && result.hex == app.get("config.server")["pubkey"]) {
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
                    const updateResult = await dbUpdate("banned", "active", "1", ["originid", "origintable"], [record.id, originTable]);
                    if (!updateResult) {
                        return { status: "error", message: "Error setting active ban to record" };
                    }
                    continue;
                }

                const insertResult = await dbInsert("banned", ["originid", "origintable", "reason"], [record.id, originTable, reason]);
                if (insertResult == 0) {
                    return { status: "error", message: "Error inserting record ban" };
                }
            } else if (action === "unban") {
                if (resultBanTable.length == 0 || (resultBanTable.length > 0 && resultBanTable[0].active == 0)) { continue; }

                const updateResult = await dbUpdate("banned", "active", "0", ["originid", "origintable"], [record.id, originTable]);
                if (!updateResult) {
                    return { status: "error", message: "Error setting inactive ban to record" };
                }
            }
        }

        const redisKey = `banned:${originTable}:${originId}`;
        if (action === "ban") {
            await redisSet(redisKey, JSON.stringify("1"), { EX: app.get("config.redis")["expireTime"] });
        } else if (action === "unban") {
            await redisDel(redisKey);
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

    if (id === "" || table === "") return true;

    // If the cache is empty, we need to fill it with the database status
    if (await redisGet("banned:cache") === null) {
        await loadBannedEntities();
        isEntityBanned(id, table);
    }

    const redisKey = `banned:${table}:${id}`;
    const cachedStatus = await redisGet(redisKey);
    if (cachedStatus !== null) {
        logger.info("Content is banned", "|", id, "|", table);
        return true;
    }
    
    return false;
};

/**
 * Gets the banned file banner.
 * @returns Promise resolving to a `Buffer` with the banned file banner.
 * @async
**/
const getBannedFileBanner = (): Promise<Buffer> => {
    return new Promise((resolve) => {
        const bannedFilePath = path.normalize(path.resolve(app.get("config.media")["bannedFilePath"]));
        fs.readFile(bannedFilePath, (err, data) => {
            if (err) {
                logger.error(err);
                resolve(Buffer.from(""));
            } else {
                resolve(data);
            }
        });
    });
}


/**
* Loads the banned entities from the database into Redis.
**/
const loadBannedEntities = async (): Promise<void> => {
    const bannedEntities = await dbMultiSelect(["originid", "origintable"], "banned", "active = 1", [], false);
    for (const entity of bannedEntities) {
        const redisKey = `banned:${entity.origintable}:${entity.originid}`;
        await redisSet(redisKey, JSON.stringify("1"), { EX: app.get("config.redis")["expireTime"] });
    }
    await redisSet("banned:cache", JSON.stringify("1"), { EX: app.get("config.redis")["expireTime"] });
};

export { banEntity, unbanEntity, isEntityBanned, getBannedFileBanner };