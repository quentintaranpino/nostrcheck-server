import { createClient } from "redis";
import { logger } from "./logger.js";
import app from "../app.js";

const redisHost: string = process.env.REDIS_HOST || app.get("config.redis")["host"];
const redisPort: string = process.env.REDIS_PORT || app.get("config.redis")["port"];
const redisUser: string = process.env.REDIS_USER || app.get("config.redis")["user"];
const redisPassword: string = process.env.REDIS_PASSWORD || app.get("config.redis")["password"];

const redisClient = createClient({ 
    url: `redis://${redisUser}:${redisPassword}@${redisHost}:${redisPort}`, 
    database: 0 
});
const redisPluginsClient = createClient({ 
    url: `redis://${redisUser}:${redisPassword}@${redisHost}:${redisPort}`, 
    database: 1 
});

const instancePrefix = Math.random().toString(36).substring(2, 10);
const withPrefix = (key: string): string => `${instancePrefix}:${key}`;

(async (): Promise<void> => {
    redisClient.on("error", (error: Error) => {
        logger.error(`initRedis - There is a problem connecting to redis server : ${error}`);
        process.exit(1);
    });
    await redisClient.connect();
    await redisPluginsClient.connect();
})();

const redisFlushAll = async (): Promise<boolean> => {
    try {
        await redisClient.sendCommand(['flushall']);
        return true;
    } catch (error) {
        logger.error(`redisFlushAll - Redis FLUSHALL error: ${error}`);
        return false;
    }
};

/**
 * Wrapper for Redis `get` method with error handling.
 */
const redisGet = async (key: string): Promise<string | null> => {
    try {
        const value = await redisClient.get(withPrefix(key));
        return value;
    } catch (error) {
        logger.error(`redisGet - Redis GET error for key '${withPrefix(key)}': ${error}`);
        return null;
    }
};

/**
 * Wrapper for Redis `get` method with JSON parsing and error handling.
 */
const redisGetJSON = async <T>(key: string): Promise<T | null> => {
    try {
        const data = await redisGet(key);
        if (!data) return null;
        return JSON.parse(data) as T;
    } catch (error) {
        logger.error(`redisGetJSON - Error parsing JSON from Redis for key '${withPrefix(key)}': ${error}`);
        return null;
    }
};

/**
 * Wrapper for Redis `set` method with error handling.
 */
const redisSet = async (key: string, value: string, options: { EX?: number } = {}): Promise<boolean> => {
    try {
        await redisClient.set(withPrefix(key), value, options);
        return true;
    } catch (error) {
        logger.error(`redisSet - Redis SET error for key '${withPrefix(key)}': ${error}`);
        return false;
    }
};

/**
 * Wrapper for Redis `del` method with error handling.
 */
const redisDel = async (key: string): Promise<boolean> => {
    try {
        const result = await redisClient.del(withPrefix(key));
        return result > 0;
    } catch (error) {
        logger.error(`redisDel - Redis DEL error for key '${withPrefix(key)}': ${error}`);
        return false;
    }
};

/**
 * Wrapper for Redis `hGetAll` method with error handling.
 */
const redisHashGetAll = async (key: string): Promise<Record<string, string>> => {
    try {
        const data = await redisClient.hGetAll(withPrefix(key));
        return data;
    } catch (error) {
        logger.error(`redisHashGetAll - Error HGETALL for key '${withPrefix(key)}': ${error}`);
        return {};
    }
};

const redisHashSet = async (key: string, fields: Record<string, string | number>, timeWindow: number = 0): Promise<boolean> => {
    try {
        await redisClient.hSet(withPrefix(key), fields);
        if (timeWindow > 0) {
            await redisClient.expire(withPrefix(key), timeWindow);
        }
        return true;
    } catch (error) {
        logger.error(`redisHashSet - Error HSET for key '${withPrefix(key)}': ${error}`);
        return false;
    }
};

const redisHashIncrementBy = async (key: string, field: string, increment: number): Promise<number | null> => {
    try {
        const newValue = await redisClient.hIncrBy(withPrefix(key), field, increment);
        return newValue;
    } catch (error) {
        logger.error(`redisHashIncrementBy - Error HINCRBY for key '${withPrefix(key)}': ${error}`);
        return null;
    }
};

/**
 * Wrapper for Redis `SCAN` command to find keys by pattern.
 * @param {string} pattern - The pattern to match keys.
 * @returns {Promise<string[]>} - An array of keys matching the pattern.
 */
const redisScanKeys = async (pattern: string): Promise<string[]> => {
    try {
        let cursor = 0;
        const keys: string[] = [];
        // Si buscas con un patrón, también antepone el prefijo
        const fullPattern = `${instancePrefix}:${pattern}`;

        do {
            const result = await redisClient.scan(cursor, { MATCH: fullPattern, COUNT: 100 });
            cursor = result.cursor;
            keys.push(...result.keys);
        } while (cursor !== 0);

        return keys;
    } catch (error) {
        logger.error(`redisScanKeys - Error scanning keys with pattern '${pattern}': ${error}`);
        return [];
    }
};

/**
 * Increments the sliding window counter by adding the current timestamp,
 * removes old entries (those older than the window duration), and returns the count.
 * 
 * @param key - The key of the sorted set (for example, "ips:window:<ip>").
 * @param now - The current timestamp in milliseconds.
 * @param windowMs - The duration of the window in milliseconds.
 * @param expireSeconds - The expiration time of the key in seconds.
 * @returns {Promise<number>} - The number of entries in the window.
 */
const redisSlidingWindowIncrement = async (key: string, now: number, windowMs: number, expireSeconds: number): Promise<number> => {
    try {
        const prefixedKey = withPrefix(key);
        await redisClient.zRemRangeByScore(prefixedKey, 0, now - windowMs);
        await redisClient.zAdd(prefixedKey, { score: now, value: now.toString() });
        const count = await redisClient.zCard(prefixedKey);
        await redisClient.expire(prefixedKey, expireSeconds);
        return count;
    } catch (error) {
        logger.error(`redisSlidingWindowIncrement - Error in sliding window increment for key '${withPrefix(key)}': ${error}`);
        return 0;
    }
};

/**
 * Retrieves the oldest timestamp (minimum score) from the sliding window.
 * 
 * @param key - The key of the sorted set.
 * @returns {Promise<number>} - The oldest timestamp or 0 if there are no entries.
 */
const redisSlidingWindowOldest = async (key: string): Promise<number> => {
    try {
        const prefixedKey = withPrefix(key);
        const res = await redisClient.zRange(prefixedKey, 0, 0);
        if (res.length > 0)  return Number(res[0]);
        return 0;
    } catch (error) {
        logger.error(`redisSlidingWindowOldest - Error getting oldest timestamp for sliding window key '${withPrefix(key)}': ${error}`);
        return 0;
    }
};

// Flush all redis data every time the server starts
await redisFlushAll();

export {
    redisPluginsClient,
    redisFlushAll,
    redisGet,
    redisGetJSON,
    redisSet,
    redisDel,
    redisHashGetAll,
    redisHashSet,
    redisHashIncrementBy,
    redisScanKeys,
    withPrefix,
    redisSlidingWindowIncrement,
    redisSlidingWindowOldest
};
