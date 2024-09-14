import { Application } from "express";
import express from "express";
import multer from "multer";
import config from "config";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";

import {
    deleteDBRecord,
    serverStatus,
    StopServer,
    resetUserPassword,
    updateDBRecord,
    insertDBRecord,
    updateSettings,
    updateLogo,
    getModuleData,
    getModuleCountData,
    updateTheme,
    moderateDBRecord,
    banDBRecord
} from "../controllers/admin.js";

const maxMBfilesize: number = config.get('media.maxMBfilesize');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const loadAdminEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version == "v2") {

        // Stop the server
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/stop", StopServer);

        // Legacy status endpoint
        app.get("/api/" + version + "/status", (_req, res) => {
            res.redirect("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status");
        });

        // Get server status
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status", serverStatus);

        // Reset user password
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/resetpassword/",
            express.json(), resetUserPassword);

        // Update a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updaterecord/",
            express.json(), updateDBRecord);

        // Delete a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/deleterecord/",
            express.json(), deleteDBRecord);

        // Insert a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/insertrecord/",
            express.json(), insertDBRecord);

        // Moderate a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moderaterecord",
            express.json(), moderateDBRecord);

        // Update settings
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatesettings/",
            express.json(), updateSettings);

        // Upload frontend logo (handles files)
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatelogo/", function (req, res) {
            logger.debug("POST /api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatelogo", "|", getClientIp(req));
            upload.any()(req, res, function (err) {
                if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
                    logger.warn("Upload attempt failed: File too large", "|", getClientIp(req));
                    return res.status(413).send({ "status": "error", "message": "File too large, max filesize allowed is " + maxMBfilesize + "MB" });
                }
                updateLogo(req, res);
            });
        });

        // Update frontend theme
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatetheme/", express.json({ limit: "1mb" }), updateTheme);

        // Get module data
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moduledata", getModuleData);
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moduleCountdata", getModuleCountData);

        // Ban a remote source
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/ban",
            express.json(), banDBRecord);
    }

};
