import { bytesToHex } from '@noble/hashes/utils'
import { logger } from "../logger.js"
import { Event, generateSecretKey, getEventHash, getPublicKey, validateEvent } from "nostr-tools";
import { NostrEvent } from "nostr-tools"
import {SimplePool, useWebSocketImplementation } from "nostr-tools/pool"
import WebSocket from 'ws'
import { eventVerifyTypes } from '../../interfaces/nostr.js';
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

/**
 * Verifies the integrity of an event.
 * @param event - The event to be verified.
 * @returns A promise that resolves to a number indicating whether the event is valid. 
 * 0 = valid, -1 = hash error, -2 = signature error, -3 = malformed event.
 */
const verifyEvent = async (event:Event): Promise<eventVerifyTypes> => {
    logger.debug("Verifying event", event);
	try {
		const IsEventHashValid = getEventHash(event);
		if (IsEventHashValid != event.id) {
            logger.debug("Event hash is not valid");
			return eventVerifyTypes.hashError;
		}
		const IsEventValid = validateEvent(event);
		if (!IsEventValid) {
            logger.debug("Event signature is not valid");
			return eventVerifyTypes.signatureError;
		}
	} catch (error) {
        logger.debug("Malformed event");
        return eventVerifyTypes.malformed;
	}
    logger.debug("Valid event");
    return eventVerifyTypes.valid;
};

/**
 * Verifies the timestamp of an event.
 * @param event - The event to be verified.
 * @returns A promise that resolves to a boolean indicating whether the event timestamp is valid.
 */
const verifyEventTimestamp = async (event:Event): Promise<boolean> => {
	logger.debug("Verifying event timestamp", event);
	const diff =  (Math.floor(Date.now() / 1000) - event.created_at);
	logger.debug("Event is", diff, "seconds old");
	if (diff > 60){ //60 seconds max event age
		return false;
	}
	return true;
}

export {publishEvent, verifyEvent, verifyEventTimestamp, createkeyPair, getPubkeyFromSecret, relays, relaysPool}