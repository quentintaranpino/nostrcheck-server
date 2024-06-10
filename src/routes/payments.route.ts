import { Application } from "express";
import { addBalanceUser, payDBRecord } from "../controllers/payments.js";

export const loadPaymentsEndpoint = async (app: Application, version:string): Promise<void> => {

        if (version == "v2"){

                // Pay item
                app.post("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/payitem/", payDBRecord);

                // Add balance to user
                app.post("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/addbalance/", addBalanceUser);

        }

};