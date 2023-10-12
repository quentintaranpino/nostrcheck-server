import { Request, Response } from "express";

import { connect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { redisClient, getLightningAddressFromRedis } from "../lib/redis.js";
import { ResultMessage } from "../interfaces/server.js";
import { LightningUsernameResult } from "../interfaces/lightning.js";
import { ParseAuthEvent } from "../lib/nostr/NIP98.js";

//Nostr address usernames endpoint
const Redirectlightningddress = async (req: Request, res: Response): Promise<any> => {

	const name = req.query.name as string;
	const servername = req.hostname;
	let isCached = false;

	//If name is null return 400
	if (!name || name.trim() == "") {
		logger.info("REQ GET lightningaddress ->", servername, " | name:",  "name not specified", "|", req.headers['x-forwarded-for']);
		logger.warn(
			"RES GET Lightningaddress -> 400 Bad request - name parameter not specified",
			"|",
			req.headers['x-forwarded-for']
		);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - You have to specify the 'name' parameter",
		};

		return res.status(400).send(result);
	}

	//If name is too long (>50) return 400
	if (name.length > 50) {
		logger.info("REQ GET lightningaddress ->", servername, " | name:",  name.substring(0,50) + "..." , "|", req.headers['x-forwarded-for']);
		logger.warn("RES GET Lightningaddress -> 400 Bad request - name too long", "|", req.headers['x-forwarded-for']);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - Name is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ GET lightningaddress ->", servername, " | name:",  name , "|", req.headers['x-forwarded-for']);

	let lightningdata: LightningUsernameResult = { lightningserver: "", lightninguser: "" };
	try {

		//Check if the name is cached
		const cached = await getLightningAddressFromRedis("LNURL" + "-" + name + "-" + servername);
		if (cached.lightningserver != "" && cached.lightninguser != "") {

			isCached = true;
			const url = "https://" + cached.lightningserver + "/.well-known/lnurlp/" + cached.lightninguser ;
			logger.info("RES GET Lightningaddress ->", name, "redirect ->", cached.lightninguser + "@" + cached.lightningserver, "|", "cached:", isCached);

			//redirect
			return res.redirect(url);
		}

		//If not cached, query the database
		const conn = await connect("Redirectlightningddress");
		const [rows] = await conn.execute(
			"SELECT lightningaddress FROM lightning INNER JOIN registered ON lightning.pubkey = registered.hex WHERE registered.username = ? and registered.domain = ?",
			[name, servername]
		);
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();

		if (rowstemp[0] == undefined) {
			logger.warn("RES GET Lightningaddress ->", name, "|", "Lightning redirect not found");

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
	logger.info("RES Lightningaddress ->", name, "redirect ->", lightningdata.lightninguser + "@" + lightningdata.lightningserver, "|", "cached:", isCached);

	//redirect
	return res.redirect(url);

};

const UpdateLightningAddress = async (req: Request, res: Response): Promise<any> => {

	const servername = req.hostname;
	const lightningaddress = req.params.lightningaddress;

	//Check if event authorization header is valid (NIP98) or if apikey is valid (v0)
	const EventHeader = await ParseAuthEvent(req);
	if (!EventHeader.result) {return res.status(401).send({"result": EventHeader.result, "description" : EventHeader.description});}

	//If lightningaddress is null return 400
	if (!lightningaddress || lightningaddress.trim() == "") {
		logger.info("REQ Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  "ligntningaddress not specified  |", req.headers['x-forwarded-for']);
		logger.warn(
			"RES Update Lightningaddress -> 400 Bad request - lightningaddress parameter not specified",
			"|",
			req.headers['x-forwarded-for']
		);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - You have to specify the 'lightningaddress' parameter",
		};

		return res.status(400).send(result);
	}

	//If lightningaddress is too long (>50) return 400
	if (lightningaddress.length > 50) {
		logger.info("REQ Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress.substring(0,50) + "...", "|", req.headers['x-forwarded-for']);

		logger.info("REQ Update lightningaddress-> ", servername, " |" +  lightningaddress.substring(0,50) + "..."  + " |", req.headers['x-forwarded-for']);
		logger.warn("RES Update Lightningaddress -> 400 Bad request - lightningaddress too long", "|", req.headers['x-forwarded-for']);

		const result: ResultMessage = {
			result: false,
			description: "Bad request - Lightningaddress is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", req.headers['x-forwarded-for']);


	try {
		const conn = await connect("UpdateLightningAddress");
		const [rows] = await conn.execute(
			"UPDATE lightning SET lightningaddress = ? WHERE pubkey = ?",
			[lightningaddress, EventHeader.pubkey]
		);
		let rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp.affectedRows == 0) {
			logger.info("Update Lightningaddress ->", EventHeader.pubkey, "|", "Lightning redirect not found, creating...");

			//Insert lightning address into database
			const conn = await connect("UpdateLightningAddress");
			const [dbInsert] = await conn.execute(
			"INSERT INTO lightning (pubkey, lightningaddress) VALUES (?, ?)",
			[EventHeader.pubkey, lightningaddress]
			);

			if (!dbInsert) {
				logger.warn("RES Update Lightningaddress ->", EventHeader.pubkey, "|", "Error inserting lightning address into database");

				const result: ResultMessage = {
					result: false,
					description: "Error inserting lightning address into database",
			};
			conn.end();
			return res.status(406).send(result);
			}
		}

	}
	catch (error) {
		logger.error(error);

		const result: ResultMessage = {
			result: false,
			description: "Internal server error",
		};

		return res.status(500).send(result);
	}

	//select lightningaddress from database
	const conn = await connect("UpdateLightningAddress");
	const [rows] = await conn.execute(
		"SELECT username, domain FROM registered WHERE hex = ?",
		[EventHeader.pubkey]
	);
	let rowstemp = JSON.parse(JSON.stringify(rows));
	conn.end();
	if (rowstemp[0] != undefined) {

		//Delete redis cache
		const deletecache = await redisClient.del("LNURL" + "-" + rowstemp[0].username + "-" + rowstemp[0].domain);
		if (deletecache != 0) {
			logger.info("Update Lightningaddress ->", EventHeader.pubkey, "|", "Redis cache cleared");
		}
	}

	logger.info("RES Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", "Lightning redirect updated", "|", req.headers['x-forwarded-for']);

	const result: ResultMessage = {
		result: true,
		description: `Lightning redirect for pubkey ${EventHeader.pubkey} updated`,
	};

	return res.status(200).send(result);

};

const DeleteLightningAddress = async (req: Request, res: Response): Promise<any> => {

	const servername = req.hostname;
	let lightningaddress = "";

	//Check if event authorization header is valid (NIP98) or if apikey is valid (v0)
	const EventHeader = await ParseAuthEvent(req);
	if (!EventHeader.result) {return res.status(401).send({"result": EventHeader.result, "description" : EventHeader.description});}

	//Check if pubkey's lightningaddress exists on database
	try{
		const conn = await connect("DeleteLightningAddress");
		const [rows] = await conn.execute(
			"SELECT lightningaddress FROM lightning WHERE pubkey = ?",
			[EventHeader.pubkey]
		);
		let rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp[0] == undefined) {
			logger.warn("RES Delete Lightningaddress -> 404 Not found", "|", req.headers['x-forwarded-for']);
			const result: ResultMessage = {
				result: false,
				description: `Lightning redirect for pubkey ${EventHeader.pubkey} not found`,
			};
			return res.status(404).send(result);
		}
		lightningaddress = rowstemp[0].lightningaddress;

	}catch (error) {
		logger.error(error);
		const result: ResultMessage = {
			result: false,
			description: "Internal server error",
		};
		return res.status(500).send(result);
	}

	logger.info("REQ Delete lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", req.headers['x-forwarded-for']);

	try {
		const conn = await connect("DeleteLightningAddress");
		const [rows] = await conn.execute(
			"DELETE FROM lightning WHERE pubkey = ?",
			[EventHeader.pubkey]
		);
		let rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp.affectedRows == 0) {
			logger.info("Delete Lightningaddress ->", EventHeader.pubkey, "|", "Lightning redirect not found");
			const result: ResultMessage = {
				result: false,
				description: `Lightning redirect for pubkey ${EventHeader.pubkey} not found`,
			};
			return res.status(404).send(result);
		}
	}
	catch (error) {
		logger.error(error);
		const result: ResultMessage = {
			result: false,
			description: "Internal server error",
		};
		return res.status(500).send(result);
	}

	//select lightningaddress from database
	const conn = await connect("DeleteLightningAddress");

	const [rows] = await conn.execute(
		"SELECT username, domain FROM registered WHERE hex = ?",
		[EventHeader.pubkey]
	);
	let rowstemp = JSON.parse(JSON.stringify(rows));
	conn.end();
	if (rowstemp[0] != undefined) {

		//Delete redis cache
		const deletecache = await redisClient.del("LNURL" + "-" + rowstemp[0].username + "-" + rowstemp[0].domain);
		if (deletecache != 0) {
			logger.info("Delete Lightningaddress ->", EventHeader.pubkey, "|", "Redis cache cleared");
		}

	}

	logger.info("RES Delete lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", "Lightning redirect deleted", "|", req.headers['x-forwarded-for']);

	const result: ResultMessage = {
		result: true,
		description: `Lightning redirect for pubkey ${EventHeader.pubkey} deleted`,
	};

	return res.status(200).send(result);

};

export { Redirectlightningddress, UpdateLightningAddress, DeleteLightningAddress };
