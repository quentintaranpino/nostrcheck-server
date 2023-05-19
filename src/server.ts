/* eslint-disable no-console */
import app from "./app";
import { logger } from "./logger";

/**
 * Start Express server.
 */
const server = app.listen(app.get("port"), () => {

	logger.silly("")
	logger.silly("███╗   ██╗ ██████╗ ███████╗████████╗██████╗  ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗     █████╗ ██████╗ ██╗");
	logger.silly("████╗  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ██╔══██╗██╔══██╗██║");
	logger.silly("██╔██╗ ██║██║   ██║███████╗   ██║   ██████╔╝██║     ███████║█████╗  ██║     █████╔╝     ███████║██████╔╝██║");
	logger.silly("██║╚██╗██║██║   ██║╚════██║   ██║   ██╔══██╗██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ██╔══██║██╔═══╝ ██║");
	logger.silly("██║ ╚████║╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██║███████╗╚██████╗██║  ██╗    ██║  ██║██║     ██║");
	logger.silly("╚═╝  ╚═══╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝     ╚═╝");
	logger.silly("")
																											   
	logger.info("Nostrcheck API server started, version %s", app.get("version"));
	logger.info("Running at http://localhost:%d in %s mode", app.get("port"), app.get("env"));
	logger.info("Press CTRL-C to stop\n");
});

export default server;
