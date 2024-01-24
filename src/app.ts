import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "config";
import initSession from "./lib/session.js";
import { prepareAPP, loadconfigEndpoints  } from "./lib/config.js";

import { loadAPIs } from "./routes/routes.js";
import { initDatabase } from "./lib/database.js";
import { SeedMediafilesMagnets } from "./lib/torrent.js";

// Initialise config and folders
await prepareAPP();

// Initialise Database
await initDatabase();

// Initialise Express
const app = express();
app.set("host", process.env.HOSTNAME ?? config.get('server.host'));
app.set("port", process.env.PORT ?? config.get('server.port'));
app.set("version", process.env.npm_package_version ?? "0.0");
app.set(
	"pubkey",
	process.env.PUBKEY ?? config.get('server.pubkey')
);
app.set("activeEndpoints", await loadconfigEndpoints());
app.set('trust proxy',true); 
app.set("view engine", "ejs")
app.set('views','./src/pages/');

app.use(express.json({ limit: '25MB' }));
app.use(express.urlencoded({ limit: '25MB', extended: true }));
app.use(express.static('./src/pages/'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Initialise session cookies
await initSession(app);

// Initialise API endpoints
await loadAPIs(app);

//Start seeding magnets
if (config.get("server.enableTorrentSeeding")) {SeedMediafilesMagnets();}

export default app;