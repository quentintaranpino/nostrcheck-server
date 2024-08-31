import { createClient } from "redis";
import { logger } from "./logger.js";
import { nostrAddressResult } from "../interfaces/register.js";
import { LightningUsernameResult } from "../interfaces/lightning.js";
import app from "../app.js";

const redisHost: string = process.env.REDIS_HOST || app.get("config.redis")["host"];
const redisPort: string = process.env.REDIS_PORT || app.get("config.redis")["port"];
const redisUser: string = process.env.REDIS_USER || app.get("config.redis")["user"];
const redisPassword: string = process.env.REDIS_PASSWORD || app.get("config.redis")["password"];

const redisClient = createClient({ url: `redis://${redisUser}:${redisPassword}@${redisHost}:${redisPort}` });

(async (): Promise<void> => {
	redisClient.on("error", (error: Error) =>{
		logger.error(`There is a problem connecting to redis server, is redis-server package installed on your system? : ${error}`);
		process.exit(1);
});
	await redisClient.connect();
})();

const flushRedisCache = async (): Promise<void> => {
	return await redisClient.sendCommand(['flushall']);
}

async function getNostrAddressFromRedis(key: string): Promise<nostrAddressResult> {
	const data = await redisClient.get(key);
	if (!data) return {names: {}};
	return JSON.parse(data.toString());
}

async function getLightningAddressFromRedis(key: string): Promise<LightningUsernameResult> {
	const data = await redisClient.get(key);
	if (!data) return {lightningserver: "", lightninguser: ""};
	return JSON.parse(data.toString());
}

export { redisClient, flushRedisCache, getNostrAddressFromRedis, getLightningAddressFromRedis };
