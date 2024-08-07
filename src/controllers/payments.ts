
import { Request, Response } from "express";

import app from "../app.js";

import { logger } from "../lib/logger.js";
import { getClientIp } from "../lib/utils.js";
import { ResultMessagev2, authkeyResultMessage } from "../interfaces/server.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { isModuleEnabled} from "../lib/config.js";
import { payInvoiceFromExpenses, addBalance, getBalance, formatAccountNumber, getInvoice, calculateSatoshi } from "../lib/payments/core.js";
import { dbMultiSelect } from "../lib/database.js";
import { isInvoicePaid } from "../lib/payments/getalby.js";
import { amountReturnMessage, invoiceReturnMessage } from "../interfaces/payments.js";
import { getDomainInfo } from "../lib/domains.js";


/**
 * Pays an item from the expenses account.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const payTransaction = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> payItem", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "payItem", true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (req.body.transactionid === undefined || req.body.transactionid === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const payTransaction = await payInvoiceFromExpenses(req.body.transactionid)
    if (payTransaction) {
        const result : authkeyResultMessage = {
            status: "success",
            message: 1,
            authkey: EventHeader.authkey
            };
        logger.info("RES -> Item paid" + " | " + getClientIp(req));
        return res.status(200).send(result);
    }
    return res.status(500).send({"status": "error", "message": "Failed to pay item", "authkey": EventHeader.authkey});
}

const addBalanceUser = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> addBalance", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

    // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "addBalance", true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}

    // Check if the request has the required parameters
    if (req.body.id === undefined || req.body.id === null || req.body.amount === undefined || req.body.amount === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const accountid = formatAccountNumber(req.body.id)
    const balance = await addBalance(accountid, req.body.amount)
    if (balance) {
        const userBalance = await getBalance(accountid);
        const result : authkeyResultMessage = {
            status: "success",
            message: userBalance.toString(),
            authkey: EventHeader.authkey
            };
        logger.info("RES -> Balance added: " + req.body.amount +  " | " + req.body.accountid + " | " + getClientIp(req));
        return res.status(200).send(result);
    }
    return res.status(500).send({"status": "error", "message": "Failed to add balance"});
}

const getInvoiceStatus = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> getInvoiceStatus", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

    // Check if the request has the required parameters
    if (req.params.payreq === undefined || req.params.payreq === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const invoiceId = await dbMultiSelect(["id"], "transactions", "paymentrequest = ?", [req.params.payreq])
    if (invoiceId.length == 0) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invoice not found"
            };
        logger.error("RES -> Invoice not found" + " | " + getClientIp(req));
        return res.status(404).send(result);
    }

    const invoice = await getInvoice(invoiceId[0].id)
    if (invoice.isPaid == false) {
        const paiddate = await isInvoicePaid(invoice.paymentHash);
        if (paiddate != "") {
            invoice.paidDate = paiddate;
            invoice.isPaid = true;
        }
    }

    logger.info("RES -> Invoice status: " + invoice.paymentHash + " | " + getClientIp(req));

    const result : invoiceReturnMessage = {
        status: "success",
        message: "Invoice status",
        invoice: invoice
        };

    return res.status(200).send(result);
}

const calculateObjectAmount = async (req: Request, res: Response): Promise<Response> => {

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.warn("Attempt to access a non-active module:","admin","|","IP:", getClientIp(req));
        return res.status(400).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info("REQ -> calculatePayment", req.hostname, "|", getClientIp(req));
    res.setHeader('Content-Type', 'application/json');

    // Check if the request has the required parameters
    if (req.body.size === undefined || req.body.size === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error("RES -> Invalid parameters" + " | " + getClientIp(req));
        return res.status(400).send(result);
    }

    const size = req.body.size;
    const domain = req.body.domain || "";
    const domainInfo = await getDomainInfo(domain)

    const satoshi = await calculateSatoshi(domain != "" ? 'registered': 'mediafiles', size, domainInfo != "" ? domainInfo.maxsatoshi : app.get("config.payments")["satoshi"]["mediaMaxSatoshi"]);

    const result : amountReturnMessage = {
        status: "success",
        message: "Calculated satoshi successfully",
        amount: satoshi
        };
    logger.info(`RES -> Calculated satoshi: ${satoshi} for object ${domain != "" ? domain : 'media'} | ${getClientIp(req)}`);
    return res.status(200).send(result);
    
}

export {
        payTransaction,
        addBalanceUser,
        getInvoiceStatus,
        calculateObjectAmount
}