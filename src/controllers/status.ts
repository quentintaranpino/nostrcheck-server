import { Request, Response } from "express";

import { logger } from "../lib/logger.js";
import { ServerStatusMessage } from "../interfaces/status.js";

const ServerStatus = async (req: Request, res: Response): Promise<Response> => {
	logger.info("GET /api/v1/status", "|", req.socket.remoteAddress);

	const result: ServerStatusMessage = {
		result: true,
		description: "Nostrcheck API server is running.",
		version: process.env.npm_package_version || "0.0.0",
		uptime: format(process.uptime()),
	};

	return res.status(200).send(result);
};

export { ServerStatus };

function format(seconds:number):string{
	function pad(s: number){
	  return (s < 10 ? '0' : '') + s;
	}
	var hours = Math.floor(seconds / (60*60));
	var minutes = Math.floor(seconds % (60*60) / 60);
	var seconds = Math.floor(seconds % 60);
  
	return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
  }
