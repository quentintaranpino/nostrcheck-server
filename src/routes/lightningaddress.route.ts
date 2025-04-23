import { Application } from "express";
import express from "express";
import { redirectlightningddress, updateLightningRedirect, deleteLightningRedirect } from "../controllers/lightningaddress.js";
import { limiter } from "../lib/security/core.js";
import { getModuleInfo } from "../lib/config/core.js";

export const loadLightningaddressEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version != "v1" && version != "v2") return;

    const base = `/api/${version}${getModuleInfo("lightning", "")?.path}`;

    // Route to redirect lightning address
    app.get(`${base}/:name`, limiter(), redirectlightningddress); 

    // Update lightning address
    app.put(`${base}/:lightningaddress`, limiter(), express.json(), updateLightningRedirect);

    // Delete lightning address
    app.delete(`${base}`, limiter(), express.json(), deleteLightningRedirect);

};
