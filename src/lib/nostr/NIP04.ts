import { nip04, finalizeEvent} from "nostr-tools"
import { hexToBytes } from '@noble/hashes/utils'
import { logger } from "../logger.js";
import { initRelays } from "./relays.js";
import { NIP04_event } from "../../interfaces/nostr.js";
import app from "../../app.js";

const sendMessage = async (message: string, sendToPubkey : string) : Promise<boolean> => {

    const sk : string = app.get('server.secretKey');
    if (sk == "" || sk == undefined) {
        logger.error("No secret key found in config file, if you want to send nostr DM's edit config/local.json file and add the secret key (HEX) on server.secretKey field. The restart the server.");
        return false
    }

    if (sendToPubkey.length != 64 || sendToPubkey.startsWith("npub")) {
        logger.error("Invalid pubkey");
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

        const relay = await initRelays("wss://relay.damus.io");
        if (relay != undefined){
            relay.publish(signedEvent);
            logger.info("DM sent to", sendToPubkey)
        }
        
        return true
    } catch (error) {
        logger.fatal("Cannot send DM")
        return false
    }

}

export {sendMessage}

