import { Application } from "express";
import express from "express";
import { redirectlightningddress, updateLightningAddress, deleteLightningAddress } from "../controllers/lightningaddress.js";
import { limiter } from "../lib/security/core.js";

export const loadLightningaddressEndpoint = async (app: Application, version: string): Promise<void> => {

    // Get lightning address redirect
    app.get("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"], 
        limiter(),
        redirectlightningddress); // V0 and V1

    app.get("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"] + "/:name", 
        limiter(),
        redirectlightningddress); // V2

    // Update lightning address
    app.put("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"] + "/:lightningaddress", 
        limiter(),
        express.json(), 
        updateLightningAddress);

    // Delete lightning address
    app.delete("/api/" + version + app.get("config.server")["availableModules"]["lightning"]["path"], 
        limiter(),
        deleteLightningAddress);

};
