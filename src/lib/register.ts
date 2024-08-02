import { dbInsert, dbMultiSelect } from "./database.js";
import { generateCredentials } from "./authorization.js";
import { hashString } from "./hash.js";
import { hextoNpub, npubToHex, validatePubkey } from "./nostr/NIP19.js";

/**
 * 
 * @param username - The username to be checked.
 * @param domain - The domain to be checked.
 * @returns {Promise<boolean>} A promise that resolves to true if the username is available, or false if it is not.
 */
const isUsernameAvailable = async (username: string, domain: string): Promise<boolean> => {

    if (username == "" || username == undefined) {return false};
    if (domain == "" || domain == undefined) {return false};

    const result = await dbMultiSelect(["hex"],"registered","username = ? and domain = ?",[username, domain], true);
    if (result.length > 0) {return false};
    return true;
}


/**
 * 
 * @param pubkey - The pubkey to be checked. (hex or npub)
 * @param domain - The domain to be checked.
 * @returns {Promise<boolean>} A promise that resolves to true if the pubkey is on the domain, or false if it is not.
 */
const isPubkeyOnDomainAvailable = async (pubkey: string, domain: string): Promise<boolean> => {
    
    if (pubkey == "" || pubkey == undefined) {return false};
    if (domain == "" || domain == undefined) {return false};

    const result = await dbMultiSelect(["hex"],"registered","(pubkey = ? or hex = ?) and domain = ?",[pubkey, pubkey, domain], true);
    if (result.length > 0) {return false};
    return true;
}

/**
 * 
 * @param username - The username to be added.
 * @param pubkey - The pubkey of the user. (hex or npub)
 * @param password - The password of the user.
 * @param domain - The domain of the user.
 * @param comments - Comments to be added to the user.
 * @returns {Promise<number>} A promise that resolves to the id of the user, or 0 if an error occurs.
 */
const addNewUsername = async (username: string, pubkey: string, password:string, domain: string, comments:string = "", active = false): Promise<number> => {

    if (username == "" || username == undefined) {return 0};
    if (pubkey == "" || pubkey == undefined) {return 0};
    if (domain == "" || domain == undefined) {return 0};
    if (await validatePubkey(pubkey) == false) {return 0};

    pubkey = pubkey.startsWith("npub") ? await npubToHex(pubkey) : pubkey;

    // If the password is not provided, we will generate a random one ONLY for DB insertion.
    let regeneratePassword = false;
    if (password == "" || password == undefined) {
        regeneratePassword = true;
		password = await generateCredentials('password', pubkey, false, false, true); 
	}

    if(await isUsernameAvailable(username, domain) == false) {return 0};
    if (await isPubkeyOnDomainAvailable(pubkey, domain) == false) {return 0};

    const createUsername = await dbInsert(  "registered", 
                                    ["pubkey", "hex", "username", "password", "domain", "active", "date", "comments"],
                                    [await hextoNpub(pubkey), pubkey, username, await hashString(password, 'password'), domain, active == true ? 1 : 0, new Date().toISOString().slice(0, 19).replace("T", " "), comments]);

    if (regeneratePassword) {
        // Generate definitive password for the user and send it to the user via nostr DM.
        const newPassword = await generateCredentials("password", pubkey, true, true, false); 
        if (!newPassword) {return 0};
    };

    if (createUsername == 0) {return 0};

    return 1;
}

export { isUsernameAvailable, addNewUsername, isPubkeyOnDomainAvailable };

    