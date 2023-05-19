import { Application, Request, Response } from "express";

import { connect } from "../database";
import { logger } from "../logger";
import { ParseAuthEvent } from "../NIP98";
import { allowedMimeTypes, MediaResultMessage, ResultMessage, UploadTypes, UploadVisibility } from "../types";

const multer = require("multer");

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 100 * 1024 * 1024 }, //100MB max file size
});

export const LoadMediaEndpoint = (app: Application): void => {
	app.post(
		"/api/v1/media",
		upload.single("media"),
		async (req: Request, res: Response): Promise<Response> => {
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

            //Check if visibility is valid
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

			//Check if file exist on POST
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
				logger.warn(`RES -> 400 Bad request - Incorrect file type`, "|", req.socket.remoteAddress);
				const result: ResultMessage = {
					result: false,
					description: "Incorrect file type",
				};

				return res.status(400).send(result);
			}
			logger.info("mime ->", file.mimetype, "|", req.socket.remoteAddress);

			//RETURN FILE URL
			logger.info(`RES -> 200 OK - File uploaded successfully`, "|", req.socket.remoteAddress);
			const result: MediaResultMessage = {
				url: "FILENAME",
				visibility,
				result: true,
				description: "File uploaded successfully",
			};

			return res.status(200).send(result);
		}
	);
};
