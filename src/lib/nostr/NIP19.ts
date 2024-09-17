import { nip19 } from "nostr-tools";
import { logger } from "../logger.js";

/**
 * Encodes a hex string to a npub string.
 * @param hex - The hex string to be encoded.
 * @returns The npub string.
 */
const hextoNpub = async (hex : string) : Promise<string> => {

    if (hex != "" && hex.startsWith("npub")) {
        return hex;
    }

    try {
        return await nip19.npubEncode(hex);
    } catch (error) {
        logger.error("Error while encoding pubkey to npub: ", error);
    }

    return "";

}

const npubToHex = async (npub : string) : Promise<string> => {

    if (npub != "" && !npub.startsWith("npub")) {
        return npub;
    }
    
        try {
            return await nip19.decode(npub).data.toString();
        } catch (error) {
            logger.error("Error while encoding pubkey to npub: ", error);
        }
    
        return "";
}

/**
 * Validates a pubkey.
 * @param pubkey - The pubkey to be validated. (hex or npub)
 * @returns True if the pubkey is valid, false otherwise.
 */
const validatePubkey = async (pubkey : string) : Promise<boolean> => {
    
    if (pubkey == null || pubkey == "" || pubkey == undefined) {return false}
    if (pubkey.length > 64) {return false}

    if (pubkey.startsWith("npub")) {
        const hex = await npubToHex(pubkey);
        if (hex == "") {return false}
        if (hex.length != 64) {return false}
        return true;
    }

    if (!pubkey.startsWith("npub")){
        const npub = await hextoNpub(pubkey);
        if (npub == "") {return false}
        if (npub.length < 57) {return false}
        return true;
    }

    return false;

}
    
export {hextoNpub, npubToHex, validatePubkey};