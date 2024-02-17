import { dbSelect, dbUpdate } from "../lib/database.js";
import { logger } from "./logger.js";
import { credentialTypes, authHeaderResult } from "../interfaces/authorization.js";
import { registeredTableFields } from "../interfaces/database.js";
import { hashString, validateHash } from "./hash.js";
import { Request } from "express";
import { verifyNIP07login } from "./nostr/NIP07.js";
import crypto from "crypto";
import { sendMessage } from "./nostr/NIP04.js";
import { isNIP98Valid } from "./nostr/NIP98.js";
import { Event } from "nostr-tools";


/**
 * Parses the authorization header and checks if it is valid. (apikey, authkey, or NIP98 event)
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const parseAuthHeader = async (req: Request, endpoint: string = "", checkAdminPrivileges = true): Promise<authHeaderResult> => {

	// Apikey is checked first, if it exists, it will be used to authenticate the request
	if (req.query.apikey || req.body.apikey) {
		logger.debug("Apikey found on request", req.query.apikey || req.body.apikey, "|", req.socket.remoteAddress)
		return await isApikeyValid(req, endpoint, checkAdminPrivileges);
	}

	//Check if request has authorization header (Nostr NIP98 event or Bearer authkey)
	if (req.headers.authorization === undefined) {
		logger.warn("RES -> 400 Bad request - Authorization header not found","|",req.socket.remoteAddress);
		return {status: "error", message: "Authorization header not found", pubkey:"", authkey:""};
	}

	// Check if authkey is present on the header authorization and validate it.
	if (req.headers.authorization.startsWith('Bearer ')) {
		logger.debug("authkey found on request", "|", req.socket.remoteAddress);
		return await isAuthkeyValid(req.headers.authorization.split(' ')[1]);
	} 

	//Check if NIP98 is present on the header authorization and validate it.
	if (!req.headers.authorization.startsWith('Nostr ')) {
		let authevent: Event;
		logger.debug("NIP 98 found on request", req.headers.authorization, "|", req.socket.remoteAddress);
		try {
			authevent = JSON.parse(
				Buffer.from(
					req.headers.authorization.split(' ')[1],
					"base64"
				).toString("utf8")
			);
		} catch (error) {

			logger.warn(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			return {status: "error", message: "Malformed authorization header", pubkey:"", authkey : ""};
		}

		// Check if NIP98 event authorization content is valid, 
		return await isNIP98Valid(authevent, req, checkAdminPrivileges);
		
	}
	
	// If none of the above, return error
	logger.warn("RES -> 400 Bad request - Authorization header not found", "|", req.socket.remoteAddress);
	return {status: "error", message: "Authorization header not found", pubkey:"", authkey:""};

};

/**
 * Validates a public key by checking if it exists in the registered table of the database. 
 * Optionally checks if the public key has admin privileges.
 * @param {Request} req - The request object, which should contain the public key in the body or session.
 * @param {boolean} [checkAdminPrivileges=false] - A boolean indicating whether to check if the public key has admin privileges. Optional.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is valid and, if checkAdminPrivileges is true, whether it has admin privileges. Returns false if an error occurs, if the public key is not provided, or if it does not exist in the registered table.
 */
const isPubkeyValid = async (req: Request, checkAdminPrivileges = false): Promise<boolean> => {

	if (!req.body.pubkey && !req.session.identifier) {
		logger.warn("No pubkey provided");
		return false;
	}

	const pubkey = req.body.pubkey || req.session.identifier;
	const hex = await dbSelect("SELECT hex FROM registered WHERE hex = ?", "hex", [pubkey], registeredTableFields)
	if (hex == "") {
		return false;
	}

	if (checkAdminPrivileges) {
		const admin = await dbSelect("SELECT allowed FROM registered WHERE hex = ?", "allowed", [hex], registeredTableFields);
		if (admin === "0") {
			logger.warn("RES -> 403 forbidden - Apikey does not have admin privileges", "|", req.socket.remoteAddress);
			return false;
		}
	}
	if (req.session.identifier) return true;
	return await verifyNIP07login(req);

}

/**
 * Validates a user's password by comparing it with the hashed password stored in the database.
 * @param {string} username - The username of the user.
 * @param {string} password - The password provided by the user to be validated.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the provided password matches the hashed password stored in the database for the given username. Returns false if an error occurs.
 */
