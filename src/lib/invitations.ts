import crypto from "crypto";
import { dbMultiSelect } from "./database.js";
import { logger } from "./logger.js";

/**
 * Generates a random invite code.
 * @returns {string} A random invite code.
 */
const generateInviteCode = (): string => {
    try{
        const inviteCode = crypto.randomBytes(16).toString('hex');
        return inviteCode;
    }catch(err){
        logger.error(`generateInviteCode - Error generating invite code: ${err}`);
        return "";
    }
}

/**
 * 
 * @param inviteCode - The invite code to be checked.
 * @returns {Promise<boolean>} A promise that resolves to true if the invite code is available, or false if it is not.
 * 
 */
const validateInviteCode = async (inviteCode: string): Promise<boolean> => {
    if (inviteCode == "" || inviteCode == undefined) {return false};
    const result = await dbMultiSelect(["id"],"invitations","code = ? and inviteeid is null and active = '1'",[inviteCode], true);
    if (result.length > 0) {return true};
    return false;
}

export { generateInviteCode, validateInviteCode };