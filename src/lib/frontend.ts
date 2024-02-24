import app from "../app.js";
import { mediafilesTableFields, registeredTableFields } from "../interfaces/database.js";
import { dbSelect } from "./database.js";
import { logger } from "./logger.js";
import { getProfileData, getProfileFollowers, getProfileFollowing } from "./nostr/NIP01.js";

const getProfileMetadata = async (pubkey: string): Promise<Object> => {

    let metadata = await getProfileData(pubkey)

    if (!app.get("#p_" + pubkey)){
        getProfileFollowers(pubkey);
    } 
    if (!app.get("#f_" + pubkey)){
        getProfileFollowing(pubkey);
    }
    
    let result = JSON.parse(metadata.content)

    // Add followers and following to the profile metadata.
    result["followers"] = app.get("#p_" + pubkey) ? app.get("#p_" + pubkey) : 0
    result["following"] = app.get("#f_" + pubkey) ? app.get("#f_" + pubkey) : 0

    // Get profile mediafiles count from database
    const mediaFiles = await dbSelect("SELECT filename FROM mediafiles WHERE pubkey = ?","filename", [pubkey], mediafilesTableFields, false) as string[];
    result["mediaFiles"] = mediaFiles ? mediaFiles : [];

    // Get profile username from database
    const username = await dbSelect("SELECT username FROM registered WHERE hex = ?","username", [pubkey], registeredTableFields) as string;
    result["username"] = username ? username : "";

    return result;

}

export { getProfileMetadata }