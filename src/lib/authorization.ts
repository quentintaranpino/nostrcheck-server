import { connect, dbSelect, dbUpdate } from "../lib/database.js";
import { logger } from "./logger.js";
import { credentialTypes } from "../interfaces/admin.js";
import { registeredTableFields } from "../interfaces/database.js";
import { hashString, validateHash } from "./hash.js";
import { Request } from "express";
import { verifyNIP07login } from "./nostr/NIP07.js";
import crypto from "crypto";
import { sendMessage } from "./nostr/NIP04.js";


/**
 * Validates a public key by checking if it exists in the registered table of the database. 
 * Optionally checks if the public key has admin privileges.
 * @param {Request} req - The request object, which should contain the public key in the body or session.
 * @param {boolean} checkAdminPrivileges - Optional parameter. If true, the function checks if the public key has admin privileges (default is false).
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is valid and, if checkAdminPrivileges is true, whether it has admin privileges. Returns false if an error occurs, if the public key is not provided, or if it does not exist in the registered table.
 */
const isPubkeyValid = async (req: Request, checkAdminPrivileges :boolean = false): Promise<boolean> => {

	if (!req.body.pubkey && !req.session.identifier) {
		logger.warn("No pubkey provided");
		return false;
	}

	let pubkey = req.body.pubkey || req.session.identifier;

	logger.info("Checking if pubkey is allowed ->", pubkey)

    const conn = await connect("IsAuthorizedPubkey");

	let queryString : string = "SELECT hex FROM registered WHERE hex = ?";
	if (checkAdminPrivileges) queryString = "SELECT hex FROM registered WHERE allowed = 1 and hex = ?";
    try{

		let result = await dbSelect(queryString, "hex", [pubkey], registeredTableFields)
		if (result == "") {
			return false;
		}

		if (req.session.identifier) return true;

		return await verifyNIP07login(req);

	}catch (error) {
		return false;
	}

}

/**
 * Validates a user's password by comparing it with the hashed password stored in the database.
 * @param {string} username - The username of the user.
 * @param {string} password - The password provided by the user to be validated.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the provided password matches the hashed password stored in the database for the given username. Returns false if an error occurs.
 */
const isUserPasswordValid = async (username:string, password:string): Promise<boolean> => {
	try{
		let userDBPassword = await dbSelect("SELECT password FROM registered WHERE username = ?", 
								"password", 
								[username], 
								registeredTableFields)

		return await validateHash(password, userDBPassword);
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
const checkAuthkey = async (req: Request) : Promise<boolean> =>{


	if (!req.headers.authorization) {
		logger.warn("Unauthorized request, no authorization header");
		return false
	}
	let hashedAuthkey = await hashString(req.headers.authorization, 'authkey');
	try{
		let hex =  await dbSelect("SELECT hex FROM registered WHERE authkey = ? and allowed = ?", "hex", [hashedAuthkey,"1"], registeredTableFields)
		if (hex == ""){
			logger.warn("Unauthorized request, authkey not found")
			return false;}

		// Generate a new authkey for each request
		req.session.authkey = await generateCredentials('authkey',false, hex);
		logger.debug("New authkey generated for", req.session.identifier, ":", req.session.authkey)
		if (req.session.authkey == ""){
			logger.error("Failed to generate authkey for", req.session.identifier);
			return false;
		}
		return true;
	}catch (error) {
		logger.error(error);
		return false;
	}
}

/**
 * Generates and saves a new credential of the specified type to the database.
 * If a public key is provided and direct messaging is indicated, 
 * the new password will be sent to the provided public key.
 *
 * @param {credentialTypes} type - The type of credential to generate.
 * @param {string} [pubkey=""] - The public key to which to send the new password. Optional.
 * @param {boolean} [returnHashed=false] - Returns the hashed credential instead of the plain text. Optional.
 * @param {boolean} [sendDM=false] - Indicates whether to send a direct message with the new password. Optional.
 * @returns {Promise<string>} The newly generated credential, or an empty string if an error occurs or if the database update fails.
 * @throws {Error} If an error occurs during the credential generation or the database update or sending the direct message.
 */
const generateCredentials = async (type: credentialTypes, returnHashed: boolean = false, pubkey :string = "", sendDM : boolean = false): Promise<string> => {
    try {

		const credential = crypto.randomBytes(20).toString('hex');
		let hashedCredential = await hashString(credential, type);
		const update = await dbUpdate("registered", type, hashedCredential, "hex", pubkey);
		if (update){
			logger.debug("New credential generated and saved to database");
			if (pubkey != "" && sendDM){
				let message = await sendMessage("Your new password: ",pubkey);
				message = await sendMessage(credential,pubkey);	
				if (!message) {
					return "";
				}
			}
			if (returnHashed) return hashedCredential;
			return credential;
		}
		return "";
    } catch (error) {
        logger.error(error);
        return "";
    }
}

export { isPubkeyValid, isUserPasswordValid, checkAuthkey, generateCredentials };