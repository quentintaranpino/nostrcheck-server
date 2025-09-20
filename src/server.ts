import { prepareApp } from "./controllers/config.js";

const startServer = async () => {

    // Initialise config and folders
    await prepareApp();
    const { default: app } = await import("./app.js");

    // Global config
    const { initGlobalConfig } = await import("./lib/config/core.js");
    await initGlobalConfig();

    // Initialise Database
    const { initDatabase } = await import("./lib/database/tables.js");
    await initDatabase();

    // Tenant config
    const { loadTenants } = await import("./lib/config/tenant.js");
    await loadTenants();

    // Initialise session cookies
    const { initSession } = await import("./lib/session.js");
    await initSession(app);

    // Migration from 0.5.0.
    const { migrateDBLocalpath } = await import("./controllers/config.js");
    migrateDBLocalpath();

    // Start server
    const { getConfig } = await import("./lib/config/core.js");
    const server = app.listen(getConfig(null, ["server", "port"]));

    // Initialise API modules
    const { loadAPIs } = await import("./routes/routes.js");
    await loadAPIs(app, server);

    // Initialise plugins
    const { initPlugins } = await import("./lib/plugins/core.js");
    await initPlugins("");
    const { getTenants } = await import("./lib/config/core.js");
    const tenants = getTenants();
    for (const tenant of tenants) {
        await initPlugins(tenant.domain);
    }

    // Show server startup message
    const { serverBanner } = await import("./lib/utils.js");
    console.log(serverBanner());

}

export default startServer;