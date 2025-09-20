import { NextFunction, RequestHandler, Request, Response } from "express";
import multer from "multer";

import { getConfig } from "../config/core.js";
import { logger } from "../logger.js";
import { getClientInfo } from "../security/ips.js";
import getRawBody from "raw-body";
import { Readable } from "stream";

const multipartUploadMiddleware  = (): RequestHandler => {
    return (req, res, next) => {
        const host = req.hostname;
        const maxMB = Number(getConfig(host, ["media", "maxMBfilesize"]));
        const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: maxMB * 1024 * 1024 },
        });
        upload.any()(req, res, err => {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            logger.warn("uploadFile - Upload attempt failed: File too large", "|", getClientInfo(req).ip);
            return res.status(413).send({ status: "error", message: `File too large, max is ${maxMB}MB` });
        }
        next(err);
        });
    };
};
  
const rawUploadMiddleware  = (): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const host = req.hostname;
      const maxMB = getConfig(host, ["media", "maxMBfilesize"]) as number;
      try {
        const buf = await getRawBody(req, { limit: maxMB * 1024 * 1024 });
        const fakeFile = {
          fieldname: "file",
          originalname: "blob",
          encoding: "7bit",
          mimetype: req.headers["content-type"] || "application/octet-stream",
          buffer: buf,
          size: buf.length,
          stream: Readable.from(buf),
          destination: "",
          filename: "blob",
          path: ""
        };
        // @ts-ignore
        req.files = [fakeFile];
        next();
      } catch (err: any) {
        if (err.type === "entity.too.large") {
          logger.warn("rawUploadFile - Upload attempt failed: File too large", "|", getClientInfo(req).ip);
          return res.status(413).send({ status: "error", message: `File too large, max is ${maxMB}MB` });
        }
        next(err);
      }
    };
};

export { multipartUploadMiddleware, rawUploadMiddleware };