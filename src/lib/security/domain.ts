import { dbMultiSelect } from "../database/core.js";
import { logger } from "../logger.js";
import { getConfig } from "../config/core.js";
import { initRedis } from "../redis/client.js";

const redisCore = await initRedis(0, false);

const loadAllDomains = async (): Promise<void> => {
  try {
    const domains = await dbMultiSelect(["id", "domain"], "domains", "active = 1", [], false);
    if (!domains || domains.length === 0) {
      logger.warn("loadAllDomains - No active domains found in DB");
      return;
    }

    for (const row of domains) {
      const d = String(row.domain).trim().toLowerCase();
      if (!d) continue;

      await redisCore.set(`domains:${d}`, String(row.id));

      const parts = d.split(".");
      if (parts.length >= 2) {
        const apex = parts.slice(-2).join(".");
        await redisCore.set(`domains:${apex}`, String(row.id));
      }
    }

    await redisCore.set("domains:cache", "1", { EX: getConfig(null, ["redis", "expireTime"]) });
    logger.debug(`loadAllDomains - Loaded ${domains.length} domains into cache`);
  } catch (error) {
    logger.error("loadAllDomains - Error loading domains into Redis", error);
  }
};

const getDomainId = async (domain: string): Promise<number | null> => {
  if (!domain) return null;

  const host = domain.split(":")[0].replace(/\.$/, "").toLowerCase();

  if (await redisCore.get("domains:cache") === null) {
    await loadAllDomains();
  }

  const isLocal = /^[\d.]+$/.test(host) || host === "localhost";
  if (isLocal) {
    const id = await redisCore.get(`domains:${host}`);
    return id ? Number(id) : null;
  }

  const parts = host.split(".");
  const candidates: string[] = [];
  for (let i = 0; i <= Math.max(0, parts.length - 2); i++) {
    const cand = parts.slice(i).join(".");
    if (cand.split(".").length >= 2) candidates.push(cand);
  }

  for (const cand of candidates) {
    const cachedId = await redisCore.get(`domains:${cand}`);
    if (cachedId) return Number(cachedId);
  }

  return null;
  
};
  
export { getDomainId };