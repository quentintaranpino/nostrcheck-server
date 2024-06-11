import { Application } from "express";
import { addBalanceUser, payTransaction } from "../controllers/payments.js";

export const loadPaymentsEndpoint = async (app: Application, version:string): Promise<void> => {

        if (version == "v2"){

                // Pay item
                app.post("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/paytransaction/", payTransaction);

                // Add balance to user
                app.post("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/addbalance/", addBalanceUser);

        }

};