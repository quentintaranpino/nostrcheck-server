// server.ts
import { prepareApp } from "./controllers/config.js";

const startServer = async () => {
    // Initialise config and folders
    await prepareApp();
    const { default: app } = await import("./app.js");

    // Initialise session cookies
    const { initSession } = await import("./lib/session.js");
    await initSession(app);

    // Initialise Database
    const { initDatabase } = await import("./lib/database.js");
    await initDatabase();

    // Migration from 0.5.0.
    const { migrateDBLocalpath } = await import("./controllers/config.js");
    migrateDBLocalpath();

    // Initialise API modules
    const { loadAPIs } = await import("./routes/routes.js");
    await loadAPIs(app);

    // Init plugins
    const { initPlugins } = await import("./lib/plugins/core.js");
    await initPlugins(app);

    //Start seeding magnets
    const {default: config} = await import( "config");
    if (config.get("torrent.enableTorrentSeeding")) {
        const { SeedMediafilesMagnets } = await import("./lib/torrent.js");
        await SeedMediafilesMagnets();
    }

    // Show server startup message
    const { serverBanner } = await import("./lib/server.js");
    console.log(serverBanner(app));

    // Show server startup stactics
    const { showDBStats } = await import("./lib/database.js");
    console.log(await showDBStats());

    // Show server active modules
    const { loadconfigActiveModules } = await import("./lib/config.js");
    console.log("Active modules: ", loadconfigActiveModules(app).map((module) => module[0]).join(", "));
    
    // Start Express server.
    app.listen(app.get("config.server")["port"]);

}

export default startServer;