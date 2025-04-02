
import session from "express-session";
import crypto from 'crypto';
import { logger } from "./logger.js";
import { Application } from "express"
import { updateLocalConfigKey } from "./config/local.js";
import { localUserMetadata } from "../interfaces/frontend.js";
import app from "../app.js";
import cookieParser from 'cookie-parser';

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
            secure: app.get('config.environment') != "production" ? false : true,     //Disable secure cookie in development environment
            sameSite: 'strict',
            httpOnly: app.get('config.environment') != "production" ? false : true,   //Disable httpOnly cookie in development environment
            maxAge: app.get("config.session")["maxAge"],
        }
    }))

    app.use(cookieParser());
}

const getSessionSecret = async(): Promise<string> => {

    if (app.get('config.session')['secret'] == undefined || 
        app.get('config.session')['secret'] == "" ||
        app.get('config.session')['secret']?.length < 64) {
        
        logger.info(`getSessionSecret - Insecure session.secret detected in config file - Generating random secret`);
        const newSecret = crypto.randomBytes(64).toString('hex');

        if (await updateLocalConfigKey("session.secret", newSecret)){
            const configSession = { ...app.get('config.session') }; 
            configSession.secret = newSecret;
            app.set('config.session', configSession);
            return newSecret;
        }
        return "";

    }{
        return app.get('config.session')['secret'];
    }

}

export { initSession };