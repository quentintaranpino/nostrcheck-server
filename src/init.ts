// init.ts
import fs from "fs";
import { defaultConfig, localPath } from "./interfaces/config.js";
import startServer from "./server.js";

(async () => {
    console.log("Checking local config file: " + localPath);
    if (!fs.existsSync(localPath)){
        console.warn("Local config file not found. Creating new one.");
        try {
            fs.writeFileSync(localPath, JSON.stringify(defaultConfig, null, 2));
            console.info("Creating local config file: " + localPath);
            console.info("Please edit the file and restart the server");
            process.exit(1);
        } catch (err) {
            console.error("An error occured while writing config JSON File.", err);
            process.exit(1);
        }
    }
    await startServer();
})();