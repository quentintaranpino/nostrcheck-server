
import session from "express-session";
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { logger } from "./logger.js";
import { Application } from "express"
import { localUserMetadata } from "../interfaces/frontend.js";
import { getConfig, setConfig } from "./config/core.js";

declare module 'express-session' {
	interface Session {
        identifier: string;
        metadata: localUserMetadata;
        allowed: boolean;
    }
}

const initSession = async (app:Application): Promise<void> => {

    //Check if session secret is insecure and generate new secret if needed
    const sessionSecret = await getSessionSecret();

    logger.debug(`initSession - Initialising session cookies`);

    app.use(session({
        secret: sessionSecret,
        proxy: true,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: getConfig(null, ["environment"]) != "production" ? false : true,     //Disable secure cookie in development environment
            sameSite: 'strict',
            httpOnly: getConfig(null, ["environment"]) != "production" ? false : true,   //Disable httpOnly cookie in development environment
            maxAge: getConfig(null, ["session", "maxAge"]),
        },
    }))

    app.use(cookieParser());

}

const getSessionSecret = async(): Promise<string> => {

    const sessionSecret = getConfig(null, ["session", "secret"]);

    if (sessionSecret == undefined || sessionSecret == "" || sessionSecret?.length < 64) {
        
        logger.info(`getSessionSecret - Insecure session.secret detected in config file - Generating random secret`);
        const newSecret = crypto.randomBytes(64).toString('hex');

        if (await setConfig("", ["session", "secret"], newSecret)) {
            return newSecret;
        }
        logger.fatal(`getSessionSecret - Failed to set new session secret. Exiting...`);
        process.exit(1);

    }{
        return sessionSecret;
    }

}

export { initSession };