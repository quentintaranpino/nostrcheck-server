import { Application } from "express";

// Endpoint for restart and stop the server
import { ServerStatus, StopServer } from "../controllers/admin.js";


export const loadAdminEndpoint = async (app: Application, _version:string): Promise<void> => {

        app.post("/api/v2/admin/stop", StopServer)
        app.get("/api/v2/status", ServerStatus);

};