import { bytesToHex } from '@noble/hashes/utils'
import { logger } from "../logger.js"
import { Event, generateSecretKey, getEventHash, getPublicKey, validateEvent, verifyEvent } from "nostr-tools";
import { NostrEvent } from "nostr-tools"
import {SimplePool, useWebSocketImplementation } from "nostr-tools/pool"
import WebSocket from 'ws'
import { ResultMessagev2 } from '../../interfaces/server.js';
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
 * @returns A promise that resolves to a result message indicating the status of the event verification.
 */
const isEventValid = async (event:Event): Promise<ResultMessagev2> => {
    logger.debug("Verifying event", event);
	try {
		const IsEventHashValid = getEventHash(event);
		if (IsEventHashValid != event.id) {
            logger.debug("Event hash is not valid");
			return {status: "error", message: "Event hash is not valid"};
		}
		const IsEventValid = verifyEvent(event);
		if (!IsEventValid) {
            logger.debug("Event signature is not valid");
			return {status: "error", message: "Event signature is not valid"};
		}
	} catch (error) {
        logger.debug("Malformed event");
        return {status: "error", message: "Malformed event"};
	}
    logger.debug("Valid event");
    return {status: "success", message: "Valid event"};
};

/**
 * Verifies the timestamp of an event.
 * @param event - The event to be verified.
 * @returns A promise that resolves to a boolean indicating whether the event timestamp is valid.
 */
const isEventTimestampValid = async (event:Event): Promise<boolean> => {
	logger.debug("Verifying event timestamp", event);
	const diff =  (Math.floor(Date.now() / 1000) - event.created_at);
	logger.debug("Event is", diff, "seconds old");
	if (diff > 60){ //60 seconds max event age
		return false;
	}
	return true;
}

export {publishEvent, isEventValid, isEventTimestampValid, createkeyPair, getPubkeyFromSecret, relays, relaysPool}