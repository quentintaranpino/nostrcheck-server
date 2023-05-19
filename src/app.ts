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
app.use(express.json({limit: '25mb'}));
app.use(express.urlencoded({limit: '25mb', extended: true}));

// Public pubkey
app.set("pubkey", process.env.PUBKEY ?? "134743ca8ad0203b3657c20a6869e64f160ce48ae6388dc1f5ca67f346019ee7");

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
	logger.error("Error creating database tables");
	process.exit(1);
}

//Load API endpoints
loadApiEndpoints(app);

export const devmode = app.get("env") === "development";

export { redisClient };
export default app;
