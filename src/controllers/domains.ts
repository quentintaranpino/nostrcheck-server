import { Request, Response } from "express";

import { connect } from "../lib/database";
import { logger } from "../lib/logger";

const QueryAvailiableDomains = async (): Promise<JSON[]> => {
	//Query database for available domains
	try {
		const conn = await connect();
		const rows = await conn.execute("SELECT domain from domains");
		if (rows[0] != undefined) {
			conn.end();

			return JSON.parse(JSON.stringify(rows[0]));
		}
		conn.end();

		return JSON.parse(JSON.stringify({ "available domains": "No domains available" }));
	} catch (error) {
		logger.error(error);

		return JSON.parse(JSON.stringify({ description: "Internal server error" }));
	}
};

const AvailableDomains = async (req: Request, res: Response): Promise<Response> => {
	//Available domains endpoint

	logger.info("REQ -> Domain list ", "|", req.socket.remoteAddress);

	try {
		const AvailableDomains = await QueryAvailiableDomains();
		if (AvailableDomains[0] != undefined) {
			logger.info("RES -> Domain list ", "|", req.socket.remoteAddress);

			return res.status(200).send({ domains: AvailableDomains });
		}
		logger.warn("RES -> Domain list ", "|", req.socket.remoteAddress);

		return res.status(404).send({ "available domains": "No domains available" });
	} catch (error) {
		logger.error(error);

		return res.status(500).send({ description: "Internal server error" });
	}
};

export { AvailableDomains, QueryAvailiableDomains };
