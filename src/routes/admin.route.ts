import { Application } from "express";
import express from "express";
import multer from "multer";
import cors from "cors";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/security/ips.js";
import app from "../app.js";
import { limiter } from "../lib/security/core.js";
import { getHostInfo } from "../lib/utils.js";


import {
    deleteDBRecord,
    serverStatus,
    StopServer,
    resetUserPassword,
    updateDBRecord,
    insertDBRecord,
    updateSettings,
    getModuleData,
    getModuleCountData,
    moderateDBRecord,
    banDBRecord,
    updateSettingsFile,
} from "../controllers/admin.js";

const adminCORS = {
    origin: getHostInfo().url,
    Credentials: true,
}

const maxMBfilesize: number = app.get("config.media")["maxMBfilesize"];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const loadAdminEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version == "v2") {

        // Stop the server
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/stop", limiter(), cors(adminCORS), StopServer);

        // Legacy status endpoint
        app.get("/api/" + version + "/status", limiter(), cors(adminCORS), (_req, res) => {
            res.redirect("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status");
        });

        // Get server status
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status", limiter(), cors(adminCORS), serverStatus);

        // Reset user password
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/resetpassword/",
            limiter(),
            cors(adminCORS),
            express.json(), resetUserPassword);

        // Update a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updaterecord/",
            limiter(),
            cors(adminCORS),
            express.json(), updateDBRecord);

        // Delete a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/deleterecord/",
            limiter(),
            cors(adminCORS),
            express.json(), deleteDBRecord);

        // Insert a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/insertrecord/",
            limiter(),    
            cors(adminCORS),
            express.json(), insertDBRecord);

        // Moderate a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moderaterecord",
            limiter(),
            cors(adminCORS),
            express.json(), moderateDBRecord);

        // Update settings
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatesettings/",
            limiter(),
            cors(adminCORS),
            express.json(), updateSettings);

        // Upload frontend settings file (handles files)
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatesettingsfile/", 
            limiter(),
            cors(adminCORS),
            function (req, res) {
            logger.debug("POST /api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/uploadfile", "|", getClientIp(req));
            upload.any()(req, res, function (err) {
                if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
                    logger.warn("Upload attempt failed: File too large", "|", getClientIp(req));
                    return res.status(413).send({ "status": "error", "message": "File too large, max filesize allowed is " + maxMBfilesize + "MB" });
                }
                updateSettingsFile(req, res);
            });
        });

        // Get module data
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moduledata", limiter(), cors(adminCORS),getModuleData);
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moduleCountdata", limiter(), cors(adminCORS), getModuleCountData);

        // Ban a remote source
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/ban",
            limiter(),
            cors(adminCORS),
            express.json(), banDBRecord);
    }

};
