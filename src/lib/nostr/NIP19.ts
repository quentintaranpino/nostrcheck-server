import { nip19 } from "nostr-tools";
import { logger } from "../logger.js";

/**
 * Encodes a hex string to a npub string.
 * @param hex - The hex string to be encoded.
 * @returns The npub string.
 */
const hextoNpub = async (hex : string) : Promise<string> => {

    try {
        return await nip19.npubEncode(hex);
    } catch (error) {
        logger.error("Error while encoding server pubkey to npup: ", error);
    }

    return "";

}
    
export {hextoNpub}