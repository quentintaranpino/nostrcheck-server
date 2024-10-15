import app from "../app.js";
import { generateCredentials } from "./authorization.js";
import { dbMultiSelect } from "./database.js";
import { Request, Response } from "express";

const countPubkeyFiles = async (pubkey: string): Promise<number> => {

    const files = await dbMultiSelect(["id"], "mediafiles", "pubkey = ?", [pubkey], false);
    return files ? files.length : 0;
}

const isFirstUse = async (req : Request, res: Response): Promise<boolean> => {
	
	if (app.get("firstUse") == true){
        req.session.identifier = app.get("config.server")["pubkey"];
        req.session.authkey = await generateCredentials('authkey', req.session.identifier);
        req.session.metadata = {
            hostedFiles: 0,
            usernames: [],
            pubkey: app.get("config.server")["pubkey"],
            npub: app.get("config.server")["npub"]
        }
        res.locals.firstUse =  
        "<h5 class='mt-3 mb-2'>Read this carefully 💜</h5>" + 
        "<p>You are automatically logged in with the user administrator '<b>public</b>'. This user is created automatically. " + 
        "It is essential to keep this user in the database for the proper functioning of the server, <b>Don't delete this user</b>.</p>" +
        "<h5 class='mt-3 mb-2'>Keys</h5>" +
        "<p>public user has been created using the key pair specified in the <a class='text-decoration-none' href='https://github.com/quentintaranpino/nostrcheck-api-ts/blob/main/CONFIG.md' target='blank'>configuration file</a> to facilitate easy first access to the frontend. " +
        "The server interacts with the outside using the key pair specified in the configuration file located at config/local.json</p> " + 
        "<div class='alert alert-warning ps-2 pe-2 pt-1 pb-0' role='alert'>" +
        "<p><b>The server's pubkey should always match public user pubkey.</b> " +
            "Keep these two keys the same to avoid data inconsistency problems.</p>" +
        "</div>" + 
        "<h5 class='mt-3 mb-2'>Store the private key</h5>" +
        "<p>You will find the server's pubkey and private key on the <a class='text-decoration-none' href='settings#settingsServer' target='blank'>settings page.</a> " + 
        "Please make a backup, once the current session is closed you will need to log in using this key pair using a browser extension (NIP07), see documentation.</p>" +
        "<h5 class='mt-3 mb-2'>Legacy compatibility</h5>" +
        "<p>All users can login in two ways, using a NIP07 browser extension (more info <a class='text-decoration-none' href='https://nostrcheck.me/register/browser-extension.php' target='blank'>here</a>) or via legacy username and password.</p>" +
        "<div class='alert alert-primary ps-2 pe-2 pt-1 pb-0' role='alert'>" +
            "<p>The current 'public' legacy's password <b>is sent via nostr DM to himself</b>. You can check it using the most popular relay's (ex. wss://relay.damus.io).<p>" +
        "</div>" + 
        "<p>You can reset the password of any user, but not set it manually. " +
        "the password will always be sent via DM to the user's related pubkey.</p>" +
        "<h5 class='mt-3 mb-2'>Don't forget</h5>" +
        "<p><b>The server will not autologin again</b>, please keep this in mind before logging out or closing the browser window. " + 
        "Carefully note down the private key hosted in settings page. Log in on nostr using this private key and note down the password you will have received via DM.</p>"
          app.set("firstUse", false);
        return true;
    }

    return false;
}

export {isFirstUse, countPubkeyFiles };