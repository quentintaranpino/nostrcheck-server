
import session from "express-session";
import config from "config";
import crypto from 'crypto';
import { logger } from "./logger.js";
import { Application } from "express"
import { updateLocalConfigKey } from "./config.js";
import { rateLimit } from 'express-rate-limit'
import { localUserMetadata } from "../interfaces/frontend.js";
import app from "../app.js";
import cookieParser from 'cookie-parser';
import { exit } from "process";

declare module 'express-session' {
	interface Session {
        identifier: string;
        metadata: localUserMetadata;
        allowed: boolean;
    }
}

const initSession = async (app:Application): Promise<void> => {

    //Check if session secret is insecure and generate new secret if needed
    const sessionSecret = await checkSessionSecret();

    logger.debug("Initialising session cookies");
    logger.debug("Session secret:", sessionSecret);

    app.use(session({
        secret: sessionSecret,
        proxy: true,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: app.get('config.environment') != "production" ? false : true,     //Disable secure cookie in development environment
            sameSite: 'strict',
            httpOnly: app.get('config.environment') != "production" ? false : true,   //Disable httpOnly cookie in development environment
            maxAge: app.get("config.session")["maxAge"],
        }
    }))

    app.use(cookieParser());

    app.locals.limiter = limiter;
}

const checkSessionSecret = async(): Promise<string> => {

    if (config.get('session.secret') == ""){
        
        //Insecure secret, generate random secret, save to config and return with new secret
        logger.info("Insecure session.secret detected in config file - Generating random secret");
        const newSecret = crypto.randomBytes(64).toString('hex');
        logger.debug("New session.secret generated: " + newSecret);

        if (await updateLocalConfigKey("session.secret", newSecret)){
            logger.debug("session.secret updated in config file");
            console.info("Config file updated with new session secret default fields. Please restart the server");
            exit(3);
        }

    }{
        return config.get('session.secret') ;
    }

}



/**
 * Creates a rate limiter middleware for express applications.
 *
 * @param limit - The maximum number of requests that a client can make in a window of time. Default is 150.
 * @param message - The message to send back to the client when they hit the rate limit. Default is "hold your horses! Too many requests cowboy, please try again later".
 * @param windowMS - The duration of the window of time in which the client can make up to 'limit' requests. The duration is in milliseconds. Default is 1 minutes.
 *
 * @returns An instance of rate limit middleware configured with the provided or default parameters.
 */
const limiter = (limit:number = app.get('config.security')['maxDefaultRequestMinute'] || 150, message:any= "", windowMS:number = 1 * 60 * 1000) => {
    if (message == "" ){message = "hold your horses! Too many requests cowboy, please try again later"}
    return rateLimit({
        windowMs: windowMS, 
        limit: limit, 
        standardHeaders: 'draft-7',
        message: message,
        legacyHeaders: false, 
    })
}

export { initSession, limiter };