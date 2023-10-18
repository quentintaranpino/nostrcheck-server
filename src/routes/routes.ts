import { Application } from "express";

import { LoadDomainsEndpoint } from "./domains.route.js";
import { LoadIndexEndpoint } from "./index.route.js";
import { LoadMediaEndpoint } from "./media.route.js";
import { LoadNostraddressEndpoint } from "./nostraddress.route.js";
import { LoadRegisterEndpoint } from "./register.route.js";
import { LoadVerifyEndpoint } from "./verify.route.js";
import { LoadNIP96Endpoint } from "./nip96.route.js";
import { logger } from "../lib/logger.js";
import { LoadLightningaddressEndpoint } from "./lightningaddress.route.js";
import { LoadAdminEndpoint } from "./admin.route.js";

//Load API endpoints
const LoadAPI = async (app: Application, version:string): Promise<boolean> => {
	
	try{
		await LoadVerifyEndpoint(app, version);
		await LoadIndexEndpoint(app, version);
		await LoadDomainsEndpoint(app, version);
		await LoadNostraddressEndpoint(app, version);
		await LoadRegisterEndpoint(app, version);
		await LoadMediaEndpoint(app, version);
		await LoadLightningaddressEndpoint(app, version);
		await LoadNIP96Endpoint(app, version);
		await LoadAdminEndpoint(app, version);
	}catch(err){
		logger.error(err);
		return false;
	}
	
	return true;
};


export { LoadAPI };
