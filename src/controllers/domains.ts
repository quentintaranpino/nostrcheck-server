import { Request, Response } from "express";

import { connect } from "../database";
import { logger } from "../logger";

const AvailableDomains = async (req: Request, res: Response): Promise<Response> => {
	//Available domains endpoint

		logger.info("REQ -> Domain list ", "|", req.socket.remoteAddress);

		try {
			const conn = await connect();
			const rows = await conn.execute("SELECT domain from domains");
			if (rows[0] != undefined) {
				logger.info("RES -> Domain list ", "|", req.socket.remoteAddress);
				conn.end();

				return res.status(200).send({ domains: rows[0] });
			}
			logger.warn("RES -> Domain list ", "|", req.socket.remoteAddress);
			conn.end();

			return res.status(404).send({ "available domains": "No domains available" });
		} catch (error) {
			logger.error(error);

			return res.status(500).send({ description: "Internal server error" });
		}
};

export { AvailableDomains };
