import { Request } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Event } from "nostr-tools";

import { dbMultiSelect, dbSelect, dbUpdate } from "./database/core.js";
import { logger } from "./logger.js";
import { authHeaderResult } from "../interfaces/authorization.js";
import { hashString, validateHash } from "./hash.js";
import { sendMessage } from "./nostr/NIP04.js";
import { isNIP98Valid } from "./nostr/NIP98.js";
import { isBUD01AuthValid } from "./blossom/BUD01.js";
import { NIPKinds } from "../interfaces/nostr.js";
import { BUDKinds } from "../interfaces/blossom.js";
import { isEntityBanned } from "./security/banned.js";
import { getClientInfo } from "./security/ips.js";
import { npubToHex } from "./nostr/NIP19.js";
import { getConfig } from "./config/core.js";
import { initRedis } from "./redis/client.js";

const redisCore = await initRedis(0, false);

/**
 * Parses the authorization header and checks if it is valid. (Authkey, NIP98 or BUD01)
 * Always check if the header's pubkey is banned.
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @param checkAdminPrivileges - A boolean indicating whether to check if the header's pubkey has admin privileges.
 * @param checkRegistered - A boolean indicating whether to check if the header's pubkey is registered.
 * @param checkActive - A boolean indicating whether to check if the header's pubkey is active.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const parseAuthHeader = async (req: Request, endpoint: string = "", checkAdminPrivileges : boolean, checkRegistered : boolean, checkActive : boolean): Promise<authHeaderResult> => {

	// Authkey. Cookie bearer token
	if (req.cookies && req.cookies.authkey && checkRegistered) {
		logger.debug(`parseAuthHeader - authkey found in cookie: ${req.cookies.authkey}`, "|", getClientInfo(req).ip);
        return await isAuthkeyValid(req.cookies.authkey, checkAdminPrivileges); 
    }

	//Check if request has authorization header.
	if (req.headers.authorization === undefined) {
		if(endpoint != 'getMediaByURL' && endpoint != 'list' && endpoint != 'getMediaStatusbyID' && endpoint != 'registerUsername'){
			logger.warn(`parseAuthHeader - Authorization header not found, endpoint: ${endpoint}, URL: ${req.url}`, "|", getClientInfo(req).ip);
		} 
		return {status: "error", message: "Authorization header not found", pubkey:"", authkey:"", kind: 0};
	}

	// NIP98 or BUD01. Nostr / Blossom token
	if (req.headers.authorization.startsWith('Nostr ')) {
		let authevent: Event;
		logger.debug(`parseAuthHeader - NIP98 / BUD01 found on request: ${req.headers.authorization}`, "|", getClientInfo(req).ip);
		try {
			authevent = JSON.parse(
				Buffer.from(
					req.headers.authorization.split(' ')[1],
					"base64"
				).toString("utf8")
			);

			// Check NIP98 / BUD01
			if (authevent.kind == BUDKinds.BUD01_auth) {
				return await isBUD01AuthValid(authevent, req, endpoint, checkAdminPrivileges, checkRegistered, checkActive);
			}

			if (authevent.kind == NIPKinds.NIP98){
				return await isNIP98Valid(authevent, req, checkAdminPrivileges, checkRegistered, checkActive);
			}

		} catch (error) {
			logger.warn(`parseAuthHeader - 400 Bad request - ${error}`, "|", getClientInfo(req).ip);
			return {status: "error", message: "Malformed authorization header", pubkey:"", authkey : "", kind: 0};
		}
		
	}
	
	// If none of the above, return error
	logger.warn(`parseAuthHeader - Authorization header not found`, "|", getClientInfo(req).ip);
	return {status: "error", message: "Authorization header not found", pubkey:"", authkey:"", kind: 0};

};

/**
 * Validates a public key by checking if it exists in the registered table of the database. If it is active and not banned.
 * Optionally checks if the public key has admin privileges.
 * @param {string} pubkey - The public key to validate.
 * @param {boolean} [checkAdminPrivileges=false] - A boolean indicating whether to check if the public key has admin privileges. Optional.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is valid and, if checkAdminPrivileges is true, whether it has admin privileges. Returns false if an error occurs, if the public key is not provided, or if it does not exist in the registered table.
 */
const isPubkeyValid = async (pubkey: string, checkAdminPrivileges = false, checkRegistered = true, checkActive = true): Promise<boolean> => {

	if (pubkey === undefined || pubkey === "") {return false;}

	if (await isPubkeyRegistered(pubkey) == false) {
		logger.debug(`isPubkeyValid - Pubkey not registered: ${pubkey}`);
		return checkRegistered? false : true
	}
	if (await isPubkeyBanned(pubkey) == true) {
		logger.debug(`isPubkeyValid - Pubkey is banned: ${pubkey}`);
		return false;
	}
	if (checkActive && await isPubkeyActive(pubkey) == false) {
		logger.debug(`isPubkeyValid - Pubkey is not active: ${pubkey}`);
		return false;
	}
	if (checkAdminPrivileges && await isPubkeyAllowed(pubkey) == false) {
		logger.debug(`isPubkeyValid - Pubkey is not allowed: ${pubkey}`);
		return false;}

	return true;
}


