import { Request, Response } from "express";

import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { redisClient, getLightningAddressFromRedis } from "../lib/redis.js";
import { LightningUsernameResult, ResultMessage } from "../types.js";
import server from "../server.js";

//Nostr address usernames endpoint
const Redirectlightningddress = async (req: Request, res: Response): Promise<any> => {

	const name = req.query.name as string;
	const servername = req.hostname;
	let isCached = false;

	//If name is null return 400
	if (!name) {
		logger.info("REQ Lightningaddress ->", servername, " |  name not specified  |", req.socket.remoteAddress);
		logger.warn(
			"RES Lightningaddress -> 400 Bad request - name parameter not specified",
			"|",
			req.socket.remoteAddress
		);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - You have to specify the 'name' parameter",
		};

		return res.status(400).send(result);
	}

	//If name is too long (>50) return 400
	if (name.length > 50) {
		logger.info("REQ Lightningaddress -> ", servername, " | " +  name.substring(0,50) + "..."  + " |", req.socket.remoteAddress);
		logger.warn("RES Lightningaddress -> 400 Bad request - name too long", "|", req.socket.remoteAddress);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - Name is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ Lightningaddress -> ", servername, "|", name, "|", req.socket.remoteAddress);

	let lightningdata: LightningUsernameResult = { lightningserver: "", lightninguser: "" };
	try {
		//Check if the name is cached
		const cached = await getLightningAddressFromRedis("LNURL" + "-" + name + "-" + servername);
		if (cached.lightningserver != "" && cached.lightninguser != "") {

			isCached = true;
			const url = "https://" + cached.lightningserver + "/.well-known/lnurlp/" + cached.lightninguser ;
			logger.info("RES Lightningaddress ->", name, "->", cached.lightninguser + "@" + cached.lightningserver, "|", "cached:", isCached);

			//redirect
			return res.redirect(url);
		}

		//If not cached, query the database
		const conn = await connect();
		const [rows] = await conn.execute(
			"SELECT lightningaddress FROM lightning WHERE username = ? and domain = ?",
			[name, servername]
		);
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();

		if (rowstemp[0] == undefined) {
			logger.warn("RES Lightningaddress ->", name, "|", "Lightning redirect not found");

			const result: ResultMessage = {
				result: false,
				description: `Lightning redirect for username ${name} not found`,
			};

			return res.status(404).send(result);
		}

		if (rowstemp != null) {
			lightningdata.lightningserver = rowstemp[0].lightningaddress.split("@")[1];
			lightningdata.lightninguser = rowstemp[0].lightningaddress.split("@")[0];
		}

	} catch (error) {
		logger.error(error);

		const result: ResultMessage = {
			result: false,
			description: "Internal server error",
		};

		return res.status(404).send(result);
	}

	await redisClient.set("LNURL" + "-" + name + "-" + servername, JSON.stringify(lightningdata), {
		EX: 300, // 5 minutes
		NX: true, // Only set the key if it does not already exist
	});

	//redirect to url
	const url = "https://" + lightningdata.lightningserver + "/.well-known/lnurlp/" + lightningdata.lightninguser ;
	logger.info("RES Lightningaddress ->", name, "->", lightningdata.lightninguser + "@" + lightningdata.lightningserver, "|", "cached:", isCached);

	//redirect
	return res.redirect(url);

};


export { Redirectlightningddress };
