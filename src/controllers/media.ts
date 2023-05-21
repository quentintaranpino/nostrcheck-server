import { Request, Response } from "express";
import { connect } from "../lib/database";
import { logger } from "../lib/logger";
import { ParseAuthEvent } from "../nostr/NIP98";
import {
	allowedMimeTypes,
	ResultMessage,
	UploadTypes,
	UploadVisibility,
} from "../types";
import * as fastq from "fastq";
import app from "../app";
import type { queueAsPromised } from "fastq";

const requestQueue: queueAsPromised<any> = fastq.promise(asyncTransform, 1)

async function asyncTransform (arg: any): Promise<ResultMessage> {

  logger.info("asyncTransform", "->", arg.originalname);
  return {
	result: true,
	description: "Transform file success",
	  };
}


const Uploadmedia = async (req: Request, res: Response): Promise<Response> => {
	
	logger.info("POST /api/v1/media", "|", req.socket.remoteAddress);

	//Check if event authorization header is valid (NIP98)
	const EventHeader = ParseAuthEvent(req);
	if (!EventHeader.result) {
		logger.warn(
			`RES -> 400 Bad request - ${EventHeader.description}`,
			"|",
			req.socket.remoteAddress
		);
		const result: ResultMessage = {
			result: false,
			description: EventHeader.description,
		};

		return res.status(400).send(result);
	}

	//Check if visibility exist
	let visibility = req.body.visibility;
	if (!visibility) {
		logger.warn(`RES -> 400 Bad request - missing visiblity`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "missing visiblity",
		};

		return res.status(400).send(result);
	}

	//Check if visiblity is valid
	if (!UploadVisibility.includes(visibility)) {
		logger.warn(`RES -> 400 Bad request - incorrect visiblity`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "incorrect visiblity",
		};

		return res.status(400).send(result);
	}
	logger.info("visiblity ->", visibility, "|", req.socket.remoteAddress);

	//Check if pubkey is registered
	let pubkey = EventHeader.pubkey;
	const db = await connect();
	const [dbResult] = await db.query("SELECT hex FROM registered WHERE hex = ?", [pubkey]);
	const rowstemp = JSON.parse(JSON.stringify(dbResult));

	if (rowstemp[0] == undefined) {
		//If not registered the upload will be public
		logger.warn(
			"pubkey not registered, switching to public upload | ",
			req.socket.remoteAddress
		);
		visibility = "public";
		pubkey = app.get("pubkey");
	}
	logger.info("pubkey ->", pubkey, "|", req.socket.remoteAddress);

	//Check if upload type exists
	const uploadtype = req.body.type;
	if (!uploadtype) {
		logger.warn(`RES -> 400 Bad request - missing upload type`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "missing upload type",
		};

		return res.status(400).send(result);
	}

	//Check if upload type is valid
	if (!UploadTypes.includes(uploadtype)) {
		logger.warn(
			`RES -> 400 Bad request - incorrect upload type`,
			"|",
			req.socket.remoteAddress
		);
		const result: ResultMessage = {
			result: false,
			description: "incorrect upload type",
		};

		return res.status(400).send(result);
	}
	logger.info("type ->", uploadtype, "|", req.socket.remoteAddress);

	//Check if file exist on POST message
	const file = req.file;
	if (!file) {
		logger.warn(`RES -> 400 Bad request - Empty file`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "Empty file",
		};

		return res.status(400).send(result);
	}

	//Check if filetype is allowed
	if (!allowedMimeTypes.includes(file.mimetype)) {
		logger.warn(`RES -> 400 Bad request - `, file.mimetype, ` filetype not allowed`, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: false,
			description: "filetype not allowed",
		};

		return res.status(400).send(result);
	}
	logger.info("mime ->", file.mimetype, "|", req.socket.remoteAddress);

	//Send file to transform queue
	//Se tiene que cambiar, se debe enviar el objeto file en el metodo de transform
	//se debe copiar tambien a su ubicacion final. Por lo tanto, se debe cambiar
	//el nombre del metodo transformfile.
	let returnfile = await requestQueue.push(file).catch((err) => console.error(err))

	if (returnfile.result == false) {
		logger.warn(`RES -> 400 Bad request - `, returnfile.description, "|", req.socket.remoteAddress);
		const result: ResultMessage = {
			result: returnfile.result,
			description: returnfile.description,
			};
		return res.status(400).send(result);
	}

	return res.status(200).send(returnfile);
};

export {Uploadmedia};