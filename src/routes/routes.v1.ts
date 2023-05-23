import { Application } from "express";

import { LoadDomainsEndpoint } from "./domains.route";
import { LoadIndexEndpoint } from "./index.route";
import { LoadMediaEndpoint } from "./media.route";
import { LoadNostraddressEndpoint } from "./nostraddress.route";
import { LoadRegisterEndpoint } from "./register.route";
import { LoadVerifyEndpoint } from "./verify.route";
import { logger } from "../lib/logger";

//Load API v1 endpoints
const LoadAPIv1 = async (app: Application): Promise<boolean> => {
	
	try{
		await LoadVerifyEndpoint(app);
		await LoadIndexEndpoint(app);
		await LoadDomainsEndpoint(app);
		await LoadNostraddressEndpoint(app);
		await LoadRegisterEndpoint(app);
		await LoadMediaEndpoint(app);
	}catch(err){
		logger.error(err);
		return false;
	}
	
	return true;
};

export { LoadAPIv1 };
