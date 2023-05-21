import { Application, Request, Response } from "express";

import { redisClient } from "../app";
import { connect } from "../database";
import { logger } from "../logger";

interface RegisteredResults {
	username: string;
	hex: string;
}
interface ResultMessage extends RegisteredResults {
	domain: string;
	result: boolean;
	description: string;
}

const Checknostraddress = async (req: Request, res: Response): Promise<Response> => {
	//Nostr address usernames endpoint
		const name = req.query.name as string;
		const servername = req.hostname;
		let isCached = false;

		//If name is null return 400
		if (!name) {
			logger.warn("REQ ->", servername, "|", " ", "|", req.socket.remoteAddress);
			logger.warn(
				"RES -> 400 Bad request - name parameter not specified",
				"|",
				req.headers["x-forwarded-for"] || req.socket.remoteAddress
			);

			const result: ResultMessage = {
				username: "",
				hex: "",
				domain: "",
				result: false,
				description: "Bad request - You have to specify the 'name' parameter",
			};

			return res.status(400).send(result);
		}

		//If name is too long (<50) return 400
		if (name.length > 50) {
			logger.warn(
				"REQ ->",
				servername,
				"|",
				`${name.substring(0, 50)}...`,
				"|",
				req.socket.remoteAddress
			);
			logger.warn("RES -> 400 Bad request - name too long", "|", req.socket.remoteAddress);

			const result: ResultMessage = {
				username: `${name.substring(0, 50)}...`,
				hex: "",
				domain: "",
				result: false,
				description: "Bad request - Name is too long",
			};

			return res.status(400).send(result);
		}

		logger.info("REQ ->", servername, "|", name, "|", req.socket.remoteAddress);

		// Root _ pubkey
		const rootkey = "134743ca8ad0203b3657c20a6869e64f160ce48ae6388dc1f5ca67f346019ee7"; //Especify the root domain hexkey
		if (req.query.name === "_") {
			const result: RegisteredResults = { username: "_", hex: rootkey };

			return res.status(200).send(JSON.stringify({ names: { [result.username]: result.hex } }));
		}

		const result: RegisteredResults = { username: "", hex: "" };

		try {
			//TODO. WE HAVE TO STORE ALSO THE DOMAIN IN THE CACHE, BECAUSE IF WE HAVE 2 DOMAINS WITH THE SAME USERNAME, THE CACHE WILL RETURN THE FIRST ONE

			//Check if the name is cached
			const cached = await getJsonDataFromRedis(name);
			if (cached.username != "" && cached.hex != "") {
				isCached = true;

				logger.info("RES ->", cached.hex, "|", "cached:", isCached);

				return res.status(200).send(JSON.stringify({ names: { [cached.username]: cached.hex } }));
			}

			//If not cached, query the database
			const conn = await connect();
			const [rows] = await conn.execute(
				"SELECT username , hex  FROM registered WHERE username = ? and domain = ?",
				[name, servername]
			);
			const rowstemp = JSON.parse(JSON.stringify(rows));
			conn.end();

			if (rowstemp[0] == undefined) {
				logger.warn("RES ->", name, "|", "Username not registered");

				const result: ResultMessage = {
					username: name,
					hex: "",
					domain: servername,
					result: false,
					description: `${name} is not registered on ${servername} visit ${servername}/register for more info`,
				};

				return res.status(404).send(result);
			}

			if (rowstemp != null) {
				result.username = rowstemp[0].username;
				result.hex = rowstemp[0].hex;
			}
		} catch (error) {
			logger.error(error);

			const result: ResultMessage = {
				username: "",
				hex: "",
				domain: servername,
				result: false,
				description: "Internal server error",
			};

			return res.status(404).send(result);
		}

		await redisClient.set(result.username, JSON.stringify(result), {
			EX: 300, // 5 minutes
			NX: true, // Only set the key if it does not already exist
		});

		logger.info("RES ->", result.hex, "|", "cached:", isCached);

		return res.status(200).send(JSON.stringify({ names: { [result.username]: result.hex } }));
};

async function getJsonDataFromRedis(key: string): Promise<RegisteredResults> {
	const data = await redisClient.get(key);

	if (!data) {
		return { username: "", hex: "" };
	}

	return JSON.parse(data.toString());
}

export { Checknostraddress };