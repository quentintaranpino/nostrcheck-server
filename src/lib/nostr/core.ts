import { Event, generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { bytesToHex } from '@noble/hashes/utils'
import { NostrEvent } from "nostr-tools"
import {SimplePool } from "nostr-tools/pool"
import 'websocket-polyfill'
import { logger } from "../logger.js"

const relays = [
	"wss://relay.nostrcheck.me",
	"wss://relay.damus.io",
	"wss://relay.nostr.band",
	"wss://nos.lol",
	"wss://relay.primal.net"
	]

const relaysPool = new SimplePool()

/**
 * Generates a key pair consisting of a public key and a secret key.
 * @returns A promise that resolves to an object containing the public key and secret key.
 */
const createkeyPair = async () : Promise<{publicKey : string, secretKey : string}> => {
	
	const sk = generateSecretKey();
	const pk = getPublicKey(sk)

	return {publicKey : pk, secretKey : bytesToHex(sk)}

}

/**
 * Generates a public key from a secret key.
 * @param secretKey - The secret key to generate the public key from.
 * @returns A promise that resolves to the public key.
 */
const getPubkeyFromSecret = async (secretKey : string) : Promise<string> => {
	
	try{
		const sk = Uint8Array.from(Buffer.from(secretKey, 'hex'));
		return getPublicKey(sk)
	}catch (error) {
		logger.error(error)
		return ""
	}

}

/**
 * Publishes an event to the Nostr network.
 * @param event - The event to be published.
 * @returns A promise that resolves to a boolean indicating whether the event was published successfully.
 */
const publishEvent = async (event : NostrEvent): Promise<boolean> => {

        try{
                await Promise.any(relaysPool.publish(relays, event))
                return true
        }catch (error) {
                logger.error(error)
                return false
        }
        
}

/**
 * Retrieves the profile data of a user from the Nostr network (Kind 0).
 * @param pubkey - The public key of the user, hex format.
 * @returns A promise that resolves to the content data of the kind 0 note.
 */
const getProfileMetadata = async (pubkey : string) : Promise<Event> => {
	
    let resolveEvent : (event : Event) => void;
    let subscribePromise : Promise<Event> = new Promise(resolve => resolveEvent = resolve);
    
    const data = relaysPool.subscribeMany(
		relays,
		[{
			authors: [pubkey],
			kinds: [0],
		}],
		{
			eoseTimeout: 1000,
			onevent(e) {
				resolveEvent(e);
			},
			oneose() {
				data.close();
				return resolveEvent(JSON.parse({kind: 0, created_at: 0, tags: [], content: "{}", pubkey: "", id: "", sig: ""}.content));
			},
		},
	);

    let event : Event = await subscribePromise;
	if (event.content === undefined) {
		return JSON.parse({kind: 0, created_at: 0, tags: [], content: "{}", pubkey: "", id: "", sig: ""}.content);
	}
	return JSON.parse(event.content);
}

export {publishEvent, createkeyPair, getPubkeyFromSecret, getProfileMetadata}


