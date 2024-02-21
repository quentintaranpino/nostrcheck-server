import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "config";
import { loadConfigOptions } from "./lib/config.js";

const app = express();

app.set("config.server", await loadConfigOptions("server"));
app.set("config.media", await loadConfigOptions("media"));
app.set("config.logger", await loadConfigOptions("logger"));

app.set("redis.host", config.get('redis.host'));
app.set("redis.port", config.get('redis.port'));
app.set("redis.user", config.get('redis.user'));
app.set("redis.password", config.get('redis.password'));

app.set("version", process.env.npm_package_version ?? "0.0");

app.set('trust proxy', 1); 
app.set("view engine", "ejs")
app.set('views','./src/pages/');

app.use(express.json({ limit: '25MB' }));
app.use(express.urlencoded({ limit: '25MB', extended: true }));
app.use(express.static('./src/pages/'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

export default app;