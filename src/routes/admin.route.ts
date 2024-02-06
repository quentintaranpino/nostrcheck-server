import { Application } from "express";

import { deleteDBRecord, serverStatus, StopServer } from "../controllers/admin.js";
import { resetUserPassword, updateDBRecord } from "../controllers/admin.js";

export const loadAdminEndpoint = async (app: Application, version:string): Promise<void> => {

        if (version == "v2"){

                app.post("/api/" + version + app.get("activeModules")["admin"]["path"] + "/stop", StopServer)

                // Legacy status endpoint
                app.get("/api/" + version + "/status", (_req, res) => {
                        res.redirect("/api/" + version + app.get("activeModules")["admin"]["path"] + "/status");
                });

                app.get("/api/" + version + app.get("activeModules")["admin"]["path"] + "/status", serverStatus);

                // Reset user password
                app.post("/api/" + version + app.get("activeModules")["admin"]["path"] + "/resetpassword/", resetUserPassword);

                // Update DB record
                app.post("/api/" + version + app.get("activeModules")["admin"]["path"] + "/updaterecord/", updateDBRecord);

                // Delete DB record
                app.post("/api/" + version + app.get("activeModules")["admin"]["path"] + "/deleterecord/", deleteDBRecord);

        }

};