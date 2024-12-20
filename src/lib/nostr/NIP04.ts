import { nip04, finalizeEvent} from "nostr-tools"
import { hexToBytes } from '@noble/hashes/utils'
import { logger } from "../logger.js";
import { publishEvent } from "./core.js";
import { NIP04_event } from "../../interfaces/nostr.js";
import app from "../../app.js";
import { npubToHex } from "./NIP19.js";

/**
 * Sends a message to a specified public key.
 * 
 * @param message - The message to be sent.
 * @param sendToPubkey - The public key of the recipient.
 * @returns A promise that resolves to a boolean indicating whether the message was sent successfully.
 */
const sendMessage = async (message: string, sendToPubkey : string) : Promise<boolean> => {

    const sk : string = app.get("config.server")["secretKey"];
    if (sk == "" || sk == undefined) {
        logger.error("No secret key found in config file, if you want to send nostr DM's edit config/local.json file and add the secret key (HEX) on server.secretKey field. The restart the server.");
        return false
    }

    if (sendToPubkey && sendToPubkey.startsWith("npub")) {
        sendToPubkey = await npubToHex(sendToPubkey)
    }

    if (!message || !sendToPubkey || sendToPubkey.length != 64) {
        logger.error("Invalid message or public key provided")
        return false
    }

    try {
        const encriptedMessage =  await nip04.encrypt(sk, sendToPubkey, message)

        const eventTemplate : NIP04_event= {
            kind: 4,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["p", sendToPubkey]],
            content: encriptedMessage,
        }

        const signedEvent = finalizeEvent(eventTemplate, hexToBytes(sk))

        return await publishEvent(signedEvent)

    } catch (error) {
        logger.fatal("Cannot send DM")
        return false
    }

}

export {sendMessage}

