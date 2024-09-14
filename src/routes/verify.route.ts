import { Application } from "express";
import { verifyEventController } from "../controllers/verify.js";
import express from "express";

export const loadVerifyEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version == "v1" || version == "v2") {
        app.post("/api/" + version + app.get("config.server")["availableModules"]["verify"]["path"],
            express.json(), 
            verifyEventController
        );
    }

};
