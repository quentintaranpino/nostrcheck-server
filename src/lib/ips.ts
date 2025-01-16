import { redisDel, redisHashGetAll, redisHashIncrementBy, redisHashSet } from "./redis.js";
import { dbInsert, dbUpdate, dbMultiSelect } from "./database.js";
import { logger } from "./logger.js";
import { getNewDate } from "./utils.js";
import app from "../app.js";
import { banEntity, isEntityBanned } from "./banned.js";
import { Request } from "express";

const abuseHits: Record<string, number> = {};

/**
 * Logs a new IP address in the database and Redis.
 * @param ip - The IP address to log.
 * @returns Promise resolving to `true` if the operation was successful, otherwise `false`.
 */
const logNewIp = async (ip: string): Promise<boolean> => {
  
  if ((!ip || ip.length < 7) && app.get("config.environment") !== "development") return false;

  const now = getNewDate();
  const redisKey = `ips:${ip}`;

  const redisData = await redisHashGetAll(redisKey);

  if (Object.keys(redisData).length === 0 || redisData.dbid === undefined) {

        let dbid = (await dbMultiSelect(["id"], "ips", "ip = ?", [ip], true))[0]?.id || 0;
        if (!dbid || dbid === 0) {
            dbid = await dbInsert("ips",["active", "checked", "ip", "firstseen", "lastseen", "reqcount"],[1, 0, ip, now, now, 1]);
            if (dbid === 0) logger.error(`Error inserting IP in database: ${ip}`);
            return false;
        }

        await redisHashSet(redisKey, {dbid: dbid, active: 1, checked: 0, banned: 0, firstseen: now, lastseen: now, reqcount: 1, comments: ""});

  } else {

        await redisHashIncrementBy(redisKey, "reqcount", 1);
        await redisHashSet(redisKey, { lastseen: now });

        setImmediate(async () => {

            const { dbid, reqcount } = redisData;

            const updateLastSeen = await dbUpdate("ips", "lastseen", now, ["id"], [dbid]);
            if (!updateLastSeen)
                {
                    logger.error(`Error updating IP lastseen in database: ${ip}`);
                    await redisDel(redisKey);
                } 

            const updateReqCount = await dbUpdate("ips", "reqcount", reqcount ? reqcount + 1 : 1, ["id"], [dbid]);
            if (!updateReqCount){
                logger.error(`Error updating IP reqcount in database: ${ip}`);
                await redisDel(redisKey);
            } 

        });
  }

  return true;

};

const getClientIp = (req: Request): string => {
    let ip = req.headers['x-forwarded-for'];
    if (Array.isArray(ip)) {
        ip = ip[0];
    } else {
        ip = ip || req.connection.remoteAddress;
    }
    if (typeof ip === 'string' && ip.startsWith("::ffff:")) {
        ip = ip.substring(7);
    }
    return ip || "";
};


const isIpAllowed = async (req: Request, timeDiff: number = 100, bypassInfraction : boolean = false): Promise<{ ip: string; reqcount: number; banned: boolean; comments: string; }> => {

    const clientIp = getClientIp(req);
    if (!clientIp) {
        logger.error("Error getting client IP");
        return {ip: "", reqcount: 0, banned: true, comments: ""};
    }
    const logIp = await logNewIp(clientIp);
    if (!logIp) {
        logger.error("Error logging IP:", clientIp);
        return {ip: clientIp, reqcount: 0, banned: true, comments: ""};
    }

    const ipData = await redisHashGetAll(`ips:${clientIp}`);

    if (Object.keys(ipData).length === 0) {
        logger.error("Error getting IP data from Redis:", clientIp);
        return {ip: clientIp, reqcount: 0, banned: true, comments: ""};
    }

    const { dbid, reqcount, lastseen, comments } = ipData;

    if (!dbid || !reqcount || !lastseen) {
        logger.error("Error getting IP data:", clientIp);
        return {ip: clientIp, reqcount: 0, banned: true, comments: ""};
    }

    const banned = await isEntityBanned(dbid, "ips");
    if (banned) {
        return { ip: clientIp, reqcount: Number(reqcount), banned: true, comments: "banned ip" };
    }

    // Abuse prevention
    const lastSeen = new Date(lastseen);
    const diff = new Date().getTime() - lastSeen.getTime();
    if (diff < timeDiff && !bypassInfraction) {
        if (!abuseHits[clientIp]) abuseHits[clientIp] = 0;
        abuseHits[clientIp]++;
        logger.warn("Abuse prevention: Too many requests in a short time:", clientIp, "Abuse infractions:", abuseHits[clientIp]);

        setImmediate(async () => {
            const updateInfractions = await dbUpdate("ips", "infractions", abuseHits[clientIp], ["id"], [dbid]);
            if (!updateInfractions) {
                logger.error("Error updating IP infractions:", clientIp);
                return { ip: clientIp, reqcount: Number(reqcount), banned: true, comments: "Abuse prevention" };
            }
        });

        if (abuseHits[clientIp] > 5) {
            logger.warn("Banning IP due to repeated abuse:", clientIp);
            await banEntity(Number(dbid), "ips", "Abuse prevention");
            delete abuseHits[clientIp]; 
            return { ip: clientIp, reqcount: Number(reqcount), banned: true, comments: "Abuse prevention" };
        }

        await new Promise((resolve) => setTimeout(resolve, abuseHits[clientIp] * abuseHits[clientIp] * 1000));
    }

    return {ip: clientIp, reqcount: Number(reqcount), banned, comments: comments || ""};
}

export { getClientIp, isIpAllowed };