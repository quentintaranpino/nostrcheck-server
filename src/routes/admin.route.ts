import { Application } from "express";

// Endpoint for restart and stop the server
import { ServerStatus, StopServer } from "../controllers/admin.js";


export const loadAdminEndpoint = async (app: Application, version:string): Promise<void> => {

        if (version == "v2"){

        app.post("/api/" + version + app.get("activeEndpoints")["admin"]["path"] + "/stop", StopServer)
        app.get("/api/" + version + app.get("activeEndpoints")["admin"]["path"] + "/status", ServerStatus);

        }

};