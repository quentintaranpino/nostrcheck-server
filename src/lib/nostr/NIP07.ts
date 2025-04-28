import { Request } from "express";

import { logger } from "../logger.js";
import { getClientInfo } from "../security/ips.js";
import { isEventValid } from "./core.js";

const verifyNIP07event = async (req: Request) : Promise<boolean> => {

    logger.info(`verifyNIP07event - Request from:`, req.hostname, "|", getClientInfo(req).ip);

    if ((await isEventValid(req.body)).status !== "success"){
        logger.warn(`verifyNIP07event - Invalid event`, getClientInfo(req).ip);
        return false;
    }

    if (req.body.kind !== 30078){
        logger.warn(`verifyNIP07event - Event kind must be 30078. Refusing`, getClientInfo(req).ip);
        return false;
    }

    logger.info(`verifyNIP07event - Valid event`, getClientInfo(req).ip);
    return true;
}

export { verifyNIP07event }