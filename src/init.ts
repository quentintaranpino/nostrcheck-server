import fs from "fs";
import path from "path";
import { defaultConfig, localPath } from "./interfaces/config.js";
import { exit } from "process";
import { syncDefaultConfigValues } from "./lib/config.js";

console.debug("Starting Nostrcheck server", );
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
        exit(0);
    }
    
    const startServer = await import('./server.js');
    await startServer.default();
})();