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

const generateDebitInvoice = () => {

    const emptyInvoice : invoice = {
        paymentRequest: "",
        paymentHash: "",
        createdDate: "",
        expiryDate: "",
        description: "",
        isPaid: async () => {return true},
        verifyPayment: async () => {return true}
    }
    return emptyInvoice;
}

const addTransacion = async (type: string, pubkey: string, invoice: invoice, satoshi: number) : Promise<number> => {

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
                            (await invoice.isPaid()? 1 : 0).toString(), 
                            invoice.createdDate ? invoice.createdDate : new Date().toISOString().slice(0, 19).replace('T', ' '), 
                            invoice.expiryDate? invoice.expiryDate : new Date().toISOString().slice(0, 19).replace('T', ' '),
                            invoice.description? invoice.description : ""]
                        );
}

const debitTransaction = async (transactionid: string, paymenthash: string) : Promise<Boolean> => {

    if ((transactionid == "" || transactionid == undefined) && (paymenthash == "" || paymenthash == undefined)) {return false;}

    const type = paymenthash? "paymenthash" : "id";

    const result = await dbMultiSelect("SELECT pubkey, satoshi FROM transactions WHERE " + type + " = ?", ["pubkey", "satoshi"], [paymenthash || transactionid]);

    const invoice = generateDebitInvoice();
    invoice.description = "Debit invoice: " + (paymenthash || transactionid);
    await addTransacion("debit", result[0], invoice, - result[1]);
    
    return await dbUpdate("transactions", "paid", "1", type, paymenthash || transactionid);

}

const addBalance = async (pubkey: string, satoshi: number) => {
    
        if (pubkey == "" || pubkey == undefined || satoshi == 0 || satoshi == undefined) {return false;}
    
        const balance = await getBalance(pubkey);
        logger.info("Adding balance to pubkey " + pubkey + " :", satoshi, "satoshi. New balance: ", balance + satoshi)
    
        const invoice = generateDebitInvoice();
        invoice.description = "Add balance: " + satoshi;
        await addTransacion("debit", pubkey, invoice, satoshi);
}

const addJournalEntry = async (accountid: number, transactionid: number, debit: number, credit: number, comments: string) : Promise<number> => {
    return await dbInsert("ledger", ["accountid", "transactionid", "debit", "credit", "createddate", "comments"], [accountid, transactionid, debit, credit, new Date().toISOString().slice(0, 19).replace('T', ' '), comments]);
}


const getBalance = async (pubkey: string) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }

    const result = Number(await dbSelect("SELECT SUM(credit) - SUM(debit) as 'balance' FROM ledger LEFT JOIN transactions on ledger.transactionid = transactions.id WHERE transactions.pubkey = ? and paid = 1", "balance", [pubkey]));
    return result;
}

const getPendingInvoices = async () => {
    const result = await dbSelect("SELECT paymenthash FROM transactions WHERE paid = 0", "paymenthash", ["paymenthash"], false);
    return result;
}

setInterval(async () => {
    const pendingInvoices = await getPendingInvoices();
    logger.debug("pending invoices:", pendingInvoices)

    for (const invoiceHash of pendingInvoices) {
        const paid = await isInvoicePaid(invoiceHash);
        if (paid) {
            await debitTransaction("", invoiceHash)? logger.info(`Payment has been made. Invoice: ${invoiceHash}`) : logger.error(`Error creating debit transaction for invoice paymenthash: ${invoiceHash}`);
        }
    }
}, 10000);

export { checkPayment, debitTransaction}