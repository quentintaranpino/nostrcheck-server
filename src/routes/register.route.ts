import { Application, } from "express";
import {Registernewpubkey} from "../controllers/register"

export const LoadRegisterEndpoint = async (app: Application): Promise<void>=> {
	app.get("/api/v1/register", Registernewpubkey);
};
