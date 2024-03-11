import fs from "fs";
import path from "path";
import { defaultConfig, localPath } from "./interfaces/config.js";

(async () => {
    if (!fs.existsSync(localPath)){
        console.warn("Local config file not found. Creating new one.");
        try {
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, JSON.stringify(defaultConfig, null, 2));
            console.info("Creating local config file: " + localPath, "Please edit the file and restart the server");
        } catch (err) {
            console.error("An error occured while writing config JSON File.", err);
        }
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
    const startServer = await import('./server.js');
    await startServer.default();
})();