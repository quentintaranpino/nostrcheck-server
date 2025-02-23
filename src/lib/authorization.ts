import { dbMultiSelect, dbSelect, dbUpdate } from "../lib/database.js";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";
import { authHeaderResult } from "../interfaces/authorization.js";
import { hashString, validateHash } from "./hash.js";
import { Request } from "express";
import crypto from "crypto";
import { sendMessage } from "./nostr/NIP04.js";
import { isNIP98Valid } from "./nostr/NIP98.js";
import { Event } from "nostr-tools";
import { isBUD01AuthValid } from "./blossom/BUD01.js";
import { NIPKinds } from "../interfaces/nostr.js";
import { BUDKinds } from "../interfaces/blossom.js";
import { isContentBanned } from "./banned.js";
import { getClientIp } from "./utils.js";
import app from "../app.js";
import { getActiveStatusFromRedis, redisClient } from "./redis.js";
import { npubToHex } from "./nostr/NIP19.js";


/**
 * Parses the authorization header and checks if it is valid. (apikey, authkey, or NIP98 event)
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @param checkAdminPrivileges - A boolean indicating whether to check if the apikey has admin privileges. Optional.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const parseAuthHeader = async (req: Request, endpoint: string = "", checkAdminPrivileges = true): Promise<authHeaderResult> => {

	// Apikey. Will be deprecated on 0.7.0
	if (req.query.apikey || req.body?.apikey?.length > 0) {
		logger.debug("Apikey found on request", req.query.apikey || req.body.apikey, "|", getClientIp(req))
		return await isApikeyValid(req, endpoint, checkAdminPrivileges);
	}

	// Authkey. Cookie bearer token
	if (req.cookies && req.cookies.authkey) {
        logger.debug("authkey found in cookie: ", req.cookies.authkey, "|", getClientIp(req));
        return await isAuthkeyValid(req.cookies.authkey, checkAdminPrivileges); 
    }

	//Check if request has authorization header.
	if (req.headers.authorization === undefined) {
		if(endpoint != 'getMediaByURL' && endpoint != 'list' && endpoint != 'getMediaStatusbyID') logger.warn(`Authorization header not found- Enpoint: ${endpoint} | URL: ${req.url} | ${getClientIp(req)}`);
		return {status: "error", message: "Authorization header not found", pubkey:"", authkey:"", kind: 0};
	}

	// NIP98 or BUD01. Nostr / Blossom token
	if (req.headers.authorization.startsWith('Nostr ')) {
		let authevent: Event;
		logger.debug("NIP98 / BUD01 found on request", req.headers.authorization, "|", getClientIp(req));
		try {
			authevent = JSON.parse(
				Buffer.from(
					req.headers.authorization.split(' ')[1],
					"base64"
				).toString("utf8")
			);

			// Check NIP98 / BUD01
			if (authevent.kind == BUDKinds.BUD01_auth) {
				return await isBUD01AuthValid(authevent, req, endpoint, checkAdminPrivileges);
			}

			if (authevent.kind == NIPKinds.NIP98){
				return await isNIP98Valid(authevent, req, checkAdminPrivileges);
			}

		} catch (error) {
			logger.warn(`RES -> 400 Bad request - ${error}`, "|", getClientIp(req));
			return {status: "error", message: "Malformed authorization header", pubkey:"", authkey : "", kind: 0};
		}
		
	}
	
	// If none of the above, return error
	logger.warn("RES -> 400 Bad request - Authorization header not found", "|", getClientIp(req));
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
		logger.debug("Pubkey not registered", pubkey);
		return checkRegistered? false : true
	}
	if (await isPubkeyBanned(pubkey) == true) {
		logger.debug("Pubkey is banned", pubkey);
		return false;
	}
	if (checkActive && await isPubkeyActive(pubkey) == false) {
		logger.debug("Pubkey is not active", pubkey);
		return false;
	}
	if (checkAdminPrivileges && await isPubkeyAllowed(pubkey) == false) {
		logger.debug("Pubkey is not allowed", pubkey);
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
	if (await isContentBanned(pubkeyData[0].id, "registered")) {return true;}
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
        logger.warn("Unauthorized request, no authorization header");
        return { status: "error", message: "Unauthorized", authkey: "", pubkey: "", kind: 0 };
    }

    try {
        const decoded = jwt.verify(authString, app.get("config.session")["secret"]) as { identifier: string, allowed: boolean, exp: number };
		if ((decoded.exp - Math.floor(Date.now() / 1000)) < 900){
			authString = generateAuthToken(decoded.identifier, decoded.allowed);
		} 

        if (checkActive) {
            const isActive = await getActiveStatusFromRedis(decoded.identifier);
            if (!isActive) {
                logger.warn(`Unauthorized request, user not active. Authkey: ${authString}`);
                return { status: "error", message: "User not active", authkey: "", pubkey: "", kind: 0 };
            }
        }

        if (checkAdminPrivileges && !decoded.allowed) {
            logger.warn(`Unauthorized request, insufficient privileges. Authkey: ${authString}`);
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
            logger.warn("Unauthorized request, token expired");
            return { status: "error", message: "Token expired", authkey: "", pubkey: "", kind: 0 };
        } else {
            logger.warn("Unauthorized request, invalid token");
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
const generatePassword = async (pubkey :string, returnHashed: boolean = false, sendDM : boolean = false, onlyGenerate : boolean = false, checkActive : boolean = true): Promise<string> => {
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
		const update = await dbUpdate("registered", "password", hashedCredential, ["hex"], [pubkey]);
		if (update){
			logger.debug("New credential generated and saved to database");
			if (pubkey != "" && sendDM){
				const DM = await sendMessage(`Your new password: ${credential}`, pubkey);
				if (!DM) return "";			}
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
* Generates and saves a new OTC code to redis and sends it to the provided public key.
* @param {string} pubkey - The public key to which to send the OTC code.
* @returns {Promise<string>} The newly generated OTC code, or an empty string if an error occurs or if the database update fails.
*/
const generateOTC = async (pubkey: string) : Promise<boolean> => {

	if (pubkey === undefined || pubkey === "") {return false;}

	if (pubkey.startsWith("npub")) pubkey = await npubToHex(pubkey);

	if (pubkey.length != 64) {return false;}

    const otc = Math.floor(100000 + Math.random() * 900000).toString()
	const hashedOTC = await hashString(otc, 'otc');
	
	await redisClient.set(`otc:${hashedOTC}`, JSON.stringify({ pubkey }), { EX: 300 });
	const DM = await sendMessage(`Your one-time code: ${otc}`, pubkey);
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
    const storedData = await redisClient.get(`otc:${hashedOTC}`);
    
    if (!storedData) return "";

	const { pubkey } = JSON.parse(storedData);
    await redisClient.del(`otc:${hashedOTC}`);
    return pubkey;
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

	const apikey = req.query.apikey || req.body.apikey;
	if (!apikey) {
		logger.warn("RES -> 400 Bad request - Apikey not found", "|", getClientIp(req));
		return {status: "error", message: "Apikey not found", pubkey:"", authkey:"", kind: 0};
	}

	// We only allow server apikey for uploadMedia endpoint
	const serverApikey = await dbSelect("SELECT apikey FROM registered WHERE username = ?", "apikey", ["public"]);
	const hexApikey = await dbSelect(
		(endpoint != "upload" && endpoint != "getMediaStatusbyID")
			? "SELECT hex FROM registered WHERE apikey = ? and apikey <> ?"
			: "SELECT hex FROM registered WHERE apikey = ?",
		"hex",
		endpoint != "upload" ? [apikey, serverApikey] : [apikey.toString()]
	) as string;

	if (hexApikey === "" || hexApikey === undefined) {
		if (serverApikey){
			logger.warn("RES -> 401 unauthorized - Apikey not authorized for this action", "|", getClientIp(req));
			return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:"", kind: 0};
		}
		logger.warn("RES -> 401 unauthorized - Apikey not found", "|", getClientIp(req));
		return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:"", kind: 0};
	}

	if (await isPubkeyValid(hexApikey, checkAdminPrivileges) == false){
		logger.warn("RES -> 401 unauthorized - Apikey not authorized for this action", "|", getClientIp(req));
		return {status: "error", message: "Apikey not authorized for this action", pubkey:"", authkey:"", kind: 0};
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

const generateAuthToken = (identifier: string, allowed: boolean): string => {
    const secretKey = app.get("config.session")["secret"];
    const expiresIn = app.get("config.session")["maxAge"];

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
			isApikeyValid, 
			isAuthkeyValid, 
			generatePassword,
			generateOTC,
			verifyOTC, 
			parseAuthHeader,
			generateAuthToken };