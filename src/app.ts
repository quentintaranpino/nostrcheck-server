import cors from "cors";
import express from "express";
import helmet from "helmet";
import { loadConfigOptions } from "./lib/config/local.js";
import { RedisService } from "./lib/redis.js";
import { getConfig, initGlobalConfig } from "./lib/config/core.js";

const app = express();

await initGlobalConfig();

app.set('trust proxy', 1); 
app.set("view engine", "ejs")
app.set('views','./src/pages/'); 

app.use(express.static('./src/pages/'));
app.use('/static/js/modules/nostr-tools/', express.static('./node_modules/nostr-tools'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: "*",
    methods: "GET,PUT,POST,DELETE,OPTIONS",
    allowedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning, *",
    exposedHeaders: "Authorization,Content-Type,X-Cashu,X-Lightning, WWW-Authenticate, X-Reason, *",
    maxAge: 86400,
  }));

const redisCore = new RedisService({
  host: process.env.REDIS_HOST || getConfig(null, ["redis", "host"]),
  port: process.env.REDIS_PORT || getConfig(null, ["redis", "port"]),
  user: process.env.REDIS_USER || getConfig(null, ["redis", "user"]),
  password: process.env.REDIS_PASSWORD || getConfig(null, ["redis", "password"]),
});
const result = await redisCore.init()
if (!result) {
  console.error("Redis server not available. Cannot start the server, please check your configuration.");
  process.exit(1);
}
app.set("redisCore", redisCore);

export default app;