import { Application } from "express";
import express from "express";
import multer from "multer";
import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/ips.js";
import app from "../app.js";
import { limiter } from "../lib/session.js";

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

const maxMBfilesize: number = app.get("config.media")["maxMBfilesize"];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMBfilesize * 1024 * 1024 },
});

export const loadAdminEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version == "v2") {

        // Stop the server
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/stop", limiter(), StopServer);

        // Legacy status endpoint
        app.get("/api/" + version + "/status", limiter(), (_req, res) => {
            res.redirect("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status");
        });

        // Get server status
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/status", limiter(), serverStatus);

        // Reset user password
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/resetpassword/",
            limiter(),
            express.json(), resetUserPassword);

        // Update a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updaterecord/",
            limiter(),
            express.json(), updateDBRecord);

        // Delete a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/deleterecord/",
            limiter(),
            express.json(), deleteDBRecord);

        // Insert a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/insertrecord/",
            limiter(),    
            express.json(), insertDBRecord);

        // Moderate a database record
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moderaterecord",
            limiter(),
            express.json(), moderateDBRecord);

        // Update settings
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatesettings/",
            limiter(),
            express.json(), updateSettings);

        // Upload frontend logo (handles files)
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatelogo/", 
            limiter(),
            function (req, res) {
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
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/updatetheme/", limiter(), express.json({ limit: "1mb" }), updateTheme);

        // Get module data
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moduledata", limiter(), getModuleData);
        app.get("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/moduleCountdata", limiter(), getModuleCountData);

        // Ban a remote source
        app.post("/api/" + version + app.get("config.server")["availableModules"]["admin"]["path"] + "/ban",
            limiter(),
            express.json(), banDBRecord);
    }

};
