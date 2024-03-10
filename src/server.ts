import app from "./app.js";
import { loadconfigActiveModules} from "./lib/config.js";
import { prepareApp } from "./controllers/config.js";
import { initDatabase, showDBStats } from "./lib/database.js";
import { loadConsoleBanner } from "./lib/server.js";
import { initSession } from "./lib/session.js";
import { loadAPIs } from "./routes/routes.js";
import { SeedMediafilesMagnets } from "./lib/torrent.js";
import config from "config";

// Start Express server.
const server = app.listen(app.get("config.server")["port"], async () => {

	// Initialise config and folders
	await prepareApp();

	// Initialise Database
	await initDatabase();

	// Initialise session cookies
	await initSession(app);

	// Initialise API modules
	await loadAPIs(app);

	//Start seeding magnets
	if (config.get("torrent.enableTorrentSeeding")) {await SeedMediafilesMagnets();}

	// Show server startup message
	loadConsoleBanner(app);

	// Show server startup stactics
	console.log(await showDBStats());

	// Show server active modules
	console.log("Active modules: ", loadconfigActiveModules(app).map((module) => module[0]).join(", "));
	
});

export default server;