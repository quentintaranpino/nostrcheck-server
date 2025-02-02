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
 * @param created_at_lower_limit - The maximum number of seconds the event timestamp can be in the past. Optional
 * @param created_at_upper_limit - The maximum number of seconds the event timestamp can be in the future. Optional
 * @returns A promise that resolves to a result message indicating the status of the event verification.
 */
const isEventValid = async (event:Event, created_at_lower_limit = 60, created_at_upper_limit = 60): Promise<ResultMessagev2> => {
    logger.debug("Verifying event", event.id);
	try {
		const IsEventHashValid = await getEventHash(event);
		if (IsEventHashValid != event.id) {
            logger.debug("Event hash is not valid");
			return {status: "error", message: "Event hash is not valid"};
		}
		const IsEventValid = await verifyEvent(event);
		if (!IsEventValid) {
            logger.debug("Event signature is not valid");
			return {status: "error", message: "Event signature is not valid"};
		}

		const IsEventTimestampValid = await isEventTimestampValid(event, created_at_lower_limit, created_at_upper_limit);
		if (!IsEventTimestampValid) {
			logger.debug("Event timestamp is not valid");
			return {status: "error", message: "Event timestamp is not valid"};
		}

		logger.debug("Valid event", event.id);
		return {status: "success", message: "Valid event"};

	} catch (error) {
        logger.debug("Malformed event");
        return {status: "error", message: "Malformed event"};
	}

};

/**
 * Verifies the timestamp of an event.
 * @param event - The event to be verified.
 * @param created_at_lower_limit - The maximum number of seconds the event timestamp can be in the past. Optional
 * @param created_at_upper_limit - The maximum number of seconds the event timestamp can be in the future. Optional
 * @returns A promise that resolves to a boolean indicating whether the event timestamp is valid.
 */
function isEventTimestampValid(
	event: Event,
	created_at_lower_limit = 60,
	created_at_upper_limit = 60
  ): boolean {
	const nowSec = Math.floor(Date.now() / 1000);
	const diff = nowSec - event.created_at;
	if (diff > created_at_lower_limit) 	return false;
	if (diff < -created_at_upper_limit) return false;
	return true;
  }

export {publishEvent, isEventValid, isEventTimestampValid, createkeyPair, getPubkeyFromSecret, relays, relaysPool}