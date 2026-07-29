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

    // Audit notification sweeper. After the database is up, so the first pass
    // can requeue whatever the previous run left pending.
    const { initAudit } = await import("./lib/audit/core.js");
    await initAudit();

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

    // Loud warning when running outside production: NIP-98 / BUD-11 relax
    // their host/created_at/t-tag checks in development mode, so leaving the
    // environment misset on a public server effectively neutralises auth.
    const env = getConfig(null, ["environment"]);
    if (env !== "production") {
        const { logger } = await import("./lib/logger.js");
        logger.warn(`*** ENVIRONMENT="${env}" — AUTH IS RELAXED. Set "environment":"production" in config before exposing this server. ***`);
    }

}

export default startServer;