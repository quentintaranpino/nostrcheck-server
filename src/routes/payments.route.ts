import { Application } from "express";
import express from "express";

import { limiter } from "../lib/security/core.js";
import { getModuleInfo } from "../lib/config/core.js";
import { addBalanceUser, payTransaction, getInvoiceStatus, getBalanceUser } from "../controllers/payments.js";

export const loadPaymentsEndpoint = async (app: Application, version: string): Promise<void> => {

    if (version != "v2") return;

	const base = `/api/${version}${getModuleInfo("payments", "")?.path}`;

    // Pay item
    app.post(`${base}/paytransaction/`,
        limiter(),
        express.json(), 
        payTransaction
    );

    // Add balance to user
    app.post(`${base}/addbalance/`,
        limiter(),
        express.json(), 
        addBalanceUser
    );
    
    // Get balance from user
    app.get(`${base}/getbalance/`,
        limiter(),
        getBalanceUser
    );

    // Get invoice status 
    app.get(`${base}/invoices/:payreq`,
        limiter(),
        getInvoiceStatus
    );

};
