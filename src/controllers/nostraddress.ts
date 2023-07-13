import { Request, Response } from "express";

import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { redisClient, getJsonDataFromRedis } from "../lib/redis.js";
import { RegisteredUsernameResult, ResultMessage } from "../types.js";
import config from "config";
import server from "../server.js";

//Nostr address usernames endpoint
const Checknostraddress = async (req: Request, res: Response): Promise<Response> => {

	const name = req.query.name as string;
	const servername = req.hostname;
	let isCached = false;
	
	//If name is null return 400
	if (!name) {
		logger.info("REQ ->", servername, "|  name not specified  |", req.socket.remoteAddress);
		logger.warn(
			"RES -> 400 Bad request - name parameter not specified",
			"|",
			req.socket.remoteAddress
		);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - You have to specify the 'name' parameter",
		};

		return res.status(400).send(result);
	}

	//If name is too long (<50) return 400
	if (name.length > 50) {
		logger.info("REQ ->", servername, "| " +  name.substring(0,50) + "..."  + " |", req.socket.remoteAddress);
		logger.warn("RES -> 400 Bad request - name too long", "|", req.socket.remoteAddress);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - Name is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ ->", servername, "|", name + "|", req.socket.remoteAddress);

	// Root _ pubkey
	const rootkey : string = config.get('server.pubkey'); 
	if (req.query.name === "_") {
		return res.status(200).send(JSON.stringify({ names: { ['_']: rootkey } }));
	}

	const result: RegisteredUsernameResult = { username: "", hex: "" };

	try {

		//Check if the name is cached
		const cached = await getJsonDataFromRedis(name + "-" + servername);
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
				result: false,
				description: `${name} is not registered on ${servername}`,
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
			result: false,
			description: "Internal server error",
		};

		return res.status(404).send(result);
	}

	await redisClient.set(result.username + "-" + servername, JSON.stringify(result), {
		EX: 300, // 5 minutes
		NX: true, // Only set the key if it does not already exist
	});

	logger.info("RES ->", result.hex, "|", "cached:", isCached);

	return res.status(200).send(JSON.stringify({ names: { [result.username]: result.hex } }));
};


export { Checknostraddress };
