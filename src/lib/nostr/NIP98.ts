import crypto from "crypto";
import { Request } from "express";
import { Event } from "nostr-tools";
import config from "config";
import { logger } from "../../lib/logger.js";
import { VerifyResultMessage } from "../../interfaces/verify.js";
import { ResultMessage } from "../../interfaces/server.js";

import { NIPKinds } from "../../interfaces/nostr.js";
import { connect, dbSelect } from "../../lib/database.js";
import app from "../../app.js";
import { registeredTableFields } from "../../interfaces/database.js";

//https://github.com/nostr-protocol/nips/blob/master/98.md

/**
 * Parses the authorization header and checks if it is valid.
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const ParseAuthEvent = async (req: Request, endpoint:string = ""): Promise<VerifyResultMessage> => {

	//v0 compatibility, check if apikey is present on request body instead of NIP98 authorization header.
	if (req.query.apikey || req.body.apikey) {
		 
		const hexApikey = await CheckApiKey(req, endpoint);
		const result: VerifyResultMessage = {
			pubkey: "",
			result: hexApikey ? true : false,
			description: hexApikey ? "Apikey is valid" : "Apikey is not valid",
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
			pubkey: "",
			result: false,
			description: "Authorization header not found",
		};

		return result;
	}

	//Create authevent object from authorization header
	let authevent: Event;
	logger.debug("Parsing authorization header", req.headers.authorization, "|", req.socket.remoteAddress);
	try {
		let token : string;
		if (req.headers.authorization.startsWith('Bearer ')) {
			token = req.headers.authorization.split(' ')[1];
		} else {
			token = req.headers.authorization;
		}
		authevent = JSON.parse(
			Buffer.from(
				token,
				"base64"
			).toString("utf8")
		);
	} catch (error) {
		logger.warn(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: VerifyResultMessage = {
			pubkey: "",
			result: false,
			description: "Malformed authorization header",
		};

		return result;
	}

	//Check if event authorization content is valid, check NIP98 documentation for more info: https://github.com/v0l/nips/blob/nip98/98.md
	const IsAuthEventValid = await CheckAuthEvent(authevent, req);
	if (!IsAuthEventValid.result) {
		logger.warn(
			`RES -> 400 Bad request - ${IsAuthEventValid.description}`,
			"|",
			req.socket.remoteAddress
		);
		const result: VerifyResultMessage = {
			pubkey: "",
			result: false,
			description: "Authorization header is invalid",
		};

		return result;
	}

	const result: VerifyResultMessage = {
		pubkey: authevent.pubkey,
		result: true,
		description: "Authorization header is valid",
	};

	return result;
};

export { ParseAuthEvent };

const CheckAuthEvent = async (authevent: Event, req: Request): Promise<ResultMessage> => {
	//Check if event authorization kind is valid (Must be 27235)
	try {
		const eventkind: number = +authevent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != NIPKinds.NIP98) {
			logger.warn(
				"RES -> 400 Bad request - Auth header event kind is not 27235",
				"|",
				req.socket.remoteAddress
			);
			const result: ResultMessage = {
				result: false,
				description: "Auth header event kind is not 27235 ",
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "Auth header event kind is not 27235",
		};

		return result;
	}

	//Check if created_at is within a reasonable time window (60 seconds)
	try {
		let created_at = authevent.created_at;
		const now = Math.floor(Date.now() / 1000);
		if (config.get("environment")  == "development") {
			logger.warn("DEVMODE: Setting created_at to now", "|", req.socket.remoteAddress);
			created_at = now - 30;
		} //If devmode is true, set created_at to now for testing purposes
		const diff = now - created_at;
		if (diff > 60) {
			logger.warn(
				"RES -> 400 Bad request - Auth header event created_at is not within a reasonable time window",
				"|",
				req.socket.remoteAddress
			);
			const result: ResultMessage = {
				result: false,
				description: `Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`,
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "Auth header event created_at is not within a reasonable time window",
		};

		return result;
	}

	//Check if event authorization u tag (URL) is valid (Must be the same as the server endpoint)
	try {
		let AuthEventEndpoint = authevent.tags[0][1];
		const ServerEndpoint = `${req.protocol}://${req.headers.host}${req.url}`;
		if (config.get("environment") == "development") {
			logger.warn("DEVMODE: Setting 'u'(url) tag same as the endpoint URL", "|", req.socket.remoteAddress);
			AuthEventEndpoint = ServerEndpoint;
		} //If devmode is true, set created_at to now for testing purposes
	
		if (
			AuthEventEndpoint == null ||
			AuthEventEndpoint == undefined ||
			AuthEventEndpoint != ServerEndpoint
		) {
			logger.warn(
				"RES -> 400 Bad request - Auth header event endpoint is not valid",
				"|",
				req.socket.remoteAddress
			);
			const result: ResultMessage = {
				result: false,
				description: `Auth header event endpoint is not valid: ${AuthEventEndpoint} <> ${ServerEndpoint}`,
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "Auth header event endpoint is not valid",
		};

		return result;
	}

	//Check if authorization event method tag is valid (Must be the same as the request method)
	try {
		const method = authevent.tags[1][1];
		const receivedmethod = req.method;
		if (method == null || method == undefined || method != receivedmethod) {
			logger.warn(
				"RES -> 400 Bad request - Auth header event method is not valid:",
				receivedmethod,
				"<>",
				method,
				"|",
				req.socket.remoteAddress
			);
			const result: ResultMessage = {
				result: false,
				description: `Auth header event method is not valid`,
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "Auth header event method is not valid",
		};

		return result;
	}

	//Check if the request has a body and authorization event payload tag exist. (!GET)
	if (req.body.constructor === Object && Object.keys(req.body).length != 0 && req.method != "GET") {
		try {
			const payload = authevent.tags[2][1];
			if (!payload) {
				logger.warn(
					"RES -> 400 Bad request - Auth header event payload not exist",
					"|",
					req.socket.remoteAddress
				);
				const result: ResultMessage = {
					result: false,
					description: `Auth header event payload is not valid`,
				};

				return result;
			}
		} catch (error) {
			logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			const result: ResultMessage = {
				result: false,
				description: "Auth header event payload is not valid",
			};

			return result;
		}
	}

	//Check if authorization event payload tag is valid (must be equal than the request body sha256) (!GET)
	if (req.method != "GET") {
		try {

			let payload = authevent.tags[2][1];

			const receivedpayload = crypto
				.createHash("sha256")
				.update(JSON.stringify(req.body), "binary")
				.digest("hex"); //TODO CHECK IF THIS HASH IS CORRECT!! (Only is hashing the body without the file data.)

			if (config.get("environment") == "development") {
				logger.warn("DEVMODE: Bypassing payload hash validation", "|", req.socket.remoteAddress);
				payload = receivedpayload;
			} //If devmode is true, set the payload = receivedpayload for testing purposes

			if (payload != receivedpayload) {
				logger.warn(
					"RES -> 400 Bad request - Auth header event payload is not valid:",
					receivedpayload,
					" <> ",
					payload,
					"|",
					req.socket.remoteAddress
				);
				const result: ResultMessage = {
					result: false,
					description: `Auth header event payload is not valid`,
				};

				return result;
			}
		} catch (error) {
			logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			const result: ResultMessage = {
				result: false,
				description: "Auth header event payload is not valid",
			};

			return result;
		}
	}

	return { result: true, description: "Auth header event is valid" };
};

/**
 * Checks if the request has a valid apikey.
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */
const CheckApiKey = async (req: Request, endpoint: string = ""): Promise<boolean> => {
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
