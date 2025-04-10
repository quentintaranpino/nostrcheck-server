import cors from "cors";
import express from "express";
import helmet from "helmet";
import { loadConfigOptions } from "./lib/config/local.js";
import { RedisService } from "./lib/redis.js";
import { getConfig, initGlobalConfig } from "./lib/config/core.js";

const app = express();

app.set("config.server", await loadConfigOptions("server"));
app.set("config.media", await loadConfigOptions("media"));
app.set("config.logger", await loadConfigOptions("logger"));
app.set("config.redis", await loadConfigOptions("redis"));
app.set("config.storage", await loadConfigOptions("storage"));
app.set("config.payments", await loadConfigOptions("payments"));
app.set("config.register", await loadConfigOptions("register"));
app.set("config.session", await loadConfigOptions("session"));
app.set("config.security", await loadConfigOptions("security"));
app.set("config.database", await loadConfigOptions("database"));
app.set("config.environment", process.env.NODE_ENV ?? await loadConfigOptions("environment"));
app.set("config.plugins", await loadConfigOptions("plugins"));
app.set("config.relay", await loadConfigOptions("relay"));
app.set("version", process.env.npm_package_version ?? "0.0");

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
await redisCore.init(app)
app.set("redisCore", redisCore);

export default app;