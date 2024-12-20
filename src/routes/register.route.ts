import { Application } from "express";
import express from "express";
import { validateRegisterOTC, registerUsername } from "../controllers/register.js";
import { limiter } from "../lib/session.js";

export const loadRegisterEndpoint = async (app: Application, version: string): Promise<void> => {

    const limitMessage = { status: "error", message: "Rate limit exceeded. Try again later." };

    if (version == "v1" || version == "v2") {
        app.post("/api/" + version + app.get("config.server")["availableModules"]["register"]["path"],
            express.json(), 
            limiter(app.get('config.security')['register']['maxRegisterDay'], limitMessage, 24 * 60 * 60 * 1000),
            registerUsername
        );
    }

    if (version == "v1" || version == "v2") {
        app.post("/api/" + version + app.get("config.server")["availableModules"]["register"]["path"] + "/validate",
            express.json(), 
            limiter(app.get('config.security')['register']['maxRegisterDay'], limitMessage, 24 * 60 * 60 * 1000),
            validateRegisterOTC
        );
    }

};
