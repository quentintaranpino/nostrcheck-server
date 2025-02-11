import { Application } from "express";
import { verifyEventController } from "../controllers/verify.js";
import express from "express";
import { limiter } from "../lib/security/core.js";

export const loadVerifyEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version == "v1" || version == "v2") {
        app.post("/api/" + version + app.get("config.server")["availableModules"]["verify"]["path"],
            limiter(),
            express.json(), 
            verifyEventController
        );
    }

};