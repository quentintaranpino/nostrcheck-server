import { Application, } from "express";
import {Registernewpubkey} from "../controllers/register"

export const LoadRegisterEndpoint = async (app: Application): Promise<void>=> {
	app.post("/api/v1/register", Registernewpubkey);
<<<<<<< HEAD
};
=======
};
>>>>>>> 54fdac2a552bca94e3dbf2890fe4ef29f35d5ba1
