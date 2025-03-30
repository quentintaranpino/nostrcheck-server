import { dbMultiSelect } from "../database.js";
import { logger } from "../logger.js";
import app from "../../app.js";
import { RedisService } from "../redis.js";

const redisCore = app.get("redisCore") as RedisService;

const loadAllDomains = async (): Promise<void> => {
  try {
    const domains = await dbMultiSelect(["id", "domain"], "domains", "active = 1", [], false);
    if (!domains || domains.length === 0) {
      logger.warn("loadAllDomains - No active domains found in DB");
      return;
    }
    for (const domain of domains) {
        await redisCore.set(`domains:${domain.domain}`, domain.id.toString());
    }
    await redisCore.set("domains:cache", "1", { EX: app.get("config.redis")["expireTime"] });
    logger.debug(`loadAllDomains - Loaded ${domains.length} domains into cache`);
  } catch (error) {
    logger.error("loadAllDomains - Error loading domains into Redis", error);
  }
};

const getDomainId = async (domain: string): Promise<string | null> => {
  if (!domain) return null;

  if (await redisCore.get("domains:cache") === null) {
    await loadAllDomains();
    return await getDomainId(domain);
  }

  const cachedId = await redisCore.get(`domains:${domain.split(':')[0]}`);
  return cachedId ? cachedId : null;
  
};
  
export { getDomainId };