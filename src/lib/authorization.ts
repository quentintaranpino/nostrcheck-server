import { dbSelect, dbUpdate } from "../lib/database.js";
import { logger } from "./logger.js";
import { credentialTypes, authHeaderResult } from "../interfaces/authorization.js";
import { hashString, validateHash } from "./hash.js";
import { Request } from "express";
import { verifyNIP07login } from "./nostr/NIP07.js";
import crypto from "crypto";
import { sendMessage } from "./nostr/NIP04.js";
import { isNIP98Valid } from "./nostr/NIP98.js";
import { Event } from "nostr-tools";
import { isBUD01AuthValid } from "./blossom/BUD01.js";
import { NIPKinds } from "../interfaces/nostr.js";
import { BUDKinds } from "../interfaces/blossom.js";


/**
 * Parses the authorization header and checks if it is valid. (apikey, authkey, or NIP98 event)
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @param checkAdminPrivileges - A boolean indicating whether to check if the apikey has admin privileges. Optional.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const parseAuthHeader = async (req: Request, endpoint: string = "", checkAdminPrivileges = true): Promise<authHeaderResult> => {

	// Apikey.  Will be deprecated on 0.7.0
	if (req.query.apikey || req.body.apikey) {
		logger.debug("Apikey found on request", req.query.apikey || req.body.apikey, "|", req.socket.remoteAddress)
		return await isApikeyValid(req, endpoint, checkAdminPrivileges);
	}

	//Check if request has authorization header.
	if (req.headers.authorization === undefined) {
		logger.warn("RES -> 400 Bad request - Authorization header not found","|",req.socket.remoteAddress);
		return {status: "error", message: "Authorization header not found", pubkey:"", authkey:"", kind: 0};
	}

	// Authkey. Bearer token.
	if (req.headers.authorization.startsWith('Bearer ')) {
		logger.debug("authkey found on request: ", req.headers.authorization, "|", req.socket.remoteAddress);
		return await isAuthkeyValid(req.headers.authorization.split(' ')[1], checkAdminPrivileges);
	} 

	// NIP98 or BUD01. Nostr / Blossom token
	if (req.headers.authorization.startsWith('Nostr ')) {
		let authevent: Event;
		logger.debug("NIP98 / BUD01 found on request", req.headers.authorization, "|", req.socket.remoteAddress);
		try {
			authevent = JSON.parse(
				Buffer.from(
					req.headers.authorization.split(' ')[1],
					"base64"
				).toString("utf8")
			);

			// Check NIP98 / BUD01
			if (authevent.kind == BUDKinds.BUD01_auth) {
				return await isBUD01AuthValid(authevent, req, checkAdminPrivileges);
			}

			if (authevent.kind == NIPKinds.NIP98){
				return await isNIP98Valid(authevent, req, checkAdminPrivileges);
			}

		} catch (error) {
			logger.warn(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			return {status: "error", message: "Malformed authorization header", pubkey:"", authkey : "", kind: 0};
		}
		
	}
	
	// If none of the above, return error
	logger.warn("RES -> 400 Bad request - Authorization header not found", "|", req.socket.remoteAddress);
	return {status: "error", message: "Authorization header not found", pubkey:"", authkey:"", kind: 0};

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
	const hex = await dbSelect("SELECT hex FROM registered WHERE hex = ? and active = ?", "hex", [pubkey, '1']) as string;
	if (hex == "") {
		return false;
	}

	if (checkAdminPrivileges) {
		const admin = await dbSelect("SELECT allowed FROM registered WHERE hex = ?", "allowed", [hex]) as string;
		if (admin != "1") {
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
const isUserPasswordValid = async (username:string, password:string, checkAdminPrivileges = true ): Promise<boolean> => {

	try{

		if (checkAdminPrivileges) {
			const admin = await dbSelect("SELECT allowed FROM registered WHERE username = ?", "allowed", [username]) as string;
			if (admin === "0") {
				logger.warn("RES -> 403 forbidden - Username does not have admin privileges", "|", username);
				return false;
			}
		}
		const userDBPassword = await dbSelect("SELECT password FROM registered WHERE username = ?", 
								"password", 
								[username]) as string;

		return await validateHash(password, userDBPassword);
	}catch (error) {
		logger.error(error);
		return false;
	}
};


/**
 * Verifies the authorization of a request by checking the provided authorization key.
 * If the key is valid, a new authorization key is generated for the session.
 * @param {string} authString - The authorization key to verify.
 * @param {boolean} [checkAdminPrivileges=true] - A boolean indicating whether to check if the authorization key has admin privileges. Optional, default is true.
 * @returns {Promise<checkAuthkeyResult>} The result of the authorization check, including the status, a message, and the new authkey if the check was successful.
 */
