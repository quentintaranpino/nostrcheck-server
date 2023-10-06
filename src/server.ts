/* eslint-disable no-console */
import app from "./app.js";
import { prepareAppFolders, prepareAPPConfig } from "./lib/config.js";
import { showDBStats } from "./lib/database.js";

// Start Express server.
const server = app.listen(app.get("port"), async () => {
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

	console.log("Nostrcheck API server started, version %s", app.get("version"));
	console.log("Running at https://" + app.get('host') + ":%s mode", app.get("port"), app.get("env"));
	console.log("Press CTRL-C to stop\n");

	//Clean temp dir
	prepareAppFolders();
	prepareAPPConfig();

	//Show startup stats
	showDBStats();


});

export default server;