/**
 * Validates a public key by checking if it exists in the registered table of the database.
 * @param {string} pubkey - The public key to validate.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is registered. Returns false if an error occurs.
 */
const isPubkeyRegistered = async (pubkey: string): Promise<boolean> => {
	if (!pubkey) {return false}
	const pubkeyData = await dbMultiSelect(["id"], "registered", "hex = ?", [pubkey], true);
	if (pubkeyData.length == 0) {return false;}
	return true;
}

/**
 * Validates a public key by checking if it is active.
 * @param {string} pubkey - The public key to validate.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is active. Returns false if an error occurs.
 */
const isPubkeyActive = async (pubkey: string): Promise<boolean> => {
	if (!pubkey) {return false}
	const pubkeyData = await dbMultiSelect(["active"], "registered", "hex = ?", [pubkey], true);
	if (pubkeyData.length == 0) {return false;}
	if (pubkeyData[0].active == 0) {return false;}
	return true;
}

/**
 * Validates a public key by checking if it is allowed. (Admin privileges)
 * @param {string} pubkey - The public key to validate.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is allowed. Returns false if an error occurs.
 */
const isPubkeyAllowed = async (pubkey: string): Promise<boolean> => {
	if (!pubkey) {return false}
	const pubkeyData = await dbMultiSelect(["allowed"], "registered", "hex = ?", [pubkey], true);
	if (pubkeyData.length == 0) {return false;}
	if (pubkeyData[0].allowed == 0) {return false;}
	return true;
}

/**
 * Validates a public key by checking if it is banned.
 * @param {string} pubkey - The public key to validate.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the public key is banned. Returns true if an error occurs.
 */
const isPubkeyBanned = async (pubkey: string): Promise<boolean> => {
	if (!pubkey) {return false}
	const pubkeyData = await dbMultiSelect(["id"], "registered", "hex = ?", [pubkey], true);
	if (pubkeyData.length == 0) {return false;}
	if (await isEntityBanned(pubkeyData[0].id, "registered")) {return true;}
	return false;
}

/**
 * Validates a user's password by comparing it with the hashed password stored in the database.
 * @param {string} username - The username of the user.
 * @param {string} password - The password provided by the user to be validated.
 * @param {boolean} [checkAdminPrivileges=true] - A boolean indicating whether to check if the user has admin privileges. Optional, default is true.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the provided password matches the hashed password stored in the database for the given username. Returns false if an error occurs.
 */
const isUserPasswordValid = async (username:string, password:string, checkAdminPrivileges = true ): Promise<boolean> => {

	const pubkey = await dbSelect("SELECT hex FROM registered WHERE username = ?", "hex", [username]) as string;
	if (await isPubkeyRegistered(pubkey) == false) {return false;}
	if (await isPubkeyBanned(pubkey) == true) {return false;}
	if (await isPubkeyActive(pubkey) == false) {return false;}
	if (checkAdminPrivileges && await isPubkeyAllowed(pubkey) == false) {return false;}

	const userDBPassword = await dbSelect("SELECT password FROM registered WHERE username = ?", 
							"password", 
							[username]) as string;

	return (await validateHash(password, userDBPassword));
	
};


/**
 * Verifies the authorization of a request by checking the provided authorization key.
 * @param {string} authString - The authorization key to verify.
 * @param {boolean} [checkAdminPrivileges=true] - A boolean indicating whether to check if the authorization key has admin privileges. Optional, default is true.
 * @returns {Promise<checkAuthkeyResult>} The result of the authorization check, including the status, a message, and the new authkey if the check was successful.
 */
const isAuthkeyValid = async (authString: string, checkAdminPrivileges: boolean = true, checkActive: boolean = true): Promise<authHeaderResult> => {
    if (!authString) {
		logger.warn(`isAuthkeyValid - Unauthorized request, no authorization header`);
        return { status: "error", message: "Unauthorized", authkey: "", pubkey: "", kind: 0 };
    }

    try {
		const decoded = jwt.verify(authString, getConfig(null, ["session", "secret"])) as { identifier: string, allowed: boolean, exp: number };
		if ((decoded.exp - Math.floor(Date.now() / 1000)) < 900){
			authString = generateAuthToken(decoded.identifier, decoded.allowed);
		} 

		if (checkActive && await isPubkeyActive(decoded.identifier) == false) {
			logger.warn(`isAuthkeyValid - Unauthorized request, user is not active. Authkey: ${authString}`);
			return { status: "error", message: "Unauthorized", authkey: "", pubkey: "", kind: 0 };
		}

        if (checkAdminPrivileges && !decoded.allowed) {
			logger.warn(`isAuthkeyValid - Unauthorized request, insufficient privileges. Authkey: ${authString}`);
            return { status: "error", message: "Unauthorized", authkey: "", pubkey: "", kind: 0 };
        }

        return {
            status: "success",
            message: "Authorized",
            authkey: authString,
            pubkey: decoded.identifier,
            kind: 0
        };

    } catch (error) {
		if (error instanceof Error && error.name === 'TokenExpiredError') {
			logger.warn(`isAuthkeyValid - Unauthorized request, token expired. Authkey: ${authString}`);
            return { status: "error", message: "Token expired", authkey: "", pubkey: "", kind: 0 };
        } else {
			logger.warn(`isAuthkeyValid - Unauthorized request, invalid token. Authkey: ${authString}`);
            return { status: "error", message: "Invalid token", authkey: "", pubkey: "", kind: 0 };
        }
    }
};

