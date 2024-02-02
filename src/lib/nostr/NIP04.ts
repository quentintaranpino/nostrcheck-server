import {Relay, nip04, finalizeEvent} from "nostr-tools"
import { hexToBytes } from '@noble/hashes/utils'
import config from "config";
import { logger } from "../logger.js";
import 'websocket-polyfill'

// Create a method to send a message through the Nostr network DM
const sendMessage = async (message: string, sendToPubkey : string) : Promise<boolean> => {

    let pk : string = config.get('server.pubkey');
    if (pk == "") {
        logger.error("No public key found in config file");
        return false
    }
    let sk : string = config.get('server.secretKey');
    if (sk == "") {
        logger.error("No secret key found in config file");
        return false
    }

    let encriptedMessage =  await nip04.encrypt(sk, sendToPubkey, message)

    logger.debug(encriptedMessage)

    const relay = await Relay.connect('wss://relay.damus.io')

    let eventTemplate = {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", "89e14be49ed0073da83b678279cd29ba5ad86cf000b6a3d1a4c3dc4aa4fdd02c"]],
        content: encriptedMessage,
      }

    const signedEvent = finalizeEvent(eventTemplate, hexToBytes(sk))
    await relay.publish(signedEvent)
    logger.debug(signedEvent)
    relay.close()
      
    return true
}

export {sendMessage}

