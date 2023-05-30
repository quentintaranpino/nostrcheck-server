import { createClient } from "redis";

import { logger } from "../lib/logger.js";


//Redis configuration
const redisClient = createClient();
(async (): Promise<void> => {
	redisClient.on("error", (error) =>{
		logger.error(`There is a problem connecting to redis server, is redis-server package installed on your system? : ${error}`);
		process.exit(1);
});
	await redisClient.connect();
})();

export { redisClient };
