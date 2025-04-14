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

    // Start server
    const { getConfig } = await import("./lib/config/core.js");
    const server = app.listen(getConfig(null, ["server", "port"]));
    app.set("server", server);

    // Initialise API modules
    const { loadAPIs } = await import("./routes/routes.js");
    await loadAPIs(app);

    // Init plugins
    const { initPlugins } = await import("./lib/plugins/core.js");
    await initPlugins(app);

    // Show server startup message
    const { serverBanner } = await import("./lib/utils.js");
    console.log(serverBanner());

}

export default startServer;