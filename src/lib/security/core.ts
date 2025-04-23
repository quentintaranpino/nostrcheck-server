import rateLimit from "express-rate-limit";
import app from "../../app.js";
import { ResultMessagev2 } from "../../interfaces/server.js";
import { getConfig, isModuleEnabled } from "../config/core.js";

/**
 * Creates a rate limiter middleware for express applications.
 *
 * @param limit - The maximum number of requests that a client can make in a window of time. Default is 150.
 * @param message - The message to send back to the client when they hit the rate limit. Default is "hold your horses! Too many requests cowboy, please try again later".
 * @param windowMS - The duration of the window of time in which the client can make up to 'limit' requests. The duration is in milliseconds. Default is 1 minutes.
 *
 * @returns An instance of rate limit middleware configured with the provided or default parameters.
 */
const limiter = (limit:number = 0, message?: ResultMessagev2, windowMS:number = 1 * 60 * 1000) => {

    if (limit == 0) {
        limit = getConfig(null, ["security", "maxDefaultRequestMinute"]);
    }

    if (!isModuleEnabled("security",""))   return (_req:any, _res:any, next:any) => { next(); }
   
    if (!message)  message = { status: "error", message: "Rate limit exceeded. Try again in a few minutes."};

    return rateLimit({
        windowMs: windowMS, 
        limit: limit, 
        standardHeaders: 'draft-7',
        message: message,
        legacyHeaders: false, 
    })
}

export { limiter };
