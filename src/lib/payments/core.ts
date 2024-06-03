import app from "../../app.js";
import { transactionsTableFields } from "../../interfaces/database.js";
import { checkPaymentResult, invoice } from "../../interfaces/payments.js";
import { dbInsert, dbMultiSelect, dbSelect, dbUpdate } from "../database.js"
import { logger } from "../logger.js";
import { generateGetalbyInvoice, getInvoiceQR, isInvoicePaid } from "./getalby.js";

const checkPayment = async (pubkey: string, satoshi: number, mediaid: string = "0"): Promise<checkPaymentResult | string> => {

    if (pubkey == "" || pubkey == undefined || satoshi == 0 || satoshi == undefined) {return "";}

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return {paymentRequest: "", satoshi: 0};
    }

    if (await isMediaPaid(mediaid, pubkey)) {
        logger.debug("Mediafile is already paid")
        return {paymentRequest: "", satoshi: 0};
    }

    const balance = await getBalance(pubkey);

    logger.debug("Balance for pubkey " + pubkey + " :", balance)
    logger.debug("Requested payment for", satoshi, "satoshi")
    
    if (balance < satoshi) {

        const transactionExist = await getMediaPaymentRequest(mediaid)
        if (transactionExist) {
            logger.debug("Mediafile already has a transaction")
            return {paymentRequest: transactionExist, satoshi: satoshi-balance};
        }

        const invoice = await generateLNInvoice(satoshi-balance);

        if (mediaid != "0"){
            await dbUpdate("mediafiles", "transactionid", (await addTransacion("credit", pubkey, invoice, satoshi-balance)).toString(), "id", mediaid)
        }else{
            await addTransacion("credit", pubkey, invoice, satoshi-balance);
        };
        logger.debug("Generated invoice for payment")
        return {paymentRequest: invoice.paymentRequest, satoshi: satoshi-balance};

    } else {
        const invoice = generateDebitInvoice();
        invoice.description = "Debit media file: " + mediaid;

        if (mediaid != "0"){
            await dbUpdate("mediafiles", "transactionid", (await addTransacion("debit", pubkey, invoice, -satoshi)).toString(), "id", mediaid)
        }else{
            await addTransacion("debit", pubkey, invoice, -satoshi);
        };

        logger.debug("Local balance used for payment")
        return {paymentRequest: "", satoshi: 0};
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

    const test = new Date().toString();

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

const debitTransaction = async (transactionid: string, paymenthash: string) => {

    if ((transactionid == "" || transactionid == undefined) && (paymenthash == "" || paymenthash == undefined)) {return false;}

    const type = paymenthash? "paymenthash" : "id";

    const result = await dbMultiSelect("SELECT pubkey, satoshi FROM transactions WHERE " + type + " = ?", ["pubkey", "satoshi"], [paymenthash || transactionid], transactionsTableFields);

    const invoice = generateDebitInvoice();
    invoice.description = "Debit invoice: " + paymenthash;
    await addTransacion("debit", result[0], invoice, - result[1]);
    
    return await dbUpdate("transactions", "paid", "1", type, paymenthash || transactionid);

}

const getBalance = async (pubkey: string) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }

    const result = Number(await dbSelect("SELECT SUM(satoshi) as 'balance' FROM transactions WHERE pubkey = ? and paid = 1", "balance", [pubkey], transactionsTableFields));
    return result;
}

const getPendingInvoices = async () => {
    const result = await dbSelect("SELECT paymenthash FROM transactions WHERE paid = 0", "paymenthash", ["paymenthash"], transactionsTableFields, false);
    return result;
}

const isMediaPaid = async (mediaid: string, pubkey:string) : Promise<boolean> => {
    const result = await dbSelect("SELECT paid FROM transactions INNER JOIN mediafiles ON transactions.id = mediafiles.transactionid WHERE mediafiles.id = ? and mediafiles.pubkey = ?", "paid", [mediaid, pubkey], transactionsTableFields);
    return Boolean(result);
}

const getMediaPaymentHash = async (mediaid: string) : Promise<string> => {
    const result = await dbSelect("SELECT paymenthash FROM transactions INNER JOIN mediafiles on transactions.id = mediafiles.transactionid WHERE mediafiles.id = ?", "paymenthash", [mediaid], transactionsTableFields) as string;
    return result;
}

const getMediaPaymentRequest = async (mediaid: string) : Promise<string> => {
    const result = await dbSelect("SELECT paymentrequest FROM transactions INNER JOIN mediafiles on transactions.id = mediafiles.transactionid WHERE mediafiles.id = ?", "paymentrequest", [mediaid], transactionsTableFields) as string;
    return result;
}


setInterval(async () => {
    const pendingInvoices = await getPendingInvoices();
    logger.debug("pending invoices:", pendingInvoices)

    for (const invoiceHash of pendingInvoices) {
        const paid = await isInvoicePaid(invoiceHash);
        if (paid) {
            await debitTransaction("", invoiceHash)? logger.info(`Payment has been made. Invoice: ${invoiceHash}`) : logger.error(`Error updating payment status. Invoice: ${invoiceHash}`);
        }
    }
}, 10000);

export { checkPayment, getBalance}