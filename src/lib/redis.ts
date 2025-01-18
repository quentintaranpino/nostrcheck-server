import { createClient } from "redis";
import { logger } from "./logger.js";
import app from "../app.js";

const redisHost: string = process.env.REDIS_HOST || app.get("config.redis")["host"];
const redisPort: string = process.env.REDIS_PORT || app.get("config.redis")["port"];
const redisUser: string = process.env.REDIS_USER || app.get("config.redis")["user"];
const redisPassword: string = process.env.REDIS_PASSWORD || app.get("config.redis")["password"];

const redisClient = createClient({ url: `redis://${redisUser}:${redisPassword}@${redisHost}:${redisPort}`, database: 0 });
const redisPluginsClient = createClient({ url: `redis://${redisUser}:${redisPassword}@${redisHost}:${redisPort}`, database: 1 });

(async (): Promise<void> => {
	redisClient.on("error", (error: Error) =>{
		logger.error(`There is a problem connecting to redis server, is redis-server package installed on your system? : ${error}`);
		process.exit(1);
});
	await redisClient.connect();
	await redisPluginsClient.connect();
})();

const redisFlushAll = async (): Promise<boolean> => {
	try{
		await redisClient.sendCommand(['flushall']);
		return true
	} catch (error) {
		logger.error(`Redis FLUSHALL error: ${error}`);
		return false;
	}
	
}

/**
 * Wrapper for Redis `get` method with error handling.
 */
const redisGet = async (key: string): Promise<string | null> => {
    try {
        const value = await redisClient.get(key);
        return value;
    } catch (error) {
        logger.error(`Redis GET error for key '${key}': ${error}`);
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
        logger.error(`Error parsing JSON from Redis for key '${key}': ${error}`);
        return null;
    }
};

/**
 * Wrapper for Redis `set` method with error handling.
 */
const redisSet = async (key: string, value: string, options: { EX?: number } = {}): Promise<boolean> => {
    try {
        await redisClient.set(key, value, options);
        return true;
    } catch (error) {
        logger.error(`Redis SET error for key '${key}': ${error}`);
        return false;
    }
};

/**
 * Wrapper for Redis `del` method with error handling.
 */
const redisDel = async (key: string): Promise<boolean> => {
    try {
        const result = await redisClient.del(key);
        if (result > 0) {
            return true;
        } else {
            return false; 
        }
    } catch (error) {
        logger.error(`Redis DEL error for key '${key}': ${error}`);
        return false;
    }
};

/**
 * Wrapper for Redis `hGetAll` method with error handling.
 */
const redisHashGetAll = async (key: string): Promise<Record<string, string>> => {
    try {
        const data = await redisClient.hGetAll(key);
        return data;
    } catch (error) {
        logger.error(`Error HGETALL for key '${key}': ${error}`);
        return {}; 
    }
};

const redisHashSet = async (key: string, fields: Record<string, string | number>, timeWindow : number = 0): Promise<boolean> => {
    try {
        await redisClient.hSet(key, fields);
        if (timeWindow > 0) {
            await redisClient.expire(key, timeWindow);
        }
        return true;
    } catch (error) {
        logger.error(`Error HSET for key '${key}': ${error}`);
        return false;
    }
};

const redisHashIncrementBy = async (key: string, field: string, increment: number): Promise<number | null> => {
    try {
        const newValue = await redisClient.hIncrBy(key, field, increment); 
        return newValue;
    } catch (error) {
        logger.error(`Error HINCRBY for key '${key}': ${error}`);
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

        do {
            const result = await redisClient.scan(cursor, {
                MATCH: pattern,
                COUNT: 100,
            });
            cursor = result.cursor;
            keys.push(...result.keys);
        } while (cursor !== 0);

        return keys;
    } catch (error) {
        logger.error(`Error scanning keys with pattern '${pattern}': ${error}`);
        return [];
    }
};

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
        redisScanKeys };
