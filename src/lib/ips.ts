import { redisHashGetAll, redisHashIncrementBy, redisHashSet } from "./redis.js";
import { dbInsert, dbUpdate, dbMultiSelect } from "./database.js";
import { logger } from "./logger.js";
import { getNewDate } from "./utils.js";
import app from "../app.js";

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

export { logNewIp };