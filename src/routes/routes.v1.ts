import { Application } from "express";
import { LoadVerifyEndpoint } from "./verify.route";
import { LoadIndexEndpoint } from "./index.route";
import { LoadDomainsEndpoint } from "./domains.route";
import { LoadNostraddressEndpoint } from "./nostraddress.route";
import { LoadRegisterEndpoint } from "./register.route";
import { LoadMediaEndpoint } from "./media.route";

//Load API v1 endpoints
const LoadAPIv1 = (app: Application) => {

    LoadVerifyEndpoint(app);
    LoadIndexEndpoint(app);
    LoadDomainsEndpoint(app);
    LoadNostraddressEndpoint(app);
    LoadRegisterEndpoint(app);
    LoadMediaEndpoint(app);

};

export { LoadAPIv1 };
