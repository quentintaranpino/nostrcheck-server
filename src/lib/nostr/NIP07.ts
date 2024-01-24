import { Request, Response } from "express";
import { logger } from "../logger.js";
import { getClientIp } from "../server.js";
import { verifyEvent } from "../verify.js";

const verifyNIP07login = async (req: Request) : Promise<boolean> => {

  logger.info("Verifying login event attempt", req.body, " - ", getClientIp(req));

    if (await verifyEvent(req.body) !== 0){
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Detected an attempt to log in with invalid event. Refusing", getClientIp(req));
        return false;
    }

    //We check if created_at is not too old
    const diff =  (Math.floor(Date.now() / 1000) - req.body.created_at);
    logger.debug("Event is", diff, "seconds old");
    if (diff > 60){ //60 seconds max event age
        logger.warn("RES -> 401 unauthorized  - ", getClientIp(req));
        logger.warn("Detected an attempt to log in with an event that is too old. Refusing", getClientIp(req));
        return false;
    }

    return true;

}

export { verifyNIP07login }