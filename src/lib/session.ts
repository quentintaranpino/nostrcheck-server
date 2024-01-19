
import session from "express-session";
import config from "config";
import { logger } from "./logger.js";
import { Application } from "express-serve-static-core";


const iniSession = (app:Application): void => {

    checkInsecureSecret();

    let secureCoockie: boolean = true
    if (config.get('environment') != "production"){
        secureCoockie = false;
    }

    app.use(session({
        secret: config.get('session.secret'),
        proxy: true,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: secureCoockie,
            maxAge: 3600000 // Default 1 hour
        }
    }))
}

const checkInsecureSecret = (): void => {
    if (config.get('session.secret') == "nostrcheck"){
        logger.fatal("Insecure session.secret detected in config. Please change it to a random string.");
        process.exit(1);
    }
}

export default iniSession;