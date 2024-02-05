import config from "config";
import app from "./app.js";
import { prepareAPP } from "./lib/config.js";
import { initDatabase, showDBStats } from "./lib/database.js";
import { loadConsoleBanner, showActiveModules } from "./lib/server.js";
import { initSession } from "./lib/session.js";
import { loadAPIs } from "./routes/routes.js";
import { SeedMediafilesMagnets } from "./lib/torrent.js";


// Initialise config and folders
await prepareAPP();

// Initialise Database
await initDatabase();

// Initialise session cookies
await initSession(app);

// Initialise API modules
await loadAPIs(app);

//Start seeding magnets
if (config.get("torrent.enableTorrentSeeding")) {await SeedMediafilesMagnets();}

// Start Express server.
const server = app.listen(app.get("port"), async () => {
	
	// Show server startup message
	loadConsoleBanner(app);

	// Show server startup stactics
	console.log(await showDBStats());

	// Show server active modules
	console.log(showActiveModules(app));
	
});

export default server;