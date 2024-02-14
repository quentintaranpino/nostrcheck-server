import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "config";
import {  loadconfigModules  } from "./lib/config.js";
import { nip19 } from "nostr-tools";

const app = express();
app.set("server.host", config.get('server.host'));
app.set("server.port", config.get('server.port'));
app.set("server.pubkey", await config.get('server.pubkey'));
app.set("server.secretKey", await config.get('server.secretKey'));
app.set("server.npub", nip19.npubEncode(app.get("server.pubkey")));

app.set("redis.host", config.get('redis.host'));
app.set("redis.port", config.get('redis.port'));
app.set("redis.user", config.get('redis.user'));
app.set("redis.password", config.get('redis.password'));

app.set("version", process.env.npm_package_version ?? "0.0");

app.set("activeModules", await loadconfigModules());
app.set('trust proxy', 1); 
app.set("view engine", "ejs")
app.set('views','./src/pages/');

app.use(express.json({ limit: '25MB' }));
app.use(express.urlencoded({ limit: '25MB', extended: true }));
app.use(express.static('./src/pages/'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

export default app;