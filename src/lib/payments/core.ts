import app from "../../app.js";
import { checkPaymentResult, invoice } from "../../interfaces/payments.js";
import { dbInsert, dbMultiSelect, dbSelect, dbUpdate } from "../database.js"
import { logger } from "../logger.js";
import { generateGetalbyInvoice, isInvoicePaid } from "./getalby.js";

const checkPayment = async (transactionid : string, originId: string, orginTable : string): Promise<checkPaymentResult | string> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return {paymentRequest: "", satoshi: 0};
    }

    const isPaid = await dbSelect("SELECT paid FROM transactions WHERE id = ?", "paid", [transactionid])
    if (isPaid) {
        logger.debug("Mediafile is already paid")
        return {paymentRequest: "", satoshi: 0};
    }

    const existPayReq = await dbMultiSelect("SELECT paymentrequest, satoshi, pubkey FROM transactions WHERE id = ?", ["paymentrequest", "satoshi", "pubkey"], [transactionid]);
    if (existPayReq[0] && existPayReq[1] && existPayReq[2]) {
        logger.debug("Already generated invoice for payment, skipping", existPayReq)
        return {paymentRequest: existPayReq[0], satoshi: Number(existPayReq[1])};
    }

    const pubkey = await dbSelect("SELECT pubkey FROM " + orginTable + " WHERE id = ?", "pubkey", [originId]) as string;
    const balance = await getBalance(pubkey);
    const satoshi = Number(await dbSelect("SELECT satoshi FROM transactions WHERE id = ?", "satoshi", [transactionid])) || 1 // TODO set satoshi amount on settings
    
    logger.debug("Balance for pubkey " + pubkey + " :", balance)
    logger.debug("Requested payment for", satoshi, "satoshi")
    
    if (balance < satoshi) {
        const invoice = await generateLNInvoice(satoshi-balance);
        invoice.description = "Invoice for: " + orginTable + ":" + originId;
        const transId = await addTransacion("invoice", pubkey, invoice, satoshi-balance)
        await dbUpdate(orginTable, "transactionid", transId.toString() , "id", originId)
        logger.debug("Generated invoice for " + orginTable + ":" + originId, " satoshi: ", satoshi-balance, "transactionid: ", transId)

        await addJournalEntry(1, transId, 0, satoshi-balance, "Credit for " + orginTable + ":" + originId);
        logger.debug("Journal entry added for credit transaction", transId, originId, orginTable)

        return {paymentRequest: invoice.paymentRequest, satoshi: satoshi-balance};

    } else {
    
        const journalId = await addJournalEntry(1, 0, satoshi, 0, "Debit for " + orginTable + ":" + originId);
        if (journalId) {
            logger.debug("Journal entry added for debit transaction", journalId)
            return {paymentRequest: "", satoshi: 0};
        }
        logger.debug("Error adding journal entry for debit transaction", transactionid, originId, orginTable)
        return "";
    }
}

const generateLNInvoice = async (amount: number) : Promise<invoice> => {
    return await generateGetalbyInvoice(app.get("config.payments")["LNAddress"], amount);
}

const addTransacion = async (type: string, pubkey: string, invoice: invoice, satoshi: number) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }

    return await dbInsert(  "transactions",   
                            ["type",
                            "pubkey", 
                            "paymentrequest", 
                            "paymenthash", 
                            "satoshi", 
                            "paid", 
                            "createddate", 
                            "expirydate",
                            "comments"], 
                            [type, 
                            pubkey,
                            invoice.paymentRequest? invoice.paymentRequest : "", 
                            invoice.paymentHash? invoice.paymentHash : "", 
                            satoshi, 
                            (invoice.isPaid? 1 : 0).toString(), 
                            invoice.createdDate ? invoice.createdDate : new Date().toISOString().slice(0, 19).replace('T', ' '), 
                            invoice.expiryDate? invoice.expiryDate : new Date().toISOString().slice(0, 19).replace('T', ' '),
                            invoice.description? invoice.description : ""]
                        );
}

const addJournalEntry = async (accountid: number, transactionid: number, debit: number, credit: number, comments: string) : Promise<number> => {
    
    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }
    
    return await dbInsert(  "ledger", 
                            ["accountid", 
                            "transactionid", 
                            "debit", 
                            "credit", 
                            "createddate", 
                            "comments"], 
                            [accountid, 
                            transactionid, 
                            debit, 
                            credit, 
                            new Date().toISOString().slice(0, 19).replace('T', ' '), 
                            comments]
                        );

}

const getBalance = async (pubkey: string) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }

    const result = Number(await dbSelect("SELECT SUM(credit) - SUM(debit) as 'balance' FROM ledger LEFT JOIN transactions on ledger.transactionid = transactions.id WHERE transactions.pubkey = ? and paid = 1", "balance", [pubkey]));
    logger.debug("Balance for pubkey", pubkey, ":", result)
    return result;
}

const getPendingInvoices = async () : Promise<invoice[]> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return [];
    }

    const result = await dbMultiSelect("SELECT id, paymentrequest, paymenthash, createddate, expirydate, satoshi FROM transactions WHERE paid = 0", ["id", "paymentrequest", "paymenthash", "createddate", "expirydate", "satoshi"], ["paymenthash"], false);
    const invoices : invoice[] = [];
    result.forEach(async (invoiceString) => {
        const invoice = invoiceString.split(',');
        invoices.push({
            paymentRequest: invoice[1],
            paymentHash: invoice[2],
            createdDate: new Date(invoice[3]),
            expiryDate: new Date(invoice[4]),
            description: "",
            isPaid: false,
            transactionid: Number(invoice[0]),
            satoshi: Number(invoice[5])
        });
    })
    return invoices;
}

setInterval(async () => {
    const pendingInvoices = await getPendingInvoices();
    logger.debug("Pending invoices:", pendingInvoices.length)
    for (const invoice of pendingInvoices) {
        const paiddate = await isInvoicePaid(invoice.paymentHash);
        if (paiddate != "")  {
            await dbUpdate("transactions", "paid", "1", "id", invoice.transactionid.toString());
            await dbUpdate("transactions", "paiddate", new Date(paiddate), "id", invoice.transactionid.toString());
            logger.info("Invoice paid, transaction updated", invoice.transactionid);
            await addJournalEntry(1, invoice.transactionid, invoice.satoshi, 0, "Payment for invoice: " + invoice.paymentHash);
            logger.info("Journal entry added for credit transaction", invoice.transactionid)
        }
    }
}, 10000);

export { checkPayment}