/* eslint-disable no-console */
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { SeedMediafilesMagnets } from "./lib/torrent.js";
import { prepareAppFolders, prepareAPPConfig } from "./lib/config.js";

// Start Express server.
const server = app.listen(app.get("port"), () => {
	console.log("");
	console.log("");
	console.log(
		"███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗     █████╗ ██████╗ ██╗"
	);
	console.log(
		"████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ██╔══██╗██╔══██╗██║"
	);
	console.log(
		"██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝     ███████║██████╔╝██║"
	);
	console.log(
		"██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ██╔══██║██╔═══╝ ██║"
	);
	console.log(
		"██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗    ██║  ██║██║     ██║"
	);
	console.log(
		"╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝     ╚═╝"
	);

	logger.info("Nostrcheck API server started, version %s", app.get("version"));
	logger.info("Running at https://" + app.get('host') + ":%s mode", app.get("port"), app.get("env"));
	logger.info("Press CTRL-C to stop\n");

	//Clean temp dir
	prepareAppFolders();
	prepareAPPConfig();

	//Start seeding magnets
	SeedMediafilesMagnets();
});

export default server;
