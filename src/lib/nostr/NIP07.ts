import { Request } from "express";
import { logger } from "../logger.js";
import { getClientIp } from "../security/ips.js";
import { isEventTimestampValid, isEventValid } from "./core.js";
import app from "../../app.js";

const verifyNIP07event = async (req: Request) : Promise<boolean> => {

    logger.info(`verifyNIP07event - Request from:`, req.hostname, "|", getClientIp(req));

    if ((await isEventValid(req.body)).status !== "success"){
        logger.warn(`verifyNIP07event - Invalid event`, getClientIp(req));
        return false;
    }

    if (req.body.kind !== 30078){
        logger.warn(`verifyNIP07event - Event kind must be 30078. Refusing`, getClientIp(req));
        return false;
    }

    logger.info(`verifyNIP07event - Valid event`, getClientIp(req));
    return true;
}

export { verifyNIP07event }