import { Application } from "express";
import express from "express";
import { addBalanceUser, payTransaction, getInvoiceStatus, calculateObjectAmount, getBalanceUser } from "../controllers/payments.js";

export const loadPaymentsEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version == "v2") {

        // Pay item
        app.post("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/paytransaction/",
            express.json(), 
            payTransaction
        );

        // Add balance to user
        app.post("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/addbalance/",
            express.json(), 
            addBalanceUser
        );
        
        // Get balance from user
        app.get("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/getbalance/",
            getBalanceUser
        );

        // Get invoice status 
        app.get("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/invoices/:payreq",
            getInvoiceStatus
        );

        // Calculate username satoshi amount
        app.post("/api/" + version + app.get("config.server")["availableModules"]["payments"]["path"] + "/calculateamount/",
            express.json(),
            calculateObjectAmount
        );

    }

};
