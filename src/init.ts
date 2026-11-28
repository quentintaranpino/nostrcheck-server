import fs from "fs";
import path from "path";
import { defaultConfig, localPath } from "./interfaces/config.js";
import { exit } from "process";
import { syncDefaultConfigValues } from "./lib/config/local.js";

// Surface unhandled rejections with their full payload — Node's default
// stringifies non-Error reasons to "[object Object]" and loses the cause.
process.on("unhandledRejection", (reason) => {
    console.error("=== UNHANDLED REJECTION ===");
    if (reason instanceof Error) {
        console.error(reason.stack || reason.message);
    } else {
        console.error(reason);
        try { console.error("JSON:", JSON.stringify(reason, null, 2)); } catch { /* circular */ }
    }
});

// npm sets npm_package_version; started as plain "node dist/init.js" (systemd
// unit, Docker) the version comes from package.json instead.
if (!process.env.npm_package_version) {
    try {
        process.env.npm_package_version = JSON.parse(fs.readFileSync(path.resolve("package.json")).toString()).version;
    } catch (err) {
        console.warn("init - Could not read the version from package.json", err);
    }
}

console.log("Starting Nostrcheck server", );
(async () => {
    if (!fs.existsSync(localPath)){
        console.warn("Local config file not found. Creating new one.");
        try {
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, JSON.stringify(defaultConfig, null, 2));
            console.info("Creating local config file: " + localPath, "Please edit the file and restart the server");
            exit(0);
        } catch (err) {
            console.error("An error occured while writing config JSON File.", err);
            exit(1);
        }
    }
    if(await syncDefaultConfigValues(defaultConfig, localPath)){
        console.info("Config file updated with new default fields. Please restart the server");
        exit(3);
    }
    
    const startServer = await import('./server.js');
    await startServer.default();
})();