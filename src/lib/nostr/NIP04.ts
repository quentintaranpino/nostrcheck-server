import { nip04, finalizeEvent} from "nostr-tools"
import { hexToBytes } from '@noble/hashes/utils'
import config from "config";
import { logger } from "../logger.js";
import { initRelays } from "./relays.js";
import { NIP04_event } from "../../interfaces/nostr.js";

const sendMessage = async (message: string, sendToPubkey : string) : Promise<boolean> => {

    let sk : string = config.get('server.secretKey');
    if (sk == "") {
        logger.error("No secret key found in config file");
        return false
    }

    if (sendToPubkey.length != 64 || sendToPubkey.startsWith("npub")) {
        logger.error("Invalid pubkey");
        return false
    }

    try {
        let encriptedMessage =  await nip04.encrypt(sk, sendToPubkey, message)
        logger.debug(encriptedMessage)

        let eventTemplate : NIP04_event= {
            kind: 4,
            created_at: Math.floor(Date.now() / 1000),
            tags: [["p", sendToPubkey]],
            content: encriptedMessage,
        }

        const signedEvent = finalizeEvent(eventTemplate, hexToBytes(sk))

        const relay = await initRelays("wss://relay.damus.io");
        if (relay != undefined){
            relay.publish(signedEvent);
        }
        
        return true
    } catch (error) {
        logger.fatal("Cannot send DM")
        return false
    }

}

export {sendMessage}

