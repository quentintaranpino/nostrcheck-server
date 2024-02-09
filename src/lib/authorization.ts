import { connect, dbSelect, dbUpdate } from "../lib/database.js";
import { logger } from "./logger.js";
import { credentialTypes } from "../interfaces/admin.js";
import { registeredTableFields } from "../interfaces/database.js";
import { hashString } from "./hash.js";
import { Request } from "express";
import { verifyNIP07login } from "./nostr/NIP07.js";

const isPubkeyAllowed = async (req: Request): Promise<boolean> => {

	if (!req.body.pubkey) {
		logger.warn("No pubkey provided");
		return false;
	}

	logger.info("Checking if pubkey is allowed ->", req.body.pubkey)

    const conn = await connect("IsAuthorizedPubkey");
    try{
		const [isAllowedPubkey] = await conn.query("SELECT hex FROM registered WHERE hex = ? and allowed = 1", [req.body.pubkey]);
		const isAllowedPubkeyrowstemp = JSON.parse(JSON.stringify(isAllowedPubkey));

		if (isAllowedPubkeyrowstemp[0] == undefined) {
			conn.end();
			return false;
		}
		conn.end();

		return await verifyNIP07login(req);

	}catch (error) {
		return false;
	}

}

const isUserAllowed = async (username:string, password:string): Promise<boolean> => {
	try{
		let userAllowed = await dbSelect("SELECT username, password FROM registered WHERE username = ? and password = ? and allowed = 1", 
								"username", 
								[username, hashString(password), "1"], 
								registeredTableFields)

		if (userAllowed == ""){return false;}
		return true;
	}catch (error) {
		logger.error(error);
		return false;
	}
};


/**
 * Checks if the request is authorized.
 * @param {string} authkey - The authorization key.
 * @returns {Promise<boolean>} The result of the authorization check.
 */
const checkAuthkey = async (authkey:any) : Promise<boolean> =>{

	logger.info("New admin authorization request")
	if (!authkey) {
		logger.warn("Unauthorized request, no authorization header");
		return false
	}
	let hashedAuthkey = hashString(authkey);
	try{
		let result =  await dbSelect("SELECT authkey FROM registered WHERE authkey = ? and allowed = 1", "authkey", [hashedAuthkey, "1"], registeredTableFields)
		if (result == ""){
			logger.warn("Unauthorized request, authkey not found")
			return false;}
		return true;
	}catch (error) {
		logger.error(error);
		return false;
	}
}

/**
 * Generates credentials.
 * @param {('password'|'authkey')} type - The type of credential to generate. Can be either 'password' or 'authkey'.
 * @param {string} pubkey - The public key. If not provided, the new credential will not be saved to the database.
 * @returns {Promise<string>} The generated credentials.
 */
const generateCredentials = async (type: credentialTypes, pubkey :string = ""): Promise<string> => {

    try {
		const credential = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
		let hashedCredential = hashString(credential);
		const update = await dbUpdate("registered", type, hashedCredential, "hex", pubkey);
		if (update){
			logger.debug("New credential generated and saved to database");
			return credential;
		}
		return "";
    } catch (error) {
        logger.error(error);
        return "";
    }
}

export { isPubkeyAllowed, isUserAllowed, checkAuthkey, generateCredentials };