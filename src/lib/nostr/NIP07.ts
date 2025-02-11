import { Request } from "express";
import { logger } from "../logger.js";
import { getClientIp } from "../security/ips.js";
import { isEventTimestampValid, isEventValid } from "./core.js";
import app from "../../app.js";

const verifyNIP07event = async (req: Request) : Promise<boolean> => {

  logger.info(`Verifying integrity of NIP07 event -`, getClientIp(req));

    if ((await isEventValid(req.body)).status !== "success"){
        logger.warn(`RES -> 401 unauthorized  - ${getClientIp(req)}`);
        logger.warn(`NIP07: Detected an invalid event. Refusing`, getClientIp(req));
        return false;
    }

    if (req.body.kind !== 30078){
        logger.warn(`RES -> 401 unauthorized  - ${getClientIp(req)}`);
        logger.warn(`NIP07: Event kind must be 30078. Refusing`, getClientIp(req));
        return false;
    }

    logger.info(`NIPO7 event integrity successfully verified -`, getClientIp(req));
    return true;
}

export { verifyNIP07event }