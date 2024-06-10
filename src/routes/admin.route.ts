import { Application } from "express";
import multer from "multer";
import config from "config";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";

import {deleteDBRecord, 
        serverStatus, 
        StopServer, 
        resetUserPassword, 
        updateDBRecord, 
        insertDBRecord, 
        updateSettings, 
        updateLogo, 
} from "../controllers/admin.js";

const maxMBfilesize :number = config.get('media.maxMBfilesize');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const loadAdminEndpoint = async (app: Application, version:string): Promise<void> => {

        if (version == "v2"){

                app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/stop", StopServer)

                // Legacy status endpoint
                app.get("/api/" + version + "/status", (_req, res) => {
                        res.redirect("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status");
                });

                app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status", serverStatus);

                // Reset user password
                app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/resetpassword/", resetUserPassword);

                // Update DB record
                app.post("/api/" + version +app.get("config.server")["availableModules"]["admin"]["path"] + "/updaterecord/", updateDBRecord);

                // Delete DB record
                app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/deleterecord/", deleteDBRecord);

                // Insert DB record
                app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/insertrecord/", insertDBRecord);

                // Update settings value
                app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatesettings/", updateSettings);

                // Update frontend logo
                app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] +  "/updatelogo/", function (req, res){
                        logger.debug("POST /api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatelogo", "|", getClientIp(req));
                        upload.any()(req, res, function (err) {
                                //Return 413 Payload Too Large if file size is larger than maxMBfilesize from config file
                                if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
                                        logger.warn("Upload attempt failed: File too large", "|", getClientIp(req));
                                        return res.status(413).send({"status": "error", "message": "File too large, max filesize allowed is " + maxMBfilesize + "MB"});
                                }
                                updateLogo(req, res);
                        })
                });

        }

};