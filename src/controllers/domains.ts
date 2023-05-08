import { Application, Request, Response } from "express";

import { connect } from "../database";
import { logger } from "../logger";

export const LoadAvailableDomains = (app: Application): void => {

	//Available domains endpoint
	app.get("/api/v1/domains", async (req: Request, res: Response): Promise<Response> => {

        logger.info("REQ -> Domain list ", "|", req.socket.remoteAddress);
       
        try{
        const conn = await connect();
        const [rows] = await conn.execute("SELECT domain from domains");
        const rowstemp = JSON.parse(JSON.stringify(rows));
        if (rowstemp[0] != undefined) {
			logger.info("RES -> Domain list ", "|", req.socket.remoteAddress);
			conn.end();
			return res.status(200).send({"available domains": rowstemp});
		}else{
            logger.warn("RES -> Domain list ", "|", req.socket.remoteAddress);
            conn.end();
            return res.status(404).send({"available domains": "No domains available"});
        }
    }catch(error){
        logger.error(error);
        return res.status(500).send({description: "Internal server error"});
    }

	});

}