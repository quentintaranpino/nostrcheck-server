/* eslint-disable no-console */
import config from "config";
import app from "./app.js";
import { prepareAppFolders, prepareAPPConfig } from "./lib/config.js";
import { showDBStats } from "./lib/database.js";
import { SeedMediafilesMagnets } from "./lib/torrent.js";

// Start Express server.
const server = app.listen(app.get("port"), async () => {
	console.log("");
	console.log("");
	console.log(
		"███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗    ███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ "
	);
	console.log(
		"████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗"
	);
	console.log(
		"██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝     ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝"
	);
	console.log(
		"██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗"
	);
	console.log(
		"██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗    ███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║"
	);
	console.log(
		"╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝    ╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝"
	);

	console.log("Nostrcheck server started, version %s", app.get("version"));
	console.log("Running at http://" + app.get('host') + ":%s - ", app.get("port"), app.get("env"), "mode");
	console.log("Press CTRL-C to exit\n");

	//Prepare app folders and config
	prepareAppFolders();
	prepareAPPConfig();

	//Show startup stats
	showDBStats();

	//Start seeding magnets
	SeedMediafilesMagnets();

});

export default server;
