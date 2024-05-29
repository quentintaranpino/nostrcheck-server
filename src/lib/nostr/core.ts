import { bytesToHex } from '@noble/hashes/utils'
import { logger } from "../logger.js"
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { NostrEvent } from "nostr-tools"
import {SimplePool, useWebSocketImplementation } from "nostr-tools/pool"
import WebSocket from 'ws'
useWebSocketImplementation(WebSocket)


const relays = [
	"wss://relay.nostrcheck.me",
	"wss://relay.damus.io",
	"wss://relay.nostr.band",
	"wss://nos.lol",
	"wss://relay.primal.net",
	"wss://nostr-pub.wellorder.net/",
	"wss://relay.current.fyi"
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

export {publishEvent, createkeyPair, getPubkeyFromSecret, relays, relaysPool}