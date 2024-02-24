import app from "../app.js";
import { mediafilesTableFields } from "../interfaces/database.js";
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
    const count = await dbSelect("SELECT COUNT(*) as 'count' FROM mediafiles WHERE pubkey = ?","count", [pubkey], mediafilesTableFields);
    result["mediaFiles"] = count ? count : 0;

    return result;

}

export { getProfileMetadata }