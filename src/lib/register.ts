import { dbInsert, dbMultiSelect } from "./database.js";
import { generateCredentials } from "./authorization.js";
import { hashString } from "./hash.js";
import { hextoNpub } from "./nostr/NIP19.js";

/**
 * 
 * @param username - The username to be checked.
 * @returns {Promise<boolean>} A promise that resolves to true if the username is available, or false if it is not.
 */
const isUsernameAvailable = async (username: string): Promise<boolean> => {

    const result = await dbMultiSelect(["hex"],"registered","username = ?",[username], true);
    if (result.length > 0) {return false};
    return true;
}

/**
 * 
 * @param username - The username to be added.
 * @param pubkey - The pubkey of the user.
 * @param password - The password of the user.
 * @param domain - The domain of the user.
 * @param comments - Comments to be added to the user.
 * @returns {Promise<number>} A promise that resolves to the id of the user, or 0 if an error occurs.
 */
const addNewUsername = async (username: string, pubkey: string, password:string, domain: string, comments:string = ""): Promise<number> => {

    if (password == "" || password == undefined) {
		password = await generateCredentials('password', pubkey, false, false, true); // If the password is not provided, we will generate a random one only for DB insertion.
	}

    const createUsername = await dbInsert(  "registered", 
                                    ["pubkey", "hex", "username", "password", "domain", "active", "date", "comments"],
                                    [await hextoNpub(pubkey), pubkey, username, await hashString(password, 'password'), domain, 1, new Date().toISOString().slice(0, 19).replace("T", " "), comments]);

    if (createUsername) {
        const newPassword = await generateCredentials("password", pubkey, true, true, false); // Generate definitive password for the user and send it to the user via nostr DM.
        if (!newPassword) {return 0};
        return createUsername;
    };

    return 0;
}

export { isUsernameAvailable, addNewUsername }

    