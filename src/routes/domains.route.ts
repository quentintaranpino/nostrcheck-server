import { Application, } from "express";
import {AvailableDomains} from "../controllers/domains"

export const LoadDomainsEndpoint = async (app: Application): Promise<void>=> {
	app.get("/api/v1/domains", AvailableDomains);
};
