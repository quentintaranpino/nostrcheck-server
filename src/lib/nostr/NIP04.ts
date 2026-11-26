import { nip04, nip17, finalizeEvent} from "nostr-tools"
import { hexToBytes } from '@noble/hashes/utils'
import { logger } from "../logger.js";
import { getDMRelays, publishEvent, publishEventTo } from "./core.js";
import { NIP04_event } from "../../interfaces/nostr.js";
import { npubToHex } from "./NIP19.js";
import { getConfig } from "../config/core.js";

/**
 * Sends a direct message to a specified public key. NIP-17 when the recipient publishes a DM
 * relay list (kind 10050), NIP-04 otherwise: a client without NIP-17 would never see a login
 * code sent as a gift wrap.
 * 
 * @param message - The message to be sent.
 * @param sendToPubkey - The public key of the recipient.
 * @returns A promise that resolves to a boolean indicating whether the message was sent successfully.
 */
const sendMessage = async (message: string, sendToPubkey : string, tenant: string) : Promise<boolean> => {

    const sk : string = getConfig(tenant, ["server", "secretKey"]);
    if (sk == "" || sk == undefined) {
        logger.error(`sendMessage - Error: No secret key found in config file`)
        return false
    }

    if (sendToPubkey && sendToPubkey.startsWith("npub")) {
        sendToPubkey = await npubToHex(sendToPubkey)
    }

    if (!message || !sendToPubkey || sendToPubkey.length != 64) {
        logger.error(`sendMessage - Error: Invalid message or public key`)
        return false
    }

    const dmRelays = await getDMRelays(sendToPubkey)
    if (dmRelays.length > 0) {
        try {
            const wrap = nip17.wrapEvent(hexToBytes(sk), { publicKey: sendToPubkey }, message)
            if (await publishEventTo(wrap, dmRelays)) return true
            logger.warn(`sendMessage - NIP-17 publish failed for ${sendToPubkey}, falling back to NIP-04`)
        } catch (error) {
            logger.warn(`sendMessage - NIP-17 wrap failed for ${sendToPubkey}, falling back to NIP-04: ${error}`)
        }
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
        logger.fatal(`sendMessage - Error sending message: ${error}`)
        return false
    }

}

export {sendMessage}

