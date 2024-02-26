import app from "../app.js";
import { mediafilesTableFields, registeredTableFields } from "../interfaces/database.js";
import { userMetadata } from "../interfaces/frontend.js";
import { dbSelect } from "./database.js";
import { logger } from "./logger.js";
import { getProfileData, getProfileFollowers, getProfileFollowing } from "./nostr/NIP01.js";


const getProfileMetadata = async (pubkey: string): Promise<userMetadata> => {

    if (!pubkey || pubkey == undefined || pubkey == null){
        return {"about": "", "banner": "", "display_name": "", "followers": 0, "following": 0, "lud16": "", "mediaFiles": [], "name": "", "nip05": "", "picture": "", "username": "", "website": ""};
    }
    let metadata = await getProfileData(pubkey)
    if (!metadata || metadata == undefined || metadata == null || metadata.content == undefined || metadata.content == null){
        return {"about": "", "banner": "", "display_name": "", "followers": 0, "following": 0, "lud16": "", "mediaFiles": [], "name": "", "nip05": "", "picture": "", "username": "", "website": ""};
    }

    if (!app.get("#p_" + pubkey)){
        await getProfileFollowers(pubkey);
    } 
    if (!app.get("#f_" + pubkey)){
        await getProfileFollowing(pubkey);
    }

    let result : userMetadata = JSON.parse(metadata.content)

    // Add followers and following to the profile metadata.
    result["followers"] = app.get("#p_" + pubkey) ? app.get("#p_" + pubkey) : 0
    result["following"] = app.get("#f_" + pubkey) ? app.get("#f_" + pubkey) : 0

    // Get profile mediafiles count from database
    const mediaFiles = await dbSelect("SELECT filename FROM mediafiles WHERE active = ? and visibility = ? and pubkey = ? ","filename", ['1', '1', pubkey], mediafilesTableFields, false) as string[];
    result["mediaFiles"] = mediaFiles ? mediaFiles : [];

    // Get profile username from database
    const username = await dbSelect("SELECT username FROM registered WHERE hex = ?","username", [pubkey], registeredTableFields) as string;
    result["username"] = username ? username : "";

    return result;

}

export { getProfileMetadata }