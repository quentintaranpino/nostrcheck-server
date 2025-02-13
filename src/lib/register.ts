import { dbDelete, dbInsert, dbMultiSelect, dbUpdate, dbUpsert } from "./database.js";
import { generatePassword } from "./authorization.js";
import { hashString } from "./hash.js";
import { hextoNpub, npubToHex, validatePubkey } from "./nostr/NIP19.js";
import { getDomainInfo } from "./domains.js";
import { validateInviteCode } from "./invitations.js";
import { getNewDate } from "./utils.js";
import { logger } from "./logger.js";

/**
 * 
 * @param username - The username to be checked.
 * @param domain - The domain to be checked.
 * @returns {Promise<boolean>} A promise that resolves to true if the username is available, or false if it is not.
 */
const isUsernameAvailable = async (username: string, domain: string): Promise<boolean> => {

    if (username == "" || username == undefined) {return false}
    if (domain == "" || domain == undefined) {return false}

    const result = await dbMultiSelect(["hex"],"registered","username = ? and domain = ? and pendingotc = ?",[username, domain, "0"], true);
    if (result.length > 0) {return false}
    return true;
}

/**
 * 
 * @param pubkey - The pubkey to be checked. (hex or npub)
 * @param domain - The domain to be checked.
 * @returns {Promise<boolean>} A promise that resolves to true if the pubkey is on the domain, or false if it is not.
 */
const isPubkeyOnDomainAvailable = async (pubkey: string, domain: string): Promise<boolean> => {
    
    if (pubkey == "" || pubkey == undefined) {return false}
    if (domain == "" || domain == undefined) {return false}

    const result = await dbMultiSelect(["hex"],"registered","(pubkey = ? or hex = ?) and domain = ? and pendingotc = ?",[pubkey, pubkey, domain, "0"], true);
    if (result.length > 0) {return false}
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

const addNewUsername = async (username: string, pubkey: string, password:string, domain: string, comments:string = "", active = false, inviteCode = "", checkInvite : boolean = true, sendDM : boolean = true, allowed : boolean = false): Promise<number> => {

    if (username == "" || username == undefined) {return 0}
    if (pubkey == "" || pubkey == undefined) {return 0}
    if (domain == "" || domain == undefined) {return 0}
    if (await validatePubkey(pubkey) == false) {return 0}

    pubkey = pubkey.startsWith("npub") ? await npubToHex(pubkey) : pubkey;

    // If the password is not provided, we will generate a random one ONLY for DB insertion.
    let regeneratePassword = false;
    if (password == "" || password == undefined) {
        regeneratePassword = true;
		password = await generatePassword(pubkey, false, false, true, false);
	}

    if (await isUsernameAvailable(username, domain) == false) {return 0}
    if (await isPubkeyOnDomainAvailable(pubkey, domain) == false) {return 0}

    const domainInfo = await getDomainInfo(domain);
    if (domainInfo == "") {return 0}
    if (domainInfo.requireinvite == true && checkInvite && inviteCode == "") {return 0}

    if (domainInfo.requireinvite == true && checkInvite &&  await validateInviteCode(inviteCode) == false) {return 0}

    const createUsername = await dbUpsert("registered", {
        pubkey: await hextoNpub(pubkey),
        hex: pubkey,
        username: username,
        password: await hashString(password, 'password'),
        domain: domain,
        active: active ? 1 : 0,
        pendingotc: active ? 0 : 1,
        allowed: allowed ? 1 : 0,
        date: getNewDate(),
        comments: comments
    }, ["pubkey", "hex", "domain"]);
                                    
    if (createUsername == 0) {return 0}

    if (domainInfo.requireinvite == true && checkInvite ) {
        const updateInviteeid = await dbUpdate("invitations", {"inviteeid":createUsername}, ["code"], [inviteCode]);
        if (updateInviteeid == false) {return 0}

        const updateInviteedate = await dbUpdate("invitations", {"inviteedate":getNewDate()}, ["code"], [inviteCode]);
        if (updateInviteedate == false) {return 0}

    }
    
    if (regeneratePassword) {
        // Generate definitive password for the user and send it to the user via nostr DM.
        const newPassword = await generatePassword(pubkey, true, sendDM, false, false);
        if (!newPassword) {return 0}
    }

    if (createUsername == 0) {return 0}

    return createUsername;
}


/**
 * 
 * @param pubkey - The pubkey to be checked. (hex or npub)
 * @returns {Promise<JSON[]>} A promise that resolves to an array of JSON objects containing the usernames and domains associated with the pubkey.
 */
const getUsernames = async (pubkey: string): Promise<JSON[]> => {

    if (pubkey == "" || pubkey == undefined) {return []}

    const result = await dbMultiSelect(["username", "domain"],"registered","hex = ?",[pubkey], false);
    if (result.length == 0) {return []}
    return result;
}

const cleanPendingOTCUsers = async (): Promise<void> => {
    const users = await dbMultiSelect(["id", "active"], "registered", "pendingotc = ?", ["1"], false);
    if (users.length > 0) {
        for (const user of users) {
            if (user.active == 0) {
                const deleted = await dbDelete("registered", ["id"], [user.id]);
                if (!deleted)logger.error(`cleanPendingOTCUsers - Error trying to delete not active user with id: ${user.id}`);
            }
            if (user.active == 1) {
                const updated = await dbUpdate("registered", {"pendingotc": "0"}, ["id"], [user.id]);
                if (!updated) logger.error(`cleanPendingOTCUsers - Error trying to update active user with id: ${user.id}`);
            }
        }
        logger.info(`cleanPendingOTCUsers - Cleaned ${users.length} pending OTC users`);
    }
};

/*
* Periodically clean pending OTC users
*/
setInterval(cleanPendingOTCUsers, 60 * 1000) // 1 minute

export { isUsernameAvailable, addNewUsername, isPubkeyOnDomainAvailable, getUsernames };