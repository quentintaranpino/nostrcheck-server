import { Application } from "express";
import express from "express";

import { limiter } from "../lib/security/core.js";
import { getConfig, getModuleInfo } from "../lib/config/core.js";
import { validateRegisterOTC, registerUsername, checkUsernameAvailable } from "../controllers/register.js";

export const loadRegisterEndpoint = async (app: Application, version: string): Promise<void> => {

    const limitMessage = { status: "error", message: "Rate limit exceeded. Try again later." };

	const base = `/api/${version}${getModuleInfo("register", "")?.path}`;

    // Register endpoint
    app.post(`${base}`,
        express.json(), 
        limiter(getConfig(null, ["security", "register", "maxRegisterDay"]), limitMessage, 24 * 60 * 60 * 1000),
        registerUsername
    );

    // Validate OTC endpoint
    app.post(`${base}/validate`,
        express.json(), 
        limiter(getConfig(null, ["security", "register", "maxRegisterDay"]), limitMessage, 24 * 60 * 60 * 1000),
        validateRegisterOTC
    );

    // Username availability 
    app.get(`${base}/available`,
        limiter(60),
        checkUsernameAvailable
    );

}