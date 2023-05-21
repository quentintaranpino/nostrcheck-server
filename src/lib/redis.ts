import { createClient } from "redis";
import { logger } from "../lib/logger";

//Redis configuration
const redisClient = createClient();
(async (): Promise<void> => {
	redisClient.on("error", (error) =>
		logger.error(`There is a problem connecting to redis server : ${error}`)
	);
	await redisClient.connect();
})();

export { redisClient };