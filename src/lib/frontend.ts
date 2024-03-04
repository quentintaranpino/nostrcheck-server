import app from "../app.js";
import { mediafilesTableFields, registeredTableFields } from "../interfaces/database.js";
import { userMetadata } from "../interfaces/frontend.js";
import { dbSelect } from "./database.js";
import { getProfileData, getProfileFollowers, getProfileFollowing } from "./nostr/NIP01.js";

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

    // Add followers and following to the profile metadata.
    metadata["followers"] = app.get("#p_" + pubkey) ? app.get("#p_" + pubkey) : 0
    metadata["following"] = app.get("#f_" + pubkey) ? app.get("#f_" + pubkey) : 0

    return metadata;

}

const getProfileLocalMetadata = async (pubkey: string): Promise<string[]> => {
    const mediaFiles = await dbSelect("SELECT filename FROM mediafiles WHERE active = ? and visibility = ? and pubkey = ? ORDER BY date DESC ","filename", ['1', '1', pubkey], mediafilesTableFields, false) as string[];

    return  mediaFiles ? mediaFiles : [];
}

export { getProfileNostrMetadata, getProfileLocalMetadata }