const isAuthkeyValid = async (authString: string, checkAdminPrivileges: boolean = true) : Promise<authHeaderResult> =>{

	if (authString === undefined || authString === "") {
		logger.warn("Unauthorized request, no authorization header");
		return {status: "error", message: "Unauthorized", authkey: "", pubkey:"", kind: 0};
	}

	const hashedAuthkey = await hashString(authString, 'authkey');
	let whereStatement = checkAdminPrivileges == true? "authkey = ? and allowed = ?" : "authkey = ?";

	try{
		const hex =  await dbSelect(`SELECT hex FROM registered WHERE ${whereStatement}`, "hex", [hashedAuthkey, checkAdminPrivileges == true? '1':'0']) as string;
		if (hex == ""){
			logger.warn("Unauthorized request, authkey not allwed or not found")
			return {status: "error", message: "Unauthorized", authkey: "", pubkey:"", kind: 0};
		}

		// Generate a new authkey for each request
		const newAuthkey = await generateCredentials('authkey', hex);
		logger.debug("New authkey generated for", hex, ":", newAuthkey)
		if (newAuthkey == ""){
			logger.error("Failed to generate authkey for", hex);
			return {status: "error", message: "Internal server error", authkey: "", pubkey: "", kind: 0};
		}
		return {status: "success", message: "Authorized", authkey: newAuthkey, pubkey:hex, kind: 0};
	}catch (error) {
		logger.error(error);
		return {status: "error", message: "Internal server error", authkey: "", pubkey:"", kind: 0};
	}
}

/**
 * Generates and saves a new credential of the specified type to the database.
 * If a public key is provided and direct messaging is indicated, 
 * the new password will be sent to the provided public key.
 *
 * @param {credentialTypes} type - The type of credential to generate. Can be 'password', 'authkey', or 'otc'.
 * @param {boolean} [returnHashed=false] - Returns the hashed credential instead of the plain text. Optional.
 * @param {string} [pubkey=""] - The public key to which to send the new password. Optional.
 * @param {boolean} [sendDM=false] - Indicates whether to send a direct message with the new password. Optional.
 * @param {boolean} [onlyGenerate=false] - Indicates whether to only generate the credential without saving it to the database and sending a DM. Optional.
 * @returns {Promise<string>} The newly generated credential, or an empty string if an error occurs or if the database update fails.
 * @throws {Error} If an error occurs during the credential generation or the database update or sending the direct message.
 */
const generateCredentials = async (type: credentialTypes, pubkey :string, returnHashed: boolean = false, sendDM : boolean = false, onlyGenerate : boolean = false): Promise<string> => {
    try {

		if (onlyGenerate) return await hashString(crypto.randomBytes(20).toString('hex'), type);

		if (pubkey === undefined || pubkey === "") {return "";}

		if (pubkey.startsWith("npub")) {
			pubkey = await dbSelect("SELECT hex FROM registered WHERE pubkey = ?", "hex", [pubkey]) as string;
		}

		let credential : string = "";
		type == 'otc'? credential = Math.floor(100000 + Math.random() * 900000).toString() : credential = crypto.randomBytes(20).toString('hex');
		if ( type == 'authkey') credential = 'Auth' + credential;
		const hashedCredential = await hashString(credential, type);
		const whereField : string = type == 'otc' || type === 'authkey'? "authkey" : "password";
		const update = await dbUpdate("registered", whereField, hashedCredential, ["hex"], [pubkey]);
		if (update){
			logger.debug("New credential generated and saved to database");
			if ((type == 'password' || type == 'otc') && pubkey != "" && sendDM){
				let message = type == 'otc'? 'Your one-time code: ' : 'Your new password: ';
				let DM = await sendMessage(message ,pubkey);
				DM = await sendMessage(credential,pubkey);	
				if (!DM) {
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
		return {status: "error", message: "Apikey not found", pubkey:"", authkey:"", kind: 0};
	}

	// We only allow server apikey for uploadMedia endpoint
	const serverApikey = await dbSelect("SELECT apikey FROM registered WHERE username = ?", "apikey", ["public"]);
	const hexApikey = await dbSelect(
		(endpoint != "uploadmedia" && endpoint != "getMediaStatusbyID")
			? "SELECT hex FROM registered WHERE apikey = ? and apikey <> ?"
			: "SELECT hex FROM registered WHERE apikey = ?",
		"hex",
		endpoint != "Uploadmedia" ? [apikey, serverApikey] : [apikey.toString()]
	) as string;

	if (hexApikey === "" || hexApikey === undefined) {
		if (serverApikey){
			logger.warn("RES -> 401 unauthorized - Apikey not authorized for this action", "|", req.socket.remoteAddress);
			return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:"", kind: 0};
		}
		logger.warn("RES -> 401 unauthorized - Apikey not found", "|", req.socket.remoteAddress);
		return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:"", kind: 0};
	}

	if (checkAdminPrivileges) {
		const admin = await dbSelect("SELECT allowed FROM registered WHERE hex = ?", "allowed", [hexApikey]) as string;
		if (admin === "0") {
			logger.warn("RES -> 403 forbidden - Apikey does not have admin privileges", "|", req.socket.remoteAddress);
			return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:"", kind: 0};
		}
	}

	const result: authHeaderResult = {
		status: "success",
		message: "Apikey is valid",
		pubkey: hexApikey,
		authkey: "",
		kind: 0
	};
	return result;
};

export { isPubkeyValid, isUserPasswordValid, isApikeyValid, isAuthkeyValid, generateCredentials, parseAuthHeader };