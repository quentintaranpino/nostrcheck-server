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
    const mediaFiles = await dbSelect("SELECT filename FROM mediafiles WHERE active = ? and visibility = ? and pubkey = ? ORDER BY date DESC ","filename", ['1', '1', pubkey], mediafilesTableFields, false) as string[];

    return  mediaFiles ? mediaFiles : [];
}

const isFirstUse = async (req : Request): Promise<boolean> => {
	
	if (app.get("firstUse") == true){
        req.session.identifier = app.get("config.server")["pubkey"];
        req.session.authkey = await generateCredentials('authkey', false, req.session.identifier);
        req.session.metadata = await getProfileNostrMetadata(req.session.identifier);
        req.body.firstUse =  
            "You are logged in to the server with the super admin (<b>public</b>) user. " + 
            "You can see the server pubkey and the private key on the settings page. " +
            "<br></br><b>A DM has been sent to this pubkey</b> with the login password. " + 
            "<br></br>The server <b>will not autologin again</b>, please note this before exiting.";
        app.set("firstUse", false);
        return true;
    }

    return false;
}

export { getProfileNostrMetadata, getProfileLocalMetadata, isFirstUse }