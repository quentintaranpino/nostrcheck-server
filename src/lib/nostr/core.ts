import { generateSecretKey, getPublicKey } from "nostr-tools";
import { bytesToHex } from '@noble/hashes/utils'

/**
 * Generates a key pair consisting of a public key and a secret key.
 * @returns A promise that resolves to an object containing the public key and secret key.
 */
const createkeyPair = async () : Promise<{publicKey : string, secretKey : string}> => {
	
	const sk = generateSecretKey();
	const pk = getPublicKey(sk)

	return {publicKey : pk, secretKey : bytesToHex(sk)}

}

export {createkeyPair}