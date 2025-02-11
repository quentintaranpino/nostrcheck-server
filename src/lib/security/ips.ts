import { redisHashGetAll, redisHashIncrementBy, redisHashSet, redisScanKeys } from "../redis.js";
import { dbUpdate, dbMultiSelect, dbUpsert } from "../database.js";
import { logger } from "../logger.js";
import app from "../../app.js";
import { banEntity, isEntityBanned } from "./banned.js";
import { Request } from "express";
import { ipInfo } from "../../interfaces/security.js";
import { isModuleEnabled } from "../config.js";

const ipUpdateBatch = new Map<string, { dbid: string; firstseen: number; lastseen: number; reqcountIncrement: number }>();

/**
 * Logs a new IP address in the database and Redis.
 * @param ip - The IP address to log.
 * @returns Promise resolving to `true` if the operation was successful, otherwise `false`.
 */
const logNewIp = async      (ip: string):
                 Promise<{  dbid: string; 
                            active: string; 
                            checked: string; 
                            banned: string; 
                            firstseen: string; 
                            lastseen: string; 
                            reqcount: string; 
                            infractions: string; 
                            comments: string;}> => {

    if (!isModuleEnabled("security", app)) {
        return {dbid: "0", active: "1", checked: "1", banned: "0", firstseen: "0", lastseen: "0", reqcount: "0", infractions: "0", comments: ""};
    }
  
    if ((!ip || ip.length < 7) && app.get("config.environment") !== "development") {
        logger.error("Invalid IP address:", ip);
        return {dbid: "0", active: "0", checked: "0", banned: "1", firstseen: "0", lastseen: "0", reqcount: "0", infractions: "0", comments: ""};
    }

    const now = Date.now();
    const redisKey = `ips:${ip}`;

    const redisData = await redisHashGetAll(redisKey);

    if (Object.keys(redisData).length === 0 || redisData.dbid === undefined) {
        const ipDbData = await dbMultiSelect(["id", "active", "checked", "infractions", "comments"], "ips", "ip = ?", [ip], true);
        if (!ipDbData || ipDbData.length === 0) {
            let dbid = await dbUpsert("ips", { active: 1, checked: 0, ip, firstseen: now, lastseen: now, reqcount: 1 });
            if (dbid === 0) dbid = await dbUpsert("ips", { active: 1, checked: 0, ip, firstseen: now, lastseen: now, reqcount: 1 });
            if (dbid === 0) {
                logger.error("Error inserting new IP:", ip);
            }

            return { dbid: dbid.toString(), active: "1", checked: "0", banned: "1", firstseen: now.toString(), lastseen: now.toString(), reqcount: "1", infractions: "0", comments: "" };
        }
    
        const infractions = ipDbData[0].infractions ? ipDbData[0].infractions.toString() : "0";
        const comments = ipDbData[0].comments ? ipDbData[0].comments.toString() : "";

        await redisHashSet(redisKey, {
            dbid: ipDbData[0].id,
            active: ipDbData[0].active ? "1" : "0",
            checked: ipDbData[0].checked ? "1" : "0",
            banned: "0",
            firstseen: now,
            lastseen: now,
            reqcount: 1,
            infractions: infractions,
            comments: comments
        }, 60);
    
        return {
            dbid: ipDbData[0].id.toString(),
            active: ipDbData[0].active ? "1" : "0",
            checked: ipDbData[0].checked ? "1" : "0",
            banned: "0",
            firstseen: now.toString(),
            lastseen: now.toString(),
            reqcount: "1",
            infractions: infractions,
            comments: comments
        };
    
    } else {

        await redisHashIncrementBy(redisKey, "reqcount", 1);
        await redisHashSet(redisKey, { firstseen: redisData.lastseen, lastseen: now }, 60);

        queueIpUpdate(redisData.dbid, Number(redisData.lastseen), now, 1);

        return {dbid: redisData.dbid, active: redisData.active, checked: redisData.checked, banned: redisData.banned, firstseen: redisData.firstseen, lastseen: now.toString(), reqcount: redisData.reqcount, infractions: redisData.infractions, comments: redisData.comments};

    }   

};

const getClientIp = (req: Request): string => {

    if (!isModuleEnabled("security", app)) {
        return "";
    }

    let ip = req.headers['x-forwarded-for'];
    if (Array.isArray(ip)) {
        ip = ip[0];
    } else if (typeof ip === 'string') {
        ip = ip.split(',')[0].trim();
    } else {
        ip = req.connection.remoteAddress || "";
    }
    if (typeof ip === 'string' && ip.startsWith("::ffff:")) {
        ip = ip.substring(7);
    }
    return ip || "";
};


/**
 * Checks if an IP address is allowed to access the server. 
 * 
 * If the IP is not in the database, it will be added. If the IP is in the database, the request count will be incremented.
 * If the IP has made too many requests in a short period of time, it will be rate-limited and possibly banned.
 * 
 * @param req - The request object.
 * @param maxRequestMinute - The maximum number of requests allowed per minute. Default is 300. Optional.
 * @returns An object containing the IP address, request count, whether the IP is banned, and any comments.
 */
