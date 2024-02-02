import { Application } from "express";

import { ServerStatus, StopServer } from "../controllers/admin.js";
import { sendNostrDM } from "../controllers/nostr.js";

export const loadAdminEndpoint = async (app: Application, version:string): Promise<void> => {

        if (version == "v2"){

                app.post("/api/" + version + app.get("activeModules")["admin"]["path"] + "/stop", StopServer)

                // Legacy status endpoint
                app.get("/api/" + version + "/status", (_req, res) => {
                        res.redirect("/api/" + version + app.get("activeModules")["admin"]["path"] + "/status");
                });

                app.get("/api/" + version + app.get("activeModules")["admin"]["path"] + "/status", ServerStatus);

                // Server NIP04 nostr DM's
                app.get("/api/" + version + app.get("activeModules")["admin"]["path"] + "/sendnote/:pubkey/:message", sendNostrDM);

        }

};