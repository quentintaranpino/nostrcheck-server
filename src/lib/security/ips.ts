
import { Request } from "express";
import { dbUpdate, dbMultiSelect, dbUpsert } from "../database.js";
import { logger } from "../logger.js";
import app from "../../app.js";
import { banEntity, isEntityBanned } from "./banned.js";
import { ipInfo } from "../../interfaces/security.js";
import { RedisService } from "../redis.js";
import { getDomainId } from "./domain.js";
import { getConfig, isModuleEnabled } from "../config/core.js";

const ipUpdateBatch = new Map<string, { dbid: string; firstseen: number; lastseen: number; reqcountIncrement: number }>();
const redisCore = app.get("redisCore") as RedisService


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

    if (!isModuleEnabled("security", "")) {
        return {dbid: "0", active: "1", checked: "1", banned: "0", firstseen: "0", lastseen: "0", reqcount: "0", infractions: "0", comments: ""};
    }
  
    if ((!ip || ip.length < 7) && getConfig("", ["environment"]) !== "development") {
        logger.error(`logNewIp - Invalid IP address: ${ip}`);
        return {dbid: "0", active: "0", checked: "0", banned: "1", firstseen: "0", lastseen: "0", reqcount: "0", infractions: "0", comments: ""};
    }

    const now = Date.now();
    const redisKey = `ips:${ip}`;
    const redisWindowKey = `ips:window:${ip}`;
    const reqcount = await redisCore.slidingWindowIncrement(redisWindowKey, now, 60000, 70);
    const oldestTimestamp = await redisCore.slidingWindowOldest(redisWindowKey);
    const firstseenValue = oldestTimestamp ? oldestTimestamp.toString() : now.toString();

    logger.debug(`logNewIp - IP: ${ip} | reqcount: ${reqcount}, oldestTimestamp: ${oldestTimestamp}, firstseen: ${firstseenValue}`);
    
    const redisData = await redisCore.hashGetAll(redisKey);

    if (Object.keys(redisData).length === 0 || redisData.dbid === undefined) {
        const ipDbData = await dbMultiSelect(["id", "active", "checked", "infractions", "comments"], "ips", "ip = ?", [ip], true);
        if (!ipDbData || ipDbData.length === 0) {
            const dbid = await dbUpsert("ips", { active: 1, checked: 0, ip, firstseen: now, lastseen: now, reqcount: reqcount }, ["ip"]);
            if (dbid === 0)   logger.error(`logNewIp - Error upserting new IP: ${ip}`);
              
            return { 
                dbid: dbid.toString(), 
                active: "1", 
                checked: "0", 
                banned: "1", 
                firstseen: now.toString(), 
                lastseen: now.toString(), 
                reqcount: reqcount.toString(), 
                infractions: "0", 
                comments: "" 
            };
        }
    
        const infractions = ipDbData[0].infractions ? ipDbData[0].infractions.toString() : "0";
        const comments = ipDbData[0].comments ? ipDbData[0].comments.toString() : "";
  
        await redisCore.hashSet(redisKey, {
            dbid: ipDbData[0].id,
            active: ipDbData[0].active ? "1" : "0",
            checked: ipDbData[0].checked ? "1" : "0",
            banned: "0",
            firstseen: firstseenValue,
            lastseen: now.toString(),
            reqcount: reqcount.toString(),
            infractions: infractions,
            comments: comments
        }, 60);
    
        return {
            dbid: ipDbData[0].id.toString(),
            active: ipDbData[0].active ? "1" : "0",
            checked: ipDbData[0].checked ? "1" : "0",
            banned: "0",
            firstseen: firstseenValue,
            lastseen: now.toString(),
            reqcount: reqcount.toString(),
            infractions: infractions,
            comments: comments
        };
    
    } else {
        await redisCore.hashSet(redisKey, { 
            firstseen: firstseenValue, 
            lastseen: now.toString(), 
            reqcount: reqcount.toString() 
        }, 60);
        queueIpUpdate(redisData.dbid, Number(redisData.lastseen), now, 1);
  
        return {
            dbid: redisData.dbid, 
            active: redisData.active, 
            checked: redisData.checked, 
            banned: redisData.banned, 
            firstseen: firstseenValue, 
            lastseen: now.toString(), 
            reqcount: reqcount.toString(), 
            infractions: redisData.infractions, 
            comments: redisData.comments
        };
    }   
};

