import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "config";
import {  loadconfigModules  } from "./lib/config.js";

// Initialise Express
const app = express();
app.set("host", process.env.HOSTNAME ?? config.get('server.host'));
app.set("port", process.env.PORT ?? config.get('server.port'));
app.set("version", process.env.npm_package_version ?? "0.0");
app.set(
	"pubkey",
	process.env.PUBKEY ?? config.get('server.pubkey')
);
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