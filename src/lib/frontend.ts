import app from "../app.js";
import { generateAuthToken } from "./authorization.js";
import { dbMultiSelect } from "./database.js";
import { Request, Response } from "express";

const countPubkeyFiles = async (pubkey: string): Promise<number> => {

    const files = await dbMultiSelect(["id"], "mediafiles", "pubkey = ?", [pubkey], false);
    return files ? files.length : 0;
}

const isFirstUse = async (req : Request, res: Response): Promise<boolean> => {
	
	if (app.get("firstUse") == true){
        req.session.identifier = app.get("config.server")["pubkey"];
        const authToken = generateAuthToken(req.session.identifier, true);
        setAuthCookie(res, authToken);
        req.session.metadata = {
            hostedFiles: 0,
            usernames: [],
            pubkey: app.get("config.server")["pubkey"],
            npub: app.get("config.server")["npub"],
            lud16: ""
        }
        res.locals.firstUse =  
        "<h5 class='mt-3 mb-2'>Read this carefully 💜</h5>" + 
        "<p>You are automatically logged in with the user administrator '<b>public</b>'. This user is created automatically. " + 
        "It is essential to keep this user in the database for the proper functioning of the server, <b>Don't delete this user</b>.</p>" +
        "<div class='alert alert-danger ps-2 pe-2 pt-1 pb-0' role='alert'>" +
        "<p><b>The server will autologin until another user besides 'public' is created.</b> Please create another user as soon as possible and carefully note down the private key hosted in the settings page. " + 
        "Log in on nostr using this private key and note down the password you will have received via DM.</p>" +
        "</div>" + 
        "<h5 class='mt-3 mb-2'>Keys</h5>" +
        "<p>The public user has been created using the key pair specified in the <a class='text-decoration-none' href='https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/CONFIG.md' target='blank'>configuration file</a> to facilitate easy first access to the frontend. " +
        "The server interacts with the outside using the key pair specified in the configuration file located at config/local.json</p> " + 
        "<div class='alert alert-warning ps-2 pe-2 pt-1 pb-0' role='alert'>" +
        "<p><b>The server's pubkey should always match the public user pubkey.</b> " +
            "Keep these two keys the same to avoid data inconsistency problems.</p>" +
        "</div>" + 
        "<h5 class='mt-3 mb-2'>Store the private key</h5>" +
        "<p>You will find the server's pubkey and private key on the <a class='text-decoration-none' href='settings#settingsServer' target='blank'>settings page.</a> " + 
        "Please make a backup. Until another user besides 'public' is created, the server will automatically log in with this user after every restart to prevent losing access. " +
        "Once you create another user, the autologin will stop, and you will need to log in manually.</p>" +
        "<h5 class='mt-3 mb-2'>Login Methods</h5>" +
        "<p>All users can log in in three ways:</p>" +
        "<ul>" +
        "<li>Using a <b>NIP07 browser extension</b> (more info <a class='text-decoration-none' href='https://nostrcheck.me/register/browser-extension.php' target='blank'>here</a>).</li>" +
        "<li>Via legacy username and password.</li>" +
        "<li>Using a <b>one-time login code</b>, which can be generated and sent to the pubkey via nostr DM for secure access.</li>" +
        "</ul>" +
        "<div class='alert alert-primary ps-2 pe-2 pt-1 pb-0' role='alert'>" +
            "<p>The current 'public' legacy password <b>is sent via nostr DM to himself</b>. You can check it using the most popular nostr clients.<p>" +
        "</div>" + 
        "<p>You can reset the password of any user, but not set it manually. " +
        "The password will always be sent via DM to the user's related pubkey.</p>";
        return true;
    }

    return false;
}

/**
 * Sets the authkey cookie and sends it in the response
 * 
 * @param res - The Express response object
 * @param token - The JWT token to be set in the cookie
 */
const setAuthCookie = (res: Response, token: string) => {

    const currentToken = res.getHeader('Set-Cookie')?.toString().includes(`authkey=${token}`) ? token : null;

    if (currentToken  == token) return;

    res.cookie('authkey', token, {
        httpOnly: app.get('config.environment') != "production" ? false : true,
        secure: app.get('config.environment') != "production" ? false : true,
        sameSite: 'strict',
        maxAge: app.get("config.session")["maxAge"],
    });
};

const getLegalText = (): string => {

    if (app.get("config.server")["legal"]["entityType"] === "company") {
        return `
* This service is operated by **${app.get("config.server")["legal"]["company"]}**.
* Contact email: **${app.get("config.server")["legal"]["email"]}**
* Registered address: **${app.get("config.server")["legal"]["address"]}**
* Country of operation: **${app.get("config.server")["legal"]["country"]}**
* Jurisdiction: **${app.get("config.server")["legal"]["jurisdiction"]}**
* VAT Number: **${app.get("config.server")["legal"]["vat"] ? app.get("config.server")["legal"]["vat"] : "Not applicable"}**
* PHONE: **${app.get("config.server")["legal"]["phone"] ? app.get("config.server")["legal"]["phone"] : "Not applicable"}**
        `.trim();
    } else {
        return `
* This service is operated by an **individual operator**.
* Contact email: **${app.get("config.server")["legal"]["email"]}**
* Registered address: **Confidential**
* Country of operation: **${app.get("config.server")["legal"]["country"]}**
* Jurisdiction: **${app.get("config.server")["legal"]["jurisdiction"]}**
* VAT Number: **Not applicable**
* PHONE: **Not applicable**
        `.trim();
    }
}

export {isFirstUse, countPubkeyFiles, setAuthCookie, getLegalText};