import { Request, Response } from "express";

import app from "../app.js";

import { logger } from "../lib/logger.js";
import { ResultMessagev2 } from "../interfaces/server.js";
import { parseAuthHeader} from "../lib/authorization.js";
import { isModuleEnabled} from "../lib/config.js";
import { payInvoiceFromExpenses, addBalance, getBalance, formatAccountNumber, getInvoice, calculateSatoshi, collectInvoice } from "../lib/payments/core.js";
import { dbMultiSelect } from "../lib/database.js";
import { isInvoicePaid } from "../lib/payments/core.js";
import { amountReturnMessage, invoiceReturnMessage } from "../interfaces/payments.js";
import { getDomainInfo } from "../lib/domains.js";
import { setAuthCookie } from "../lib/frontend.js";
import { isIpAllowed } from "../lib/security/ips.js";

/**
 * Pays an item from the expenses account.
 * 
 * @param req - The request object.
 * @param res - The response object.
 * @returns A promise that resolves to the response object.
 */
const payTransaction = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`payTransaction - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.info(`payTransaction - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`payTransaction - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

     // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "payItem", true, true, true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}
    setAuthCookie(res, EventHeader.authkey);

    // Check if the request has the required parameters
    if (req.body.transactionid === undefined || req.body.transactionid === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`payTransaction - Invalid parameters | ${reqInfo.ip}`);
        return res.status(400).send(result);
    }

    const payTransaction = await payInvoiceFromExpenses(req.body.transactionid)
    if (payTransaction) {
        const result : ResultMessagev2 = {
            status: "success",
            message: 1,
            };
        logger.info(`payTransaction - Paid for intem successfully: ${req.body.transactionid} | ${reqInfo.ip}`);
        return res.status(200).send(result);
    }
    logger.error(`payTransaction - Failed to pay item | ${reqInfo.ip}`);
    return res.status(500).send({"status": "error", "message": "Failed to pay item"});
}

const addBalanceUser = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`addBalanceUser - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.info(`addBalanceUser - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`addBalanceUser - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

    // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "addBalance", true, true, true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}
    setAuthCookie(res, EventHeader.authkey);

    // Check if the request has the required parameters
    if (req.body.id === undefined || req.body.id === null || req.body.amount === undefined || req.body.amount === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`addBalanceUser - Invalid parameters | ${reqInfo.ip}`);
        return res.status(400).send(result);
    }

    const accountid = formatAccountNumber(req.body.id)
    const balance = await addBalance(accountid, req.body.amount)
    if (balance) {
        const userBalance = await getBalance(accountid);

        const result : ResultMessagev2 = {
            status: "success",
            message: userBalance.toString(),
            };
        logger.info(`addBalanceUser - Added balance to user ${accountid} successfully | ${reqInfo.ip}`);
        return res.status(200).send(result);
    }
    logger.error(`addBalanceUser - Failed to add balance | ${reqInfo.ip}`);
    return res.status(500).send({"status": "error", "message": "Failed to add balance"});
}

const getInvoiceStatus = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`getInvoiceStatus - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.info(`getInvoiceStatus - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`getInvoiceStatus - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

    // Check if the request has the required parameters
    if (req.params.payreq === undefined || req.params.payreq === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`getInvoiceStatus - Invalid parameters | ${reqInfo.ip}`);
        return res.status(400).send(result);
    }

    const payment_hash = await dbMultiSelect(["paymenthash"], "transactions", "paymentrequest = ?", [req.params.payreq])
    if (payment_hash.length == 0) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invoice not found"
            };
        logger.error(`getInvoiceStatus - Invoice not found | ${reqInfo.ip}`);
        return res.status(404).send(result);
    }

    const invoice = await getInvoice(payment_hash[0].paymenthash);
    if (invoice.isPaid == false) {
        const paidInfo = await isInvoicePaid(invoice.paymentHash);
        if (paidInfo.paiddate != "" && paidInfo.paiddate != undefined && paidInfo.preimage != "" && paidInfo.preimage != undefined) {
            invoice.paidDate = paidInfo.paiddate;
            invoice.preimage = paidInfo.preimage;
            await collectInvoice(invoice, false, true);
        }
    }

    logger.info(`getInvoiceStatus - Invoice status sent successfully: ${invoice.paymentHash}, ispaid: ${invoice.isPaid} | ${reqInfo.ip}`);

    const result : invoiceReturnMessage = {
        status: "success",
        message: "Invoice status",
        invoice: invoice
        };

    return res.status(200).send(result);
}

const calculateObjectAmount = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.info(`calculateObjectAmount - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.info(`calculateObjectAmount - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }

    logger.info(`calculateObjectAmount - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

    // Check if the request has the required parameters
    if (req.body.size === undefined || req.body.size === null) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "Invalid parameters"
            };
        logger.error(`calculateObjectAmount - Invalid parameters | ${reqInfo.ip}`);
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
    logger.info(`calculateObjectAmount - Calculated satoshi successfully: ${satoshi}, size: ${size}, domain: ${domain} | ${reqInfo.ip}`);
    return res.status(200).send(result);
    
}

const getBalanceUser = async (req: Request, res: Response): Promise<Response> => {

    // Check if the request IP is allowed
	const reqInfo = await isIpAllowed(req);
	if (reqInfo.banned == true) {
		logger.warn(`getBalanceUser - Attempt to access ${req.path} with unauthorized IP:`, reqInfo.ip);
		return res.status(403).send({"status": "error", "message": reqInfo.comments});
	}

    // Check if current module is enabled
    if (!isModuleEnabled("admin", app)) {
        logger.info(`getBalanceUser - Attempt to access a non-active module: admin | IP:`, reqInfo.ip);
        return res.status(403).send({"status": "error", "message": "Module is not enabled"});
    }
    
    logger.info(`getBalanceUser - Request from:`, req.hostname, "|", reqInfo.ip);
    res.setHeader('Content-Type', 'application/json');

    // Check if authorization header is valid
    const EventHeader = await parseAuthHeader(req, "getBalance", false, true, true);
    if (EventHeader.status !== "success") {return res.status(401).send({"status": EventHeader.status, "message" : EventHeader.message});}
    setAuthCookie(res, EventHeader.authkey);

    const id = await dbMultiSelect(["id"], "registered", "hex = ?", [EventHeader.pubkey], false);

    if (id.length == 0) {
        const result : ResultMessagev2 = {
            status: "error",
            message: "User not found"
            };
        logger.error(`getBalanceUser - User not found, pubkey: ${EventHeader.pubkey} | ${reqInfo.ip}`);
        return res.status(404).send(result);
    }

    let balance = 0;

    for (const e of id) {
        balance += await getBalance(formatAccountNumber(e.id));
    }

    const result : ResultMessagev2 = {
        status: "success",
        message: balance.toString(),
    };
    logger.info(`getBalanceUser - Balance sent successfully: ${balance}, pubkey: ${EventHeader.pubkey} | ${reqInfo.ip}`);
    return res.status(200).send(result);

}

export {
    payTransaction,
    addBalanceUser,
    getBalanceUser,
    getInvoiceStatus,
    calculateObjectAmount
}