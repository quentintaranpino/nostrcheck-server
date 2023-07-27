import { Application } from "express";

import { LoadDomainsEndpoint } from "./domains.route.js";
import { LoadIndexEndpoint } from "./index.route.js";
import { LoadMediaEndpoint } from "./media.route.js";
import { LoadNostraddressEndpoint } from "./nostraddress.route.js";
import { LoadRegisterEndpoint } from "./register.route.js";
import { LoadVerifyEndpoint } from "./verify.route.js";
import { LoadStatusesEndpoint } from "./status.route.js";
import { logger } from "../lib/logger.js";

//Load API v1 endpoints
const LoadAPIv1 = async (app: Application): Promise<boolean> => {
	
	try{
		await LoadVerifyEndpoint(app);
		await LoadIndexEndpoint(app);
		await LoadDomainsEndpoint(app);
		await LoadNostraddressEndpoint(app);
		await LoadRegisterEndpoint(app);
		await LoadMediaEndpoint(app);
		await LoadStatusesEndpoint(app);
	}catch(err){
		logger.error(err);
		return false;
	}
	
	return true;
};

export { LoadAPIv1 };
