import { dbSelect, dbUpdate } from "../lib/database.js";
import { logger } from "./logger.js";
import { credentialTypes, isAuthkeyValidResult } from "../interfaces/admin.js";
import { registeredTableFields } from "../interfaces/database.js";
import { hashString, validateHash } from "./hash.js";
import { Request } from "express";
import { verifyNIP07login } from "./nostr/NIP07.js";
import crypto from "crypto";
import { sendMessage } from "./nostr/NIP04.js";
import { VerifyResultMessage } from "../interfaces/verify.js";
import { isNIP98Valid } from "./nostr/NIP98.js";
import { Event } from "nostr-tools";



/**
 * Parses the authorization header and checks if it is valid. (apikey, authkey, or NIP98 event)
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const parseAuthEvent = async (req: Request, endpoint: string = ""): Promise<VerifyResultMessage> => {

	// Check if apikey is present on request body instead of NIP98 authorization header.
	if (req.query.apikey || req.body.apikey) {
		 
		const hexApikey = await isApikeyValid(req, endpoint);
		const result: VerifyResultMessage = {
			status: hexApikey ? "success" : "error",
			message: hexApikey ? "Apikey is valid" : "Apikey is not valid",
			pubkey: "",
			authkey: ""
		};
		return result;
	}

	//Check if request has authorization header
	if (req.headers.authorization === undefined) {
		logger.warn(
			"RES -> 400 Bad request - Authorization header not found",
			"|",
			req.socket.remoteAddress
		);
		const result: VerifyResultMessage = {
			status: "error",
			message: "Authorization header not found",
			pubkey: "",
			authkey: ""
		};

		return result;
	}

	// Remove string "Bearer" from header if exist.
	if (req.headers.authorization.startsWith('Bearer ')) {
		req.headers.authorization = req.headers.authorization.split(' ')[1];
	} 

	// Check if req.headers.authorization startsWith 'Auth'. Check if authkey is present on the header authorization Bearer and validate it.
	if (!req.headers.authorization.startsWith('Auth')) {
		const authorized = await isAuthkeyValid(req);
		const result: isAuthkeyValidResult = {
		status: authorized.status,
		message: authorized.message,
		pubkey: authorized.pubkey,
		authkey: authorized.authkey
		};
		return result;
	}

	//Check if authorization header NIP98 event is valid
	let authevent: Event;
	logger.debug("Parsing authorization header", req.headers.authorization, "|", req.socket.remoteAddress);
	try {
		authevent = JSON.parse(
			Buffer.from(
				req.headers.authorization,
				"base64"
			).toString("utf8")
		);
	} catch (error) {

		logger.warn(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: VerifyResultMessage = {
			status: "error",
			message: "Malformed authorization header",
			pubkey: "",
			authkey: ""
		};

		return result;
	}

	//Check if event authorization content is valid, check NIP98 documentation for more info: https://github.com/v0l/nips/blob/nip98/98.md
	const IsAuthEventValid = await isNIP98Valid(authevent, req);
	if (IsAuthEventValid.status !== "success") {
		logger.warn(
			`RES -> 400 Bad request - ${IsAuthEventValid.message}`,
			"|",
			req.socket.remoteAddress
		);
		const result: VerifyResultMessage = {
			status: "error",
			message: "Authorization header is invalid",
			pubkey: "",
			authkey:""
		};

		return result;
	}

	const result: VerifyResultMessage = {
		status: "success",
		message: "Authorization header is valid",
		pubkey: authevent.pubkey,
		authkey: ""
	};

	return result;
};

/**
 * Validates a public key by checking if it exists in the registered table of the database. 
 * Optionally checks if the public key has admin privileges.
 * @param {Request} req - The request object, which should contain the public key in the body or session.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is valid and, if checkAdminPrivileges is true, whether it has admin privileges. Returns false if an error occurs, if the public key is not provided, or if it does not exist in the registered table.
 */
const isPubkeyValid = async (req: Request): Promise<boolean> => {

	if (!req.body.pubkey && !req.session.identifier) {
		logger.warn("No pubkey provided");
		return false;
	}

	const pubkey = req.body.pubkey || req.session.identifier;
	logger.info("Checking if pubkey is allowed ->", pubkey)

    try{

		const result = await dbSelect("SELECT hex FROM registered WHERE hex = ?", "hex", [pubkey], registeredTableFields)
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
const isAuthkeyValid = async (req: Request) : Promise<isAuthkeyValidResult> =>{

	if (!req.headers.authorization) {
		logger.warn("Unauthorized request, no authorization header");
		return {status: "error", message: "Unauthorized", authkey: "", pubkey:""};
	}
	let token;
	if (req.headers.authorization.startsWith('Bearer ')) {
		// Remove "Bearer " from string
		token = req.headers.authorization.split(' ')[1];
	} else {
		token = req.headers.authorization;
	}
	const hashedAuthkey = await hashString(token, 'authkey');
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
			logger.error("Failed to generate authkey for", req.session.identifier);
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
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const isApikeyValid = async (req: Request, endpoint: string = ""): Promise<boolean> => {
	let apikey = req.query.apikey || req.body.apikey;

	if (!apikey) {
		logger.warn("RES -> 400 Bad request - Apikey not found", "|", req.socket.remoteAddress);
		return false;
	}

	logger.debug("Checking apikey", apikey, "|", req.socket.remoteAddress);

	// We only allow server apikey for uploadMedia endpoint
	const serverApikey = await dbSelect("SELECT apikey FROM registered WHERE username = ?", "apikey", ["public"], registeredTableFields);
	const hexApikey : string = await dbSelect(
		endpoint != "Uploadmedia"
			? "SELECT hex FROM registered WHERE apikey = ? and apikey <> ?"
			: "SELECT hex FROM registered WHERE apikey = ?",
		"hex",
		endpoint != "Uploadmedia" ? [apikey, serverApikey] : [apikey.toString()],
		registeredTableFields
	);

	logger.debug("Apikey found, setting pubkey = " + hexApikey, "|")
	if (hexApikey === "") {
		logger.warn("RES -> 401 unauthorized - Apikey not found", "|", req.socket.remoteAddress);
		return false;
	}

	logger.warn("Apikey found, setting pubkey = " + hexApikey, "|", req.socket.remoteAddress);
	return true;
};

export { isPubkeyValid, isUserPasswordValid, isApikeyValid, isAuthkeyValid, generateCredentials, parseAuthEvent };