import { Request, Response } from "express";
import config from "config";
import { logger } from "../../lib/logger.js";

import {allowedMimeTypes} from "../../types.js";

const GetNIP96file = async (req: Request, res: Response): Promise<Response> => {

    const servername = req.hostname;

    logger.info("REQ nip96.json ->", servername, "|", req.socket.remoteAddress);

    let nip96file = {
    
        "api_url": "https://" + servername + "/api/v1/media",
        "download_url": "https://" + servername + "/media",
        "supported_nips": ["NIP-94", "NIP-98","NIP-96"],
        "tos_url": config.get("media.tosURL"),
        "content_types": allowedMimeTypes,
        "plans": {
            "free": {
              "name": "Free Tier",
              "is_nip98_required": false,
              "url": "",
              "max_byte_size": Number(config.get("media.maxMBfilesize"))*1024*1024,
              "file_expiration": [0, 0],
              "image_transformations": ["resizing"]
            }
        }
    };

	return res.status(200).send(JSON.stringify(nip96file));

    }

export {GetNIP96file};