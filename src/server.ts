/* eslint-disable no-console */
import app from "./app.js";
import { logger } from "./lib/logger.js";

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
	logger.info("Running at http://localhost:%d in %s mode", app.get("port"), app.get("env"));
	logger.info("Press CTRL-C to stop\n");
});

export default server;
