import crypto from "crypto";
import { Request } from "express";
import { Event } from "nostr-tools";
import config from "config";
import { logger } from "../../lib/logger.js";
import { ResultMessagev2 } from "../../interfaces/server.js";
import { NIPKinds } from "../../interfaces/nostr.js";

//https://github.com/nostr-protocol/nips/blob/master/98.md

/**
 * Parses the authorization header and checks if it is valid.
 * 
 * @param req - The request object.
 * @param endpoint - The endpoint of the request.
 * @returns A promise that resolves to a VerifyResultMessage object.
 */


const isNIP98Valid = async (authevent: Event, req: Request): Promise<ResultMessagev2> => {
	//Check if event authorization kind is valid (Must be 27235)
	try {
		const eventkind: number = +authevent.kind;
		if (eventkind == null || eventkind == undefined || eventkind != NIPKinds.NIP98) {
			logger.warn(
				"RES -> 400 Bad request - Auth header event kind is not 27235",
				"|",
				req.socket.remoteAddress
			);
			const result: ResultMessagev2 = {
				status: "error",
				message: "Auth header event kind is not 27235 ",
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessagev2 = {
			status: "error",
			message: "Auth header event kind is not 27235",
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
			const result: ResultMessagev2 = {
				status: "error",
				message: `Auth header event created_at is not within a reasonable time window ${created_at}<>${now}`,
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessagev2 = {
			status: "error",
			message: "Auth header event created_at is not within a reasonable time window",
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
			const result: ResultMessagev2 = {
				status: "error",
				message: `Auth header event endpoint is not valid: ${AuthEventEndpoint} <> ${ServerEndpoint}`,
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessagev2 = {
			status: "error",
			message: "Auth header event endpoint is not valid",
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
			const result: ResultMessagev2 = {
				status: "error",
				message: `Auth header event method is not valid`,
			};

			return result;
		}
	} catch (error) {
		logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
		const result: ResultMessagev2 = {
			status: "error",
			message: "Auth header event method is not valid",
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
				const result: ResultMessagev2 = {
					status: "error",
					message: `Auth header event payload is not valid`,
				};

				return result;
			}
		} catch (error) {
			logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			const result: ResultMessagev2 = {
				status: "error",
				message: "Auth header event payload is not valid",
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
				const result: ResultMessagev2 = {
					status: "error",
					message: `Auth header event payload is not valid`,
				};

				return result;
			}
		} catch (error) {
			logger.error(`RES -> 400 Bad request - ${error}`, "|", req.socket.remoteAddress);
			const result: ResultMessagev2 = {
				status: "error",
				message: "Auth header event payload is not valid",
			};

			return result;
		}
	}

	return { status: "success", message: "Auth header event is valid" };
};

export { isNIP98Valid };