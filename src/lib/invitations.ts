import crypto from "crypto";

/**
 * Generates a random invite code.
 * @returns {string} A random invite code.
 */
const generateInviteCode = (): string => {
    try{
        const inviteCode = crypto.randomBytes(16).toString('hex');
        return inviteCode;
    }catch(err){
        console.error(err);
        return "";
    }
}

export { generateInviteCode };