import { Request, Response } from "express";

import { dbMultiSelect } from "../lib/database.js";
import { logger } from "../lib/logger.js";
import { nostrAddressResult } from "../interfaces/register.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import app from "../app.js";
import { isModuleEnabled } from "../lib/config.js";
import { redisGetJSON, redisSet } from "../lib/redis.js";
import { isIpAllowed } from "../lib/ips.js";

const getNostraddress = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

	// Check if current module is enabled
	if (!isModuleEnabled("nostraddress", app)) {
        logger.info("Attempt to access a non-active module:","nostraddress","|","IP:", reqInfo.ip);
		return res.status(403).send({"status": "error", "message": "Module is not enabled"});
	}

	const name = req.query.name as string || "";
	const nameLength = name.length || 0;
	const servername = req.hostname;
	
	if (name == "" || nameLength > 50) {
		logger.info(`REQ Nostraddress | 400 Bad request ${name === "" ? "- name not specified" : "- name too long" + name.substring(0,50) + "..."}`, reqInfo.ip);
		const result: ResultMessagev2 = {
			status: "error",
			message:  name === "" ? "Name not specified" : "Name is too long",
		};
		return res.status(400).send(result);
	}

	const cached = await redisGetJSON<{ names: Record<string, string> }>(`nostraddress:${name}-${servername}`);
	if (cached && cached.names[name]) {
		logger.info(`REQ nostraddress | ${name} : ${cached.names[name]} | cached:`, true, reqInfo.ip);
		return res.status(200).send(cached);
	}

	const pubkey = (await dbMultiSelect(["hex"],"registered", name == "_" ? "username = ?" : "username = ?  and domain = ? and active = 1", name == "_" ? ["public"] : [name, servername]))[0]?.hex;
	if (pubkey == undefined) {
		logger.info(`REQ nostraddress | ${name} not found`, reqInfo.ip);
		const result: ResultMessagev2 = {
			status: "error",
			message: `${name} is not found on ${servername}`,
		};
		return res.status(404).send(result);
	}

	const result: nostrAddressResult = {
		names: { 
			[name]: pubkey
		}
	};

	await redisSet(`nostraddress:${name}-${servername}`, JSON.stringify(result), {
		EX: app.get("config.redis")["expireTime"],
	});

	logger.info(`REQ nostraddress | ${name} : ${result.names[name]} | cached:`, false, reqInfo.ip);
	return res.status(200).send(result);

};

export { getNostraddress };