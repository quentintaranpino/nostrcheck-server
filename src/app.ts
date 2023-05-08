import cors from "cors";
import express from "express";
import { createClient } from "redis";
import { populateTables } from "./database";

import { loadApiEndpoints } from "./controllers/index.api";
import { logger } from "./logger";

// Express configuration
const app = express();
app.set("port", process.env.PORT ?? 3000);
app.set("version", process.env.npm_package_version ?? "0.0");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Enable CORS
app.use(cors());

//Redis configuration
const redisClient = createClient();
(async (): Promise<void> => {
	redisClient.on("error", (error) => logger.error(`There is a problem connecting to redis server : ${error}`));
	await redisClient.connect();
})();

//Check database tables
const dbtables = populateTables(false);
if (!dbtables) {
	console.error("Error creating database tables");
	process.exit(1);
}

//Load API endpoints
loadApiEndpoints(app);

export { redisClient };
export default app;