const getClientIp = (req: Request): string => {

    if (!isModuleEnabled("security", "")) {
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
const isIpAllowed = async (req: Request, maxRequestMinute : number = app.get('config.security')["maxDefaultRequestMinute"]): Promise<ipInfo> => {

    if (!isModuleEnabled("security", "")) return {ip: "", reqcount: 0, banned: false, domainId: 1, domain: "", comments: ""};

    const clientIp = typeof req === "string" ? req : getClientIp(req);
    if (!clientIp) {
        logger.warn(`isIpAllowed - Invalid IP address: ${clientIp}`);
        return {ip: "", reqcount: 0, banned: true, domainId: 1, domain: "", comments: ""};
    }

    const host = typeof req !== "string" ? req.headers.host || req.hostname : "";
    let clientDomain = typeof req === "string" ? req : await getDomainId(host);
    if (!clientDomain) {
        logger.warn(`isIpAllowed - Domain (${host}) not found for IP: ${clientIp}`);
        clientDomain = 1; // Default domain ID for unknown domains
    }

    const ipData = await logNewIp(clientIp);
    if (!ipData || ipData.dbid === "0") {
        logger.error(`isIpAllowed - Error logging IP: ${clientIp}`);
        return {ip: clientIp, reqcount: 0, banned: true, domainId: clientDomain, domain: host,  comments: ""};
    }
    const { dbid, reqcount, firstseen, lastseen, infractions, comments } = ipData;

    const banned = await isEntityBanned(dbid, "ips");
    if (banned) return { ip: clientIp, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: "banned ip" };

    // Abuse prevention. If the IP has made too many requests in a short period of time, it will be rate-limited and possibly banned.
    const diff = Number(lastseen) - Number(firstseen);
    if (((diff < 15 && lastseen !== firstseen) && Number(reqcount) > (maxRequestMinute / 3)) || Number(reqcount) > maxRequestMinute) {

        logger.debug(`isIpAllowed - Possible abuse detected from IP: ${clientIp} | Infraction count: ${infractions}, reqcount: ${reqcount}`);

        // Update infractions and ban it for 30 seconds
        await redisCore.hashSet(`ips:${clientIp}`, { infractions: Number(infractions)+1 }, app.get("config.redis")["expireTime"]);
        await redisCore.set(`banned:ips:${dbid}`, JSON.stringify("1"), { EX: 30 });

        if (!infractions) {
            logger.info(`isIpAllowed - Banning IP due to repeated abuse: ${clientIp}`);
            return { ip: clientIp, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: `rate-limited: slow down there chief (${infractions} infractions)` };
        }

        if (Number(infractions) > 50) {
            logger.info(`isIpAllowed - Banning IP due to repeated abuse: ${clientIp}`);
            await banEntity(Number(dbid), "ips", `Abuse prevention, reqcount: ${reqcount}, infractions: ${infractions}`);
            return { ip: clientIp, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: `banned due to repeated abuse (${infractions} infractions)` };
        }

        return { ip: clientIp, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: `rate-limited: slow down there chief (${infractions} infractions)` };
    }

    return {ip: clientIp, reqcount: Number(reqcount), banned, domainId: clientDomain, domain: host, comments: comments || ""};
}

/*
* Save infractions to DB and reset Redis
*/
setInterval(async () => {

    if (!isModuleEnabled("security", "")) return;

    try {
        const ips = await redisCore.scanKeys("ips:*");
        if (!ips || ips.length === 0) return;

        await Promise.all(
            ips.map(async (ip) => {
                try {
                    const redisData = await redisCore.hashGetAll(ip);
                    if (!redisData || !redisData.dbid || redisData.infractions === '0') return;

                    const dbData = await dbMultiSelect(["infractions"], "ips", "id = ?", [redisData.dbid], true);
                    if (!dbData || dbData.length === 0) return;

                    const dbInfractions = dbData[0].infractions || 0;
                    if (dbInfractions === Number(redisData.infractions)) return;

                    const newInfractions = Number(redisData.infractions) + dbInfractions;
                    const updateSuccess = await dbUpdate("ips", {"infractions" : newInfractions}, ["id"], [redisData.dbid]);

                    if (!updateSuccess) {
                        logger.error(`ipsLib - Interval - Error processing IP '${ip}': Error updating IP infractions`);
                    } else {
                        await redisCore.hashSet(ip, { infractions: 0 }, app.get("config.redis")["expireTime"]);
                    }
                } catch (error) {
                    logger.error(`ipsLib - Interval - Error processing IP '${ip}': ${error}`);
                }
            })
        );
    } catch (error) {
        logger.error(`ipsLib - Interval - Error processing IPs: ${error}`);
    }
}, 60000);


/*
* Periodically persist the accumulated IP updates (batch) to the database.
*/
setInterval(async () => {

    if (!isModuleEnabled("security", "")) return;

    if (ipUpdateBatch.size === 0) return;

    for (const [dbid, update] of ipUpdateBatch.entries()) {
        try {
        const success = await dbUpdate("ips",{ firstseen: update.firstseen, lastseen: update.lastseen, reqcount: update.reqcountIncrement }, ["id"], [dbid]);
        if (success) {
            // Remove the entry from the batch if the update was successful.
            ipUpdateBatch.delete(dbid);
        } else {
            logger.error(`ipslib - Interval - Error updating batch for IP with dbid: ${dbid}`);
        }
        } catch (error) {
            logger.error(`ipslib - Interval - Exception updating batch for IP with dbid: ${dbid}: ${error}`);
        }
    }
}, 10000); // 10 seconds

/**
 * Adds or updates an entry in the batch for the given IP.
 * @param dbid - The IP's database ID.
 * @param oldLastseen - The previous lastseen value (used here for firstseen).
 * @param now - The new lastseen value.
 * @param increment - The number to increment the request count (default is 1).
 */
const queueIpUpdate = (dbid: string, oldLastseen: number, now: number, increment: number = 1) => {

    if (!isModuleEnabled("security", "")) return;

    if (ipUpdateBatch.has(dbid)) {
        const entry = ipUpdateBatch.get(dbid)!;
        entry.reqcountIncrement += increment;
        entry.lastseen = now; 
    } else {
        ipUpdateBatch.set(dbid, { dbid, firstseen: oldLastseen, lastseen: now, reqcountIncrement: increment });
    }
};

export { getClientIp, isIpAllowed };
