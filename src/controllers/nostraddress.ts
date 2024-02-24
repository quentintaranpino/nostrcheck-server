import { Request, Response } from "express";

import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { redisClient, getNostrAddressFromRedis } from "../lib/redis.js";
import { RegisteredUsernameResult } from "../interfaces/register.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { getClientIp } from "../lib/server.js";
import app from "../app.js";
import { isModuleEnabled } from "../lib/config.js";

const checkNostrAddress = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("nostraddress", app)) {
		logger.warn("RES -> Module is not enabled" + " | " + getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	const name = req.query.name as string;
	const servername = req.hostname;
	let isCached = false;
	
	//If name is null return 400
	if (!name) {
		logger.info("REQ Nostraddress ->", servername, "|  name not specified  |", getClientIp(req));
		logger.warn(
			"RES Nostraddress -> 400 Bad request - name parameter not specified",
			"|",
			getClientIp(req)
		);

		const result: ResultMessagev2 = {
			status: "error",
			message:  "Bad request - You have to specify the 'name' parameter",
		};

		return res.status(400).send(result);
	}

	//If name is too long (>50) return 400
	if (name.length > 50) {
		logger.info("REQ Nostraddress ->", servername, "| " +  name.substring(0,50) + "..."  + " |", getClientIp(req));
		logger.warn("RES Nostraddress -> 400 Bad request - name too long", "|", getClientIp(req));

		const result: ResultMessagev2 = {
			status: "error",
			message:  "Bad request - Name is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ Nostraddress ->", servername, "|", name, "|", getClientIp(req));

	// Root _ pubkey
	const rootkey : string = app.get("config.server")["pubkey"];
	if (req.query.name === "_") {
		return res.status(200).send(JSON.stringify({ names: { ['_']: rootkey } }));
	}

	const result: RegisteredUsernameResult = { username: "", hex: "" };

	try {

		//Check if the name is cached
		const cached = await getNostrAddressFromRedis(name + "-" + servername);
		if (cached.username != "" && cached.hex != "") {
			isCached = true;

			logger.info("RES Nostraddress ->", cached.hex, "|", "cached:", isCached);

			return res.status(200).send(JSON.stringify({ names: { [cached.username]: cached.hex } }));
		}

		//If not cached, query the database
		const conn = await connect("Checknostraddress");
		const [rows] = await conn.execute(
			"SELECT username , hex  FROM registered WHERE username = ? and domain = ? and active = ?",
			[name, servername, 1]
		);
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();

		if (rowstemp[0] == undefined) {
			logger.warn("RES Nostraddress ->", name, "|", "Username not registered", "|", getClientIp(req));

			const result: ResultMessagev2 = {
				status: "error",
				message: `${name} is not registered on ${servername}`,
			};

			return res.status(404).send(result);
		}

		if (rowstemp != null) {
			result.username = rowstemp[0].username;
			result.hex = rowstemp[0].hex;
		}
	} catch (error) {
		logger.error(error);

		const result: ResultMessagev2 = {
			status: "error",
			message:  "Internal server error",
		};

		return res.status(404).send(result);
	}

	await redisClient.set(result.username + "-" + servername, JSON.stringify(result), {
		EX: 300, 
		NX: true,
	});

	logger.info("RES Nostraddress ->", result.hex, "|", "cached:", isCached);

	return res.status(200).send(JSON.stringify({ names: { [result.username]: result.hex } }));
};


export { checkNostrAddress };
