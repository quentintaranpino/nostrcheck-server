// server.ts
import { loadconfigActiveModules} from "./lib/config.js";
import { migrateDBLocalpath, prepareApp } from "./controllers/config.js";
import { initDatabase, showDBStats } from "./lib/database.js";
import { loadConsoleBanner } from "./lib/server.js";
import { initSession } from "./lib/session.js";
import { loadAPIs } from "./routes/routes.js";
import { SeedMediafilesMagnets } from "./lib/torrent.js";
import config from "config";

const startServer = async () => {
    // Initialise config and folders
    await prepareApp();
    const { default: app } = await import("./app.js");

    // Initialise Database
    await initDatabase();

    // Migration from 0.5.0.
    migrateDBLocalpath();

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
    
    // Start Express server.
    app.listen(app.get("config.server")["port"]);

}

export default startServer;