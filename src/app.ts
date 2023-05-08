import cors from "cors";
import express from "express";
import { createClient } from "redis";

import { loadApiEndpoints } from "./controllers/index.api";

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
	redisClient.on("error", (error) => console.error(`Error : ${error}`));
	await redisClient.connect();
})();

//Load API endpoints
loadApiEndpoints(app);

export { redisClient };
export default app;