/**
 * Generates and saves a new password of the specified type to the database.
 * If a public key is provided and direct messaging is indicated, 
 * the new password will be sent to the provided public key.
 *
 * @param {string} [pubkey=""] - The public key to which to send the new password. Optional.
 * @param {boolean} [returnHashed=false] - Returns the hashed password instead of the plain text. Optional.
 * @param {boolean} [sendDM=false] - Indicates whether to send a direct message with the new password. Optional.
 * @param {boolean} [onlyGenerate=false] - Indicates whether to only generate the password without saving it to the database and sending a DM. Optional.
 * @returns {Promise<string>} The newly generated password, or an empty string if an error occurs or if the database update fails.
 * @throws {Error} If an error occurs during the password generation or the database update or sending the direct message.
 */
const generatePassword = async (tenant: string, pubkey :string, returnHashed: boolean = false, sendDM : boolean = false, onlyGenerate : boolean = false, checkActive : boolean = true): Promise<string> => {
    try {

		if (onlyGenerate) {
			if (returnHashed) return await hashString(crypto.randomBytes(20).toString('hex'), 'password');
			return crypto.randomBytes(20).toString('hex');
		}

		if (pubkey === undefined || pubkey === "") {return "";}

		if (pubkey.startsWith("npub")) pubkey = await dbSelect("SELECT hex FROM registered WHERE pubkey = ?", "hex", [pubkey]) as string;

		if (await isPubkeyValid(pubkey,false,true,checkActive) == false) {return "";}

		const credential = crypto.randomBytes(13).toString('hex');
		const hashedCredential = await hashString(credential, 'password');
		const update = await dbUpdate("registered", {"password" : hashedCredential}, ["hex"], [pubkey]);
		if (update){
			logger.debug(`generatePassword - New password generated and saved to database`);
			if (pubkey != "" && sendDM){
				const DM = await sendMessage(`Your new password: ${credential}`, pubkey, tenant);
				if (!DM) return "";			}
			if (returnHashed) return hashedCredential;
			return credential;
		}
		return "";
    } catch (error) {
		logger.error(`generatePassword - Internal server error: ${error}`);
        return "";
    }
}


/**
* Generates and saves a new OTC code to redis and sends it to the provided public key.
* @param {string} pubkey - The public key to which to send the OTC code.
* @returns {Promise<string>} The newly generated OTC code, or an empty string if an error occurs or if the database update fails.
*/
const generateOTC = async (tenant: string, pubkey: string) : Promise<boolean> => {

	if (pubkey === undefined || pubkey === "") {return false;}
	if (pubkey.startsWith("npub")) pubkey = await npubToHex(pubkey);
	if (pubkey.length != 64) {return false;}

    const otc = Math.floor(100000 + Math.random() * 900000).toString()
	const hashedOTC = await hashString(otc, 'otc');
	
	await redisCore.set(`otc:${hashedOTC}`, JSON.stringify({ pubkey }), { EX: 300 });
	const DM = await sendMessage(`Your one-time code: ${otc}`, pubkey, tenant);
	if(!DM) return false;

    return true;

};

/**
 * Verifies the OTC code of a user.
 * @param {string} otc - The one-time code to verify.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the OTC code is valid. Returns false if an error occurs.
 */
const verifyOTC = async (otc: string): Promise<string> => {

    const hashedOTC = await hashString(otc, 'otc');
    const storedData = await redisCore.get(`otc:${hashedOTC}`);
    
    if (!storedData) return "";

	const { pubkey } = JSON.parse(storedData);
    await redisCore.del(`otc:${hashedOTC}`);
    return pubkey;
}

const generateAuthToken = (identifier: string, allowed: boolean): string => {
    const secretKey = getConfig(null, ["session", "secret"]);
    const expiresIn = getConfig(null, ["session", "maxAge"]) /1000;
	

    return jwt.sign(
        { identifier, allowed }, 
        secretKey,
        { expiresIn }
    );
};

export { 	isPubkeyValid, 
			isPubkeyRegistered, 
			isPubkeyAllowed,
			isUserPasswordValid, 
			isAuthkeyValid, 
			generatePassword,
			generateOTC,
			verifyOTC, 
			parseAuthHeader,
			generateAuthToken 
};