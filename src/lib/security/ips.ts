
import { Request } from "express";
import { IncomingMessage } from "http";
import net from "net";

import { dbUpdate, dbMultiSelect, dbUpsert } from "../database/core.js";
import { logger } from "../logger.js";

import { banEntity, isEntityBanned } from "./banned.js";
import { IpInfo } from "../../interfaces/security.js";
import { getDomainId } from "./domain.js";
import { getConfig, isModuleEnabled } from "../config/core.js";
import { initRedis } from "../redis/client.js";

const ipUpdateBatch = new Map<string, { dbid: string; firstseen: number; lastseen: number; reqcountIncrement: number }>();
const redisCore = await initRedis(0, false);


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
  
    if ((!ip || ip.length < 2) && getConfig("", ["environment"]) !== "development") {
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

const firstForwarded = (val: string | string[] | undefined): string | undefined =>
    !val ? undefined : Array.isArray(val) ? val[0].trim() : val.split(",")[0].trim();
  
const stripIpv6Prefix = (ip: string): string =>
ip.startsWith("::ffff:") ? ip.slice(7) : ip === "::1" ? "127.0.0.1" : ip;
  
const normalizeIp = (raw: string): string => stripIpv6Prefix(raw);
 
/**
 * Retrieves the client IP address and host from the request object.
 * @param req - The request object or IP address as a string.
 * @returns An object containing the IP address and host.
 */
const getClientInfo = (req: Request | IncomingMessage | string ): { ip: string; host: string } => {
    
    if (!isModuleEnabled("security", "")) return { ip: "", host: "" };
  
    if (typeof req === "string") {
      const ip = normalizeIp(req);
      return net.isIP(ip) ? { ip, host: "" } : { ip: "", host: "" };
    }
  
    if ("ip" in req) {
      const r = req as Request;
      const raw =
        r.ip ||
        firstForwarded(r.headers["x-forwarded-for"]) ||
        r.connection.remoteAddress ||
        "";
      const ip = normalizeIp(raw);
      const rawHost = r.hostname || r.headers.host || "";
      const host    = rawHost.split(":")[0];     
      if (net.isIP(ip) === 0) {
        logger.warn(`getClientInfo – invalid IP from HTTP: ${raw}`);
        return { ip: "", host };
      }
      return { ip, host };
    }
  
    const r = req as IncomingMessage;
    const raw =
      firstForwarded(r.headers["x-forwarded-for"]) ||
      r.socket.remoteAddress ||
      "";
    const ip = normalizeIp(raw);
    const rawHost = r.headers.host || "";
    const host    = rawHost.split(":")[0];    
    if (net.isIP(ip) === 0) {
      logger.warn(`getClientInfo – invalid IP from WS: ${raw}`);
      return { ip: "", host };
    }
    return { ip, host };
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
const isIpAllowed = async (req: Request | IncomingMessage | string, maxRequestMinute : number = 0): Promise<IpInfo> => {

    if (!isModuleEnabled("security", "")) return {ip: "", reqcount: 0, banned: false, domainId: 1, domain: "", comments: ""};

    if (maxRequestMinute === 0) maxRequestMinute = getConfig(null, ["security", "maxDefaultRequestMinute"]) || 300;

    const { ip, host } = getClientInfo(req);

     if (!ip) {
        logger.warn(`isIpAllowed - Invalid IP address: ${ip}`);
        return {ip: "", reqcount: 0, banned: true, domainId: 1, domain: "", comments: ""};
    }

    let clientDomain = await getDomainId(host);
    if (!clientDomain) {
        logger.warn(`isIpAllowed - Domain (${host}) not found for IP: ${ip}`);
        clientDomain = 1; // Default domain ID for unknown domains
    }

    const ipData = await logNewIp(ip);
    if (!ipData || ipData.dbid === "0") {
        logger.error(`isIpAllowed - Error logging IP: ${ip}`);
        return {ip: ip, reqcount: 0, banned: true, domainId: clientDomain, domain: host,  comments: ""};
    }
    const { dbid, reqcount, firstseen, lastseen, infractions, comments, checked, active } = ipData;

    // If the IP is checked we trust it like a white-list.
    if (checked === "1") {
        return { ip: ip, reqcount: Number(reqcount), banned: false, domainId: clientDomain, domain: host, comments: comments || "" };
    }

    // If the IP is not active, we consider it banned.
    if (active === "0") {
        logger.warn(`isIpAllowed - Inactive IP: ${ip}`);
        return { ip: ip, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: "inactive ip" };
    }

    const banned = await isEntityBanned(dbid, "ips");
    if (banned) return { ip: ip, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: "banned ip" };

    // Abuse prevention. If the IP has made too many requests in a short period of time, it will be rate-limited and possibly banned.
    const diff = Number(lastseen) - Number(firstseen);
    if (((diff < 15 && lastseen !== firstseen) && Number(reqcount) > (maxRequestMinute / 3)) || Number(reqcount) > maxRequestMinute) {

        logger.debug(`isIpAllowed - Possible abuse detected from IP: ${ip} | Infraction count: ${infractions}, reqcount: ${reqcount}`);

        // Update infractions and ban it for 30 seconds
        await redisCore.hashSet(`ips:${ip}`, { infractions: Number(infractions) + 1 }, getConfig(null, ["redis", "expireTime"]));
        
        await redisCore.set(`banned:ips:${dbid}`, JSON.stringify("1"), { EX: 30 });

        if (!infractions) {
            logger.info(`isIpAllowed - Banning IP due to repeated abuse: ${ip}`);
            return { ip: ip, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: `rate-limited: slow down there chief (${infractions} infractions)` };
        }

        if (Number(infractions) > 50) {
            logger.info(`isIpAllowed - Banning IP due to repeated abuse: ${ip}`);
            await banEntity(Number(dbid), "ips", `Abuse prevention, reqcount: ${reqcount}, infractions: ${infractions}`);
            return { ip: ip, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: `banned due to repeated abuse (${infractions} infractions)` };
        }

        return { ip: ip, reqcount: Number(reqcount), banned: true, domainId: clientDomain, domain: host, comments: `rate-limited: slow down there chief (${infractions} infractions)` };
    }

    return {ip: ip, reqcount: Number(reqcount), banned, domainId: clientDomain, domain: host, comments: comments || ""};
}

/*
* Periodically save infractions from Redis to the database.
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

                    const update = await dbUpdate("ips", {"infractions" : Number(redisData.infractions)}, ["id"], [redisData.dbid]);

                    if (!update) {
                        logger.error(`ipsLib - Interval - Error processing IP '${ip}': Error updating IP infractions`);
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

export { getClientInfo, isIpAllowed };