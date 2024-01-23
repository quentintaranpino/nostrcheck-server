import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "config";
import initSession from "./lib/session.js";
import { prepareAPPConfig, prepareAppFolders, loadconfigEndpoints  } from "./lib/config.js";

import { LoadAPI } from "./routes/routes.js";

async function prepareAPP() {
    await prepareAPPConfig();
	await prepareAppFolders();
}

await prepareAPP();

const app = express();

app.set("host", process.env.HOSTNAME ?? config.get('server.host'));
app.set("port", process.env.PORT ?? config.get('server.port'));
app.set("version", process.env.npm_package_version ?? "0.0");
app.set(
	"pubkey",
	process.env.PUBKEY ?? config.get('server.pubkey')
);
app.set('trust proxy',true); 
app.set("view engine", "ejs")
app.set('views','./src/pages/');
app.set("activeEndpoints", await loadconfigEndpoints());
app.use(express.json({ limit: '25MB' }));
app.use(express.urlencoded({ limit: '25MB', extended: true }));
app.use(express.static('./src/pages/'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Initialise session cookies
await initSession(app);

const loadAPIs = async () => {
	await LoadAPI(app, "v1");
	await LoadAPI(app, "v2");
}
loadAPIs();

export default app;