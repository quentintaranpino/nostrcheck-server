import { redisHashGetAll, redisHashIncrementBy, redisHashSet } from "./redis.js";
import { dbInsert, dbUpdate, dbMultiSelect } from "./database.js";
import { logger } from "./logger.js";
import { getNewDate } from "./utils.js";
import app from "../app.js";
import { isEntityBanned } from "./banned.js";
import { Request } from "express";

/**
 * Logs a new IP in Redis and asynchronously in the database.
 * 
 * @param ip - The IP address to log.
 * @returns Promise resolving to `true` if the operation was successful, otherwise `false`.
 */
const logNewIp = async (ip: string): Promise<boolean> => {
  
  if ((!ip || ip.length < 7) && app.get("config.environment") !== "development") return false;

  const now = getNewDate();
  const redisKey = `ip:${ip}`;

  const redisData = await redisHashGetAll(redisKey);

  if (Object.keys(redisData).length === 0) {
      await redisHashSet(redisKey, {
          active: 1,
          checked: 0,
          firstseen: now,
          lastseen: now,
          reqcount: 1,
      });
  } else {
      await redisHashIncrementBy(redisKey, "reqcount", 1);
      await redisHashSet(redisKey, { lastseen: now });
  }

  setImmediate(async () => {
      const existingIp = await dbMultiSelect(["id", "reqcount"], "ips", "ip = ?", [ip], true);

      if (!existingIp) {
          const ipInsert = await dbInsert("ips",["active", "checked", "ip", "firstseen", "lastseen", "reqcount"],[1, 0, ip, now, now, 1]);
          if (ipInsert === 0) logger.error(`Error inserting IP in database: ${ip}`);
      } else {
          const updateLastSeen = await dbUpdate("ips", "lastseen", now, ["id"], [existingIp[0].id]);
          if (!updateLastSeen) logger.error(`Error updating IP lastseen in database: ${ip}`);

          const updateReqCount = await dbUpdate(
              "ips",
              "reqcount",
              existingIp[0].reqcount ? ++existingIp[0].reqcount : 1,
              ["id"],
              [existingIp[0].id]
          );
          if (!updateReqCount) logger.error(`Error updating IP reqcount in database: ${ip}`);
      }
  });

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


const isIpAllowed = async (req: Request): Promise<{ ip: string; reqcount: number; banned: boolean; comments: string; }> => {

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

    const ipData = await dbMultiSelect(["id", "reqcount", "comments"], "ips", "ip = ?", [clientIp], true);
    if (!ipData) {
        logger.error("Error getting IP data:", clientIp);
        return {ip: clientIp, reqcount: 0, banned: true, comments: ""};
    }

    const banned = await isEntityBanned(ipData[0].id, "ips");

    return {ip: clientIp, reqcount: ipData[0].reqcount, banned, comments: ipData[0].comments};

}

export { getClientIp, isIpAllowed };