import { Application } from "express";

import { ServerStatus, StopServer } from "../controllers/admin.js";

export const loadAdminEndpoint = async (app: Application, version:string): Promise<void> => {

        if (version == "v2"){

        app.post("/api/" + version + app.get("activeModules")["admin"]["path"] + "/stop", StopServer)
        app.get("/api/" + version + app.get("activeModules")["admin"]["path"] + "/status", ServerStatus);

        }

};