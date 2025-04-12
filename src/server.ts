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

    // Show server startup stactics
    const { showDBStats } = await import("./lib/database.js");
    console.log(await showDBStats());

    // Show server active modules
    const { getActiveModules } = await import("./lib/config/core.js");
    const { configStore } = await import("./lib/config/core.js");
    const domainList = configStore?.domainMap?.domainToId ? Object.keys(configStore.domainMap.domainToId) : [];
    console.log("Global active modules: ", getActiveModules().map(module => module.name).join(", "));
    if (configStore?.global.multiTenancy) {
        for (const domain of domainList) {
            const domainModules = await getActiveModules(domain);
            console.log(`Active modules for domain ${domain}: `, domainModules.map(module => module.name).join(", "));
        }
    }
}

export default startServer;