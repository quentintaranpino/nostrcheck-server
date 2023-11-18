import { createClient } from "redis";

import { logger } from "../lib/logger.js";
import { RegisteredUsernameResult } from "../interfaces/register.js";
import { LightningUsernameResult } from "../interfaces/lightning.js";

//Redis configuration
const redisClient = createClient();
(async (): Promise<void> => {
	redisClient.on("error", (error: any) =>{
		logger.error(`There is a problem connecting to redis server, is redis-server package installed on your system? : ${error}`);
		process.exit(1);
});
	await redisClient.connect();
})();

async function getNostrAddressFromRedis(key: string): Promise<RegisteredUsernameResult> {
	const data = await redisClient.get(key);

	if (!data) {
		return { username: "", hex: "" };
	}


	return JSON.parse(data.toString());
}

async function getLightningAddressFromRedis(key: string): Promise<LightningUsernameResult> {
	const data = await redisClient.get(key);

	if (!data) {
		return {lightningserver: "", lightninguser: ""};
	}


	return JSON.parse(data.toString());
}

export { redisClient, getNostrAddressFromRedis, getLightningAddressFromRedis };
