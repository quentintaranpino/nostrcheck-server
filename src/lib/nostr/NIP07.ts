import { Request } from "express";
import { logger } from "../logger.js";
import { getClientIp } from "../utils.js";
import { verifyEvent, verifyEventTimestamp } from "./core.js";

const verifyNIP07login = async (req: Request) : Promise<boolean> => {

  logger.info("Verifying login event attempt -", getClientIp(req));

    if (await verifyEvent(req.body) !== 0){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Detected an attempt to log in with invalid event. Refusing", getClientIp(req));
        return false;
    }

    if (await verifyEventTimestamp(req.body) === false){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Detected an attempt to log in with an old event. Refusing", getClientIp(req));
        return false;
    }
    logger.info("Login event verified", getClientIp(req));
    return true;
}

export { verifyNIP07login }