const isUserPasswordValid = async (username:string, password:string): Promise<boolean> => {
	try{
		const userDBPassword = await dbSelect("SELECT password FROM registered WHERE username = ?", 
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
 * Verifies the authorization of a request by checking the provided authorization key.
 * If the key is valid, a new authorization key is generated for the session.
 * @param {Request} req - The incoming request.
 * @returns {Promise<checkAuthkeyResult>} The result of the authorization check, including the status, a message, and the new authkey if the check was successful.
 */
const isAuthkeyValid = async (authString: string) : Promise<authHeaderResult> =>{

	if (authString === undefined || authString === "") {
		logger.warn("Unauthorized request, no authorization header");
		return {status: "error", message: "Unauthorized", authkey: "", pubkey:""};
	}

	const hashedAuthkey = await hashString(authString, 'authkey');
	try{
		const hex =  await dbSelect("SELECT hex FROM registered WHERE authkey = ? and allowed = ?", "hex", [hashedAuthkey,"1"], registeredTableFields)
		if (hex == ""){
			logger.warn("Unauthorized request, authkey not found")
			return {status: "error", message: "Unauthorized", authkey: "", pubkey:""};
		}

		// Generate a new authkey for each request
		const newAuthkey = await generateCredentials('authkey',false, hex);
		logger.debug("New authkey generated for", hex, ":", newAuthkey)
		if (newAuthkey == ""){
			logger.error("Failed to generate authkey for", hex);
			return {status: "error", message: "Internal server error", authkey: "", pubkey: ""};
		}
		return {status: "success", message: "Authorized", authkey: newAuthkey, pubkey:hex};
	}catch (error) {
		logger.error(error);
		return {status: "error", message: "Internal server error", authkey: "", pubkey:""};
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

		let credential = crypto.randomBytes(20).toString('hex');
		if ( type == 'authkey') credential = 'Auth' + credential;
		const hashedCredential = await hashString(credential, type);
		const update = await dbUpdate("registered", type, hashedCredential, "hex", pubkey);
		if (update){
			logger.debug("New credential generated and saved to database");
			if (type == 'password' && pubkey != "" && sendDM){
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

/**
 * Checks if the request has a valid apikey.
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @param checkAdminPrivileges - A boolean indicating whether to check if the apikey has admin privileges. Optional.
 * @returns A promise that resolves to a boolean indicating whether the apikey is valid. Returns false if the apikey is not found or if an error occurs.
 */
const isApikeyValid = async (req: Request, endpoint: string = "", checkAdminPrivileges = true): Promise<authHeaderResult> => {

	let apikey = req.query.apikey || req.body.apikey;
	if (!apikey) {
		logger.warn("RES -> 400 Bad request - Apikey not found", "|", req.socket.remoteAddress);
		return {status: "error", message: "Apikey not found", pubkey:"", authkey:""};
	}

	// We only allow server apikey for uploadMedia endpoint
	const serverApikey = await dbSelect("SELECT apikey FROM registered WHERE username = ?", "apikey", ["public"], registeredTableFields);
	const hexApikey : string = await dbSelect(
		(endpoint != "uploadmedia" && endpoint != "getMediaStatusbyID")
			? "SELECT hex FROM registered WHERE apikey = ? and apikey <> ?"
			: "SELECT hex FROM registered WHERE apikey = ?",
		"hex",
		endpoint != "Uploadmedia" ? [apikey, serverApikey] : [apikey.toString()],
		registeredTableFields
	);

	if (hexApikey === "" || hexApikey === undefined) {
		if (serverApikey){
			logger.warn("RES -> 401 unauthorized - Apikey not authorized for this action", "|", req.socket.remoteAddress);
			return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:""};
		}
		logger.warn("RES -> 401 unauthorized - Apikey not found", "|", req.socket.remoteAddress);
		return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:""};
	}

	if (checkAdminPrivileges) {
		const admin = await dbSelect("SELECT allowed FROM registered WHERE hex = ?", "allowed", [hexApikey], registeredTableFields);
		if (admin === "0") {
			logger.warn("RES -> 403 forbidden - Apikey does not have admin privileges", "|", req.socket.remoteAddress);
			return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:""};
		}
	}

	const result: authHeaderResult = {
		status: "success",
		message: "Apikey is valid",
		pubkey: hexApikey,
		authkey: ""
	};
	return result;
};

export { isPubkeyValid, isUserPasswordValid, isApikeyValid, isAuthkeyValid, generateCredentials, parseAuthHeader };