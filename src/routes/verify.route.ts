import { Application } from "express";
import express from "express";

import { limiter } from "../lib/security/core.js";
import { getModuleInfo } from "../lib/config/core.js";
import { verifyEventController } from "../controllers/verify.js";

export const loadVerifyEndpoint = async (app: Application, version: string): Promise<void> => {

    const base = `/api/${version}${getModuleInfo("verify", "")?.path}`;

    // Verify event endpoint
    app.post(`${base}`, limiter(), express.json(), verifyEventController);

};