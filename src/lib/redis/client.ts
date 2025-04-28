import { RedisService } from "./core.js";
import { getConfig } from "../config/core.js";

interface Clients {
  [db: number]: RedisService;
}

const clients: Clients = {};

/**
 * * Creates a Redis configuration object based on environment variables or default values.
 * * @param {number} defaultDB - The default database number (0, 1, or 2).
 * * @returns {RedisConfig} - The Redis configuration object.
 * */
function makeConfig(defaultDB: 0 | 1 | 2) {
  return {
    host: process.env.REDIS_HOST  || getConfig(null, ["redis","host"]),
    port: Number(process.env.REDIS_PORT)  || getConfig(null, ["redis","port"]),
    user: process.env.REDIS_USER  || getConfig(null, ["redis","user"]),
    password: process.env.REDIS_PASSWORD  || getConfig(null, ["redis","password"]),
    defaultDB
  };
}

/**
 * * Retrieves a Redis client instance for the specified database.
 * * @param {number} db - The database number (0, 1, or 2).
 * * @returns {RedisService} - The Redis client instance.
 * */
function getRedisClient(db: 0|1|2 = 0): RedisService {
  if (!clients[db]) {
    clients[db] = new RedisService(makeConfig(db));
  }
  return clients[db];
}

/**
 * * Initializes the Redis client and connects to the Redis server.
 * * @param {number} db - The database number (0, 1, or 2).
 * * @param {boolean} isolated - Whether to use an isolated instance.
 * * @returns {Promise<RedisService>} - The initialized Redis client instance.
 * */
export async function initRedis(db : 0|1|2 = 0, isolated: boolean = false): Promise<RedisService> {

    const client = getRedisClient(db);
    const ok = await client.init(isolated);
    if (!ok) {
        console.error("Redis server not available. Cannot start the server, please check your configuration.");
        process.exit(1);
    }
    return client;
}