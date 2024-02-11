import { generateSecretKey, getPublicKey } from "nostr-tools";
import { bytesToHex } from '@noble/hashes/utils'

const createkeyPair = async () : Promise<{publicKey : string, secretKey : string}> => {
	
	const sk = generateSecretKey();
	const pk = getPublicKey(sk)

	return {publicKey : pk, secretKey : bytesToHex(sk)}

}

export {createkeyPair}