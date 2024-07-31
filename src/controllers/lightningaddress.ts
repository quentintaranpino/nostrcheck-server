import { Request, Response } from "express";

import { connect, dbSelect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { redisClient, getLightningAddressFromRedis } from "../lib/redis.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { LightningUsernameResult } from "../interfaces/lightning.js";
import { parseAuthHeader } from "../lib/authorization.js";
import { getClientIp } from "../lib/utils.js";
import { isModuleEnabled } from "../lib/config.js";
import app from "../app.js";

const redirectlightningddress = async (req: Request, res: Response): Promise<any> => {

	// Check if current module is enabled
	if (!isModuleEnabled("lightning", app)) {
        logger.warn("Attempt to access a non-active module:","lightning","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	const name = req.query.name || req.params.name as string;

	if (typeof name !== "string") {
		logger.info("REQ GET lightningaddress ->", req.hostname, " | name:",  name , "|", getClientIp(req));
		logger.info("RES GET Lightningaddress -> 400 Bad request - name parameter not specified", "|", getClientIp(req));

		const result: ResultMessagev2 = {
			status: "error",
			message: "Bad request - You have to specify the 'name' parameter",
		};

		return res.status(400).send(result);
	}

	const servername = req.hostname;
	let isCached = false;

	//If name is null return 400
	if (!name || name.trim() == "") {
		logger.info("REQ GET lightningaddress ->", servername, " | name:",  "name not specified", "|", getClientIp(req));
		logger.info(
			"RES GET Lightningaddress -> 400 Bad request - name parameter not specified",
			"|",
			getClientIp(req)
		);

		const result: ResultMessagev2 = {
			status: "error",
			message: "Bad request - You have to specify the 'name' parameter",
		};

		return res.status(400).send(result);
	}

	//If name is too long (>50) return 400
	if (name.length > 50) {
		logger.info("REQ GET lightningaddress ->", servername, " | name:",  name.substring(0,50) + "..." , "|", getClientIp(req));
		logger.info("RES GET Lightningaddress -> 400 Bad request - name too long", "|", getClientIp(req));

		const result: ResultMessagev2 = {
			status: "error",
			message: "Bad request - Name is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ GET lightningaddress ->", servername, " | name:",  name , "|", getClientIp(req));

	const lightningdata: LightningUsernameResult = { lightningserver: "", lightninguser: "" };
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
		const lightningAddress = 
			await dbSelect("SELECT lightningaddress FROM lightning INNER JOIN registered ON lightning.pubkey = registered.hex WHERE registered.username = ? and registered.domain = ? and lightning.active = 1", 
			"lightningaddress", 
			[name, servername]) as string;

		if  (lightningAddress == "" || lightningAddress == undefined) {
			logger.warn("RES GET Lightningaddress ->", name, "|", "Lightning redirect not found");

			const result: ResultMessagev2 = {
				status: "error",
				message: `Lightning redirect for username ${name} not found`,
			};

			return res.status(404).send(result);
		}else{
			logger.debug("Lightning redirect found for username", name, ":", lightningAddress);
			lightningdata.lightningserver = lightningAddress.split("@")[1];
			lightningdata.lightninguser = lightningAddress.split("@")[0];
		}
		
	} catch (error) {
		logger.error(error);

		const result: ResultMessagev2 = {
			status: "error",
			message:  "Internal server error",
		};

		return res.status(404).send(result);
	}

	await redisClient.set("LNURL" + "-" + name + "-" + servername, JSON.stringify(lightningdata), {
		EX: app.get("config.redis")["expireTime"],
		NX: true, // Only set the key if it does not already exist
	});

	//redirect to url
	const url = "https://" + lightningdata.lightningserver + "/.well-known/lnurlp/" + lightningdata.lightninguser ;
	logger.info("RES Lightningaddress ->", name, "redirect ->", lightningdata.lightninguser + "@" + lightningdata.lightningserver, "|", "cached:", isCached);

	//redirect
	return res.redirect(url);

};

const updateLightningAddress = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("lightning", app)) {
        logger.warn("Attempt to access a non-active module:","lightning","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	const servername = req.hostname;
	const lightningaddress = req.params.lightningaddress;

    // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "updateLightningAddress", false);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

	//If lightningaddress is null return 400
	if (!lightningaddress || lightningaddress.trim() == "") {
		logger.info("REQ Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  "ligntningaddress not specified  |", getClientIp(req));
		logger.warn(
			"RES Update Lightningaddress -> 400 Bad request - lightningaddress parameter not specified",
			"|",
			getClientIp(req)
		);

		const result: ResultMessagev2 = {
			status: "error",
			message:  "Bad request - You have to specify the 'lightningaddress' parameter",
		};

		return res.status(400).send(result);
	}

	//If lightningaddress is too long (>50) return 400
	if (lightningaddress.length > 50) {
		logger.info("REQ Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress.substring(0,50) + "...", "|", getClientIp(req));

		logger.info("REQ Update lightningaddress-> ", servername, " |" +  lightningaddress.substring(0,50) + "..."  + " |", getClientIp(req));
		logger.warn("RES Update Lightningaddress -> 400 Bad request - lightningaddress too long", "|", getClientIp(req));

		const result: ResultMessagev2 = {
			status: "error",
			message:  "Bad request - Lightningaddress is too long",
		};

		return res.status(400).send(result);
	}

	logger.info("REQ Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", getClientIp(req));


	try {
		const conn = await connect("UpdateLightningAddress");
		const [rows] = await conn.execute(
			"UPDATE lightning SET lightningaddress = ? WHERE pubkey = ?",
			[lightningaddress, EventHeader.pubkey]
		);
		const rowstemp = JSON.parse(JSON.stringify(rows));
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

				const result: ResultMessagev2 = {
					status: "error",
					message:  "Error inserting lightning address into database",
			};
			conn.end();
			return res.status(406).send(result);
			}
		}

	}
	catch (error) {
		logger.error(error);

		const result: ResultMessagev2 = {
			status: "error",
			message:  "Internal server error",
		};

		return res.status(500).send(result);
	}

	//select lightningaddress from database
	const conn = await connect("UpdateLightningAddress");
	const [rows] = await conn.execute(
		"SELECT username, domain FROM registered WHERE hex = ?",
		[EventHeader.pubkey]
	);
	const rowstemp = JSON.parse(JSON.stringify(rows));
	conn.end();
	if (rowstemp[0] != undefined) {

		//Delete redis cache
		const deletecache = await redisClient.del("LNURL" + "-" + rowstemp[0].username + "-" + rowstemp[0].domain);
		if (deletecache != 0) {
			logger.info("Update Lightningaddress ->", EventHeader.pubkey, "|", "Redis cache cleared");
		}
	}

	logger.info("RES Update lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", "Lightning redirect updated", "|", getClientIp(req));

	const result: ResultMessagev2 = {
		status: "success",
		message: `Lightning redirect for pubkey ${EventHeader.pubkey} updated`,
	};

	return res.status(200).send(result);

};

const deleteLightningAddress = async (req: Request, res: Response): Promise<Response> => {

	// Check if current module is enabled
	if (!isModuleEnabled("lightning", app)) {
        logger.warn("Attempt to access a non-active module:","lightning","|","IP:", getClientIp(req));
		return res.status(400).send({"status": "error", "message": "Module is not enabled"});
	}

	const servername = req.hostname;
	let lightningaddress = "";

    // Check if authorization header is valid
	const EventHeader = await parseAuthHeader(req, "deleteLightningAddress", false);
	if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

	//Check if pubkey's lightningaddress exists on database
	try{
		const conn = await connect("DeleteLightningAddress");
		const [rows] = await conn.execute(
			"SELECT lightningaddress FROM lightning WHERE pubkey = ?",
			[EventHeader.pubkey]
		);
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp[0] == undefined) {
			logger.warn("RES Delete Lightningaddress -> 404 Not found", "|", getClientIp(req));
			const result: ResultMessagev2 = {
				status: "error",
				message:  `Lightning redirect for pubkey ${EventHeader.pubkey} not found`,
			};
			return res.status(404).send(result);
		}
		lightningaddress = rowstemp[0].lightningaddress;

	}catch (error) {
		logger.error(error);
		const result: ResultMessagev2 = {
			status: "error",
			message:  "Internal server error",
		};
		return res.status(500).send(result);
	}

	logger.info("REQ Delete lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", getClientIp(req));

	try {
		const conn = await connect("DeleteLightningAddress");
		const [rows] = await conn.execute(
			"DELETE FROM lightning WHERE pubkey = ?",
			[EventHeader.pubkey]
		);
		const rowstemp = JSON.parse(JSON.stringify(rows));
		conn.end();
		if (rowstemp.affectedRows == 0) {
			logger.info("Delete Lightningaddress ->", EventHeader.pubkey, "|", "Lightning redirect not found");
			const result: ResultMessagev2 = {
				status: "error",
				message:  `Lightning redirect for pubkey ${EventHeader.pubkey} not found`,
			};
			return res.status(404).send(result);
		}
	}
	catch (error) {
		logger.error(error);
		const result: ResultMessagev2 = {
			status: "error",
			message:  "Internal server error",
		};
		return res.status(500).send(result);
	}

	//select lightningaddress from database
	const conn = await connect("DeleteLightningAddress");

	const [rows] = await conn.execute(
		"SELECT username, domain FROM registered WHERE hex = ?",
		[EventHeader.pubkey]
	);
	const rowstemp = JSON.parse(JSON.stringify(rows));
	conn.end();
	if (rowstemp[0] != undefined) {

		//Delete redis cache
		const deletecache = await redisClient.del("LNURL" + "-" + rowstemp[0].username + "-" + rowstemp[0].domain);
		if (deletecache != 0) {
			logger.info("Delete Lightningaddress ->", EventHeader.pubkey, "|", "Redis cache cleared");
		}

	}

	logger.info("RES Delete lightningaddress ->", servername, " | pubkey:",  EventHeader.pubkey, " | ligntningaddress:",  lightningaddress, "|", "Lightning redirect deleted", "|", getClientIp(req));

	const result: ResultMessagev2 = {
		status: "success",
		message: `Lightning redirect for pubkey ${EventHeader.pubkey} deleted`,
	};

	return res.status(200).send(result);

};

export { redirectlightningddress, updateLightningAddress, deleteLightningAddress };
