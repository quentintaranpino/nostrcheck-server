import { Application } from "express";
import { logger } from "../lib/logger.js";

import { loadNostraddressEndpoint } from "./nostraddress.route.js";
import { loadMediaEndpoint } from "./media.route.js";
import { loadLightningaddressEndpoint } from "./lightningaddress.route.js";
import { loadVerifyEndpoint } from "./verify.route.js";
import { loadRegisterEndpoint } from "./register.route.js";
import { loadDomainsEndpoint } from "./domains.route.js";
import { loadAdminEndpoint } from "./admin.route.js";
import { loadFrontendEndpoint } from "./frontend.route.js";
import { loadPaymentsEndpoint } from "./payments.route.js";
import { loadPluginsEndpoint } from "./plugins.route.js";
import { loadRelayRoutes } from "./relay.route.js";
import { loadUserEndpoint } from "./user.route.js";

// Load API modules
const loadAPI = async (app: Application, version:string): Promise<boolean> => {

	logger.debug("Loading API modules", "version: " + version);

	for (const module in app.get("config.server")["availableModules"]) {

		logger.debug("Loading module: " + module + " version: " + version)
		switch (module) {
			case "nostraddress":
				await loadNostraddressEndpoint(app, version);
				break;
			case "media":
				await loadMediaEndpoint(app, version);
				break;
			case "lightning":
				await loadLightningaddressEndpoint(app, version);
				break;
			case "verify":
				await loadVerifyEndpoint(app, version);
				break;
			case "register":
				await loadRegisterEndpoint(app, version);
				break;
			case "domains":
				await loadDomainsEndpoint(app, version);
				break;
			case "admin":
				await loadAdminEndpoint(app, version);
				break;
			case "frontend":
				await loadFrontendEndpoint(app, version);
				await loadUserEndpoint(app, version);
				break;
			case "payments":
				await loadPaymentsEndpoint(app, version);
				break;
			case "plugins":
				await loadPluginsEndpoint(app, version);
				break;
			case "relay":
				await loadRelayRoutes(app, version);
				break;
			default:
				logger.warn("Unknown module: " + module);
				break;
		}
	}

	return true;
};

// Initialise routes
const loadAPIs = async (app: Application) => {
	await loadAPI(app, "v1");
	await loadAPI(app, "v2");
}

export { loadAPIs };