const isIpAllowed = async (req: Request | string, maxRequestMinute : number = app.get('config.security')["maxDefaultRequestMinute"]): Promise<ipInfo> => {

    if (!isModuleEnabled("security", app)) return {ip: "", reqcount: 0, banned: false, comments: ""};

    const clientIp = typeof req === "string" ? req : getClientIp(req);
    if (!clientIp)  return {ip: "", reqcount: 0, banned: true, comments: ""};

    const ipData = await logNewIp(clientIp);
    if (!ipData || ipData.dbid === "0") {
        logger.error("Error logging IP:", clientIp);
        return {ip: clientIp, reqcount: 0, banned: true, comments: ""};
    }
    const { dbid, reqcount, firstseen, lastseen, infractions, comments } = ipData;

    const banned = await isEntityBanned(dbid, "ips");
    if (banned) return { ip: clientIp, reqcount: Number(reqcount), banned: true, comments: "banned ip" };

    // Abuse prevention. If the IP has made too many requests in a short period of time, it will be rate-limited and possibly banned.
    const diff = Number(lastseen) - Number(firstseen);
    if ((diff < 15 && (lastseen != firstseen)) || Number(reqcount) > maxRequestMinute) {

        logger.debug(`Possible abuse detected from IP: ${clientIp} | Infraction count: ${infractions}`);

        // Update infractions and ban it for a minute
        await redisHashSet(`ips:${clientIp}`, { infractions: Number(infractions)+1 }, app.get("config.redis")["expireTime"]);
        await redisHashSet(`banned:ips:${clientIp}`, { banned: 1 }, 60);

        if (!infractions) {
            logger.error("Error getting IP infractions:", clientIp);
            return { ip: clientIp, reqcount: Number(reqcount), banned: true, comments: "" };
        }

        if (Number(infractions) > 50) {
            logger.warn(`Banning IP due to repeated abuse: ${clientIp}`);
            await banEntity(Number(dbid), "ips", `Abuse prevention`);
            return { ip: clientIp, reqcount: Number(reqcount), banned: true, comments: `rate-limited: slow down there chief (${infractions} infractions)` };
        }

        return { ip: clientIp, reqcount: Number(reqcount), banned: true, comments: `rate-limited: slow down there chief (${infractions} infractions)` };
    }

    return {ip: clientIp, reqcount: Number(reqcount), banned, comments: comments || ""};
}

// Save infractions to DB and reset Redis
setInterval(async () => {

    if (!isModuleEnabled("security", app)) return;

    try {
        const ips = await redisScanKeys("ips:*");
        if (!ips || ips.length === 0) return;

        await Promise.all(
            ips.map(async (ip) => {
                try {
                    const redisData = await redisHashGetAll(ip);
                    if (!redisData || !redisData.dbid || redisData.infractions === '0') return;

                    const dbData = await dbMultiSelect(["infractions"], "ips", "id = ?", [redisData.dbid], true);
                    if (!dbData || dbData.length === 0) return;

                    const dbInfractions = dbData[0].infractions || 0;
                    if (dbInfractions === Number(redisData.infractions)) return;

                    const newInfractions = Number(redisData.infractions) + dbInfractions;
                    const updateSuccess = await dbUpdate("ips", {"infractions" : newInfractions}, ["id"], [redisData.dbid]);

                    if (!updateSuccess) {
                        logger.error("Error updating IP infractions:", ip);
                    } else {
                        await redisHashSet(ip, { infractions: 0 }, app.get("config.redis")["expireTime"]);
                    }
                } catch (error) {
                    logger.error(`Error processing IP '${ip}': ${error}`);
                }
            })
        );
    } catch (error) {
        logger.error("Error in IP processing interval:", error);
    }
}, 60000);

// Periodically persist the accumulated IP updates (batch) to the database.
setInterval(async () => {

    if (!isModuleEnabled("security", app)) return;

    if (ipUpdateBatch.size === 0) return;
  
    for (const [dbid, update] of ipUpdateBatch.entries()) {
      try {
        const success = await dbUpdate("ips",{ firstseen: update.firstseen, lastseen: update.lastseen, reqcount: update.reqcountIncrement }, ["id"], [dbid]);
        if (success) {
          // Remove the entry from the batch if the update was successful.
          ipUpdateBatch.delete(dbid);
        } else {
          logger.error(`Error updating batch for IP with dbid: ${dbid}`);
        }
      } catch (error) {
        logger.error(`Exception updating batch for IP with dbid: ${dbid}: ${error}`);
      }
    }
  }, 10000); 

/**
 * Adds or updates an entry in the batch for the given IP.
 * @param dbid - The IP's database ID.
 * @param oldLastseen - The previous lastseen value (used here for firstseen).
 * @param now - The new lastseen value.
 * @param increment - The number to increment the request count (default is 1).
 */
const queueIpUpdate = (dbid: string, oldLastseen: number, now: number, increment: number = 1) => {

    if (!isModuleEnabled("security", app)) return;

    if (ipUpdateBatch.has(dbid)) {
        const entry = ipUpdateBatch.get(dbid)!;
        entry.reqcountIncrement += increment;
        entry.lastseen = now; 
    } else {
        ipUpdateBatch.set(dbid, { dbid, firstseen: oldLastseen, lastseen: now, reqcountIncrement: increment });
    }
};

export { getClientIp, isIpAllowed };
