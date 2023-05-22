import { Request, Response } from "express";
import app from "../app";
import { connect } from "../lib/database";
import { logger } from "../lib/logger";
import { ParseAuthEvent } from "../lib/nostr/NIP98";
import { requestQueue } from "../lib/transform";
import { allowedMimeTypes, ConvertFilesOpions, MediaResultMessage, mime_transform, ResultMessage, UploadTypes, UploadVisibility, asyncTask } from "../types";
import crypto from "crypto";

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
		logger.warn("pubkey not registered, switching to public upload | ", req.socket.remoteAddress);
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
		logger.warn(`RES -> 400 Bad request - incorrect upload type`, "|", req.socket.remoteAddress);
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
		logger.warn(
			`RES -> 400 Bad request - `,
			file.mimetype,
			` filetype not allowed`,
			"|",
			req.socket.remoteAddress
		);
		const result: ResultMessage = {
			result: false,
			description: "filetype not allowed",
		};

		return res.status(400).send(result);
	}
	logger.info("mime ->", file.mimetype, "|", req.socket.remoteAddress);

	//Send request to request transform queue

	//For testing purposes, we need to specify the file options for each file type
	const fileoptions :ConvertFilesOpions = {
		width: 640,
		height: 480,
		uploadtype: uploadtype,
		originalmime: file.mimetype,
		outputmime: mime_transform[file.mimetype],
		id: crypto.randomBytes(24).toString("hex"),
	};

	const t: asyncTask = {
		req: req,
		fileoptions: fileoptions,
	};

	requestQueue.push(t)
		.catch((err) => {
			logger.error("Error pushing file to queue", err);
			const result: MediaResultMessage = {
				result: false,
				description: "Error queueing file",
				url: "",
				visibility: "",
				id: "",
			};
			return result;
		});

	const returnmessage = {
		result: true,
		description: "File queued for conversion",
		url: "",
		visibility: visibility,
		id: fileoptions.id,
	};

	return res.status(200).send(returnmessage);
};

export { Uploadmedia };
