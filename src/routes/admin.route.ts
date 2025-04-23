import { Application } from "express";
import express from "express";
import cors from "cors";

import { limiter } from "../lib/security/core.js";
import { getHostInfo } from "../lib/utils.js";
import { getModuleInfo } from "../lib/config/core.js";
import { multipartUploadMiddleware } from "../lib/middleware/upload.js";

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
    origin: getHostInfo("").url,
    Credentials: true,
}

export const loadAdminEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version !== "v2") return;

    const base = `/api/${version}${getModuleInfo("admin", "")?.path}`;

    // Stop the server
    app.post(`${base}/stop`, limiter(), cors(adminCORS), StopServer);

    // Get server status
    app.get(`${base}/status`, limiter(), cors(adminCORS), serverStatus);

    // Reset user password
    app.post(`${base}/resetpassword`, limiter(), cors(adminCORS), express.json(), resetUserPassword);

    // Update/insert/delete/moderate DB records
    app.post(`${base}/updaterecord`, limiter(), cors(adminCORS), express.json(), updateDBRecord);
    app.post(`${base}/insertrecord`, limiter(), cors(adminCORS), express.json(), insertDBRecord);
    app.post(`${base}/deleterecord`, limiter(), cors(adminCORS), express.json(), deleteDBRecord);
    app.post(`${base}/moderaterecord`, limiter(), cors(adminCORS), express.json(), moderateDBRecord);
    app.post(`${base}/ban`, limiter(), cors(adminCORS), express.json(), banDBRecord);

    // Update settings
    app.post(`${base}/updatesettings`, limiter(), cors(adminCORS), express.json(), updateSettings);

    // Upload frontend settings file (handles files)
    app.post(`${base}/updatesettingsfile`, limiter(), cors(adminCORS), multipartUploadMiddleware(), updateSettingsFile);

    // Module data endpoints
    app.get(`${base}/moduledata`, limiter(), cors(adminCORS), getModuleData);
    app.get(`${base}/modulecountdata`, limiter(), cors(adminCORS), getModuleCountData);

    // Ban a remote source
    app.post(`${base}/ban`, limiter(), cors(adminCORS), express.json(), banDBRecord);

};