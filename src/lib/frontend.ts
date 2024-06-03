import app from "../app.js";
import { mediafilesTableFields } from "../interfaces/database.js";
import { userMetadata } from "../interfaces/frontend.js";
import { generateCredentials } from "./authorization.js";
import { dbSelect } from "./database.js";
import { getProfileData, getProfileFollowers, getProfileFollowing } from "./nostr/NIP01.js";
import { Request } from "express";

const getProfileNostrMetadata = async (pubkey: string): Promise<userMetadata> => {

    if (!pubkey || pubkey == undefined || pubkey == null){
        return {"about": "", "banner": "", "display_name": "", "followers": 0, "following": 0, "lud16": "", "mediaFiles": [], "name": "", "nip05": "", "picture": "", "username": "", "website": "", "pubkey": ""};
    }

    let metadata : userMetadata = {"about": "", "banner": "", "display_name": "", "followers": 0, "following": 0, "lud16": "", "mediaFiles": [], "name": "", "nip05": "", "picture": "", "username": "", "website": "", "pubkey": pubkey};

    const nostrMetadata = await getProfileData(pubkey)
    if (!nostrMetadata || nostrMetadata == undefined || nostrMetadata == null || nostrMetadata.content == undefined || nostrMetadata.content == null){
        return {"about": "", "banner": "", "display_name": "", "followers": 0, "following": 0, "lud16": "", "mediaFiles": [], "name": "", "nip05": "", "picture": "", "username": "", "website": "", "pubkey": ""};
    }

    if (!app.get("#p_" + pubkey)){
        await getProfileFollowers(pubkey);
    } 
    if (!app.get("#f_" + pubkey)){
        await getProfileFollowing(pubkey);
    }

    metadata = JSON.parse(nostrMetadata.content)
    metadata.pubkey = pubkey;

    // If If the user picture is not set, we will use the default one.
    if (!metadata.picture){metadata.picture = "/static/resources/picture-default.webp";}
    if (!metadata.banner){metadata.banner = "/static/resources/banner-default.webp";}


    // Add followers and following to the profile metadata.
    metadata["followers"] = app.get("#p_" + pubkey) ? app.get("#p_" + pubkey) : 0
    metadata["following"] = app.get("#f_" + pubkey) ? app.get("#f_" + pubkey) : 0

    return metadata;

}

const getProfileLocalMetadata = async (pubkey: string): Promise<string[]> => {
    const mediaFiles = await dbSelect(  "SELECT filename FROM mediafiles WHERE active = ? and visibility = ? and pubkey = ? ORDER BY date DESC ","filename", 
                                        ['1', '1', pubkey], 
                                        false) as string[];

    return  mediaFiles ? mediaFiles : [];
}

const isFirstUse = async (req : Request): Promise<boolean> => {
	
	if (app.get("firstUse") == true){
        req.session.identifier = app.get("config.server")["pubkey"];
        req.session.authkey = await generateCredentials('authkey', false, req.session.identifier);
        req.session.metadata = await getProfileNostrMetadata(req.session.identifier);
        req.body.firstUse =  
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
        "<p>You can reset the password of any user, but you will never see what password you have assigned, " + 
        "the password will always be sent via DM to the user's related pubkey.</p>" +
        "<h5 class='mt-3 mb-2'>Don't forget</h5>" +
        "<p><b>The server will not autologin again</b>, please keep this in mind before logging out or closing the browser window. " + 
        "Carefully note down the private key hosted in settings page. Log in on nostr using this private key and note down the password you will have received via DM.</p>"
          app.set("firstUse", false);
        return true;
    }

    return false;
}

export { getProfileNostrMetadata, getProfileLocalMetadata, isFirstUse }