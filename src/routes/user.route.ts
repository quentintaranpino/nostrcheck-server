import express, { Application } from "express";
import { limiter } from "../lib/session.js";
import { getUserPrefs, setUserPrefs } from "../controllers/user.js";

export const loadUserEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version != "v2") return;

    // Update or set user preferences
    app.post("/api/" + version + "/user/setprefs", limiter(), express.json(), setUserPrefs);

    // Get user preferences
    app.get("/api/" + version + "/user/getprefs", limiter(), express.json(), getUserPrefs);

};