import { transactionsTableFields } from "../../interfaces/database.js";
import { invoice } from "../../interfaces/payments.js";
import { dbInsert, dbMultiSelect, dbSelect, dbUpdate } from "../database.js"
import { logger } from "../logger.js";
import { generateGetalbyInvoice, getInvoiceQR, isInvoicePaid } from "./getalby.js";

const requestPayment = async (pubkey: string, satoshi: number, mediaid: string = "0"): Promise<string> => {

    if (pubkey == "" || pubkey == undefined || satoshi == 0 || satoshi == undefined) {return "";}

    if (await isMediaPaid(mediaid, pubkey)) {
        logger.debug("Mediafile is already paid")
        return "";}

    const balance = await getBalance(pubkey);
    logger.debug("Balance: ", balance, "Invoice satoshi amount: ", satoshi)

    if (balance < satoshi) {
        const invoice = await generateLNInvoice(satoshi-balance);

        if (mediaid != "0"){
            await dbUpdate("mediafiles", "transactionid", (await addTransacion("credit", pubkey, invoice, satoshi-balance)).toString(), "id", mediaid)
        }else{
            await addTransacion("credit", pubkey, invoice, satoshi-balance);
        };
        logger.debug("Generated invoice for payment")
        return getInvoiceQR(invoice.paymentHash);

    } else {
        const invoice = generateDebitInvoice();
        invoice.description = "Debit media file: " + mediaid;

        if (mediaid != "0"){
            await dbUpdate("mediafiles", "transactionid", (await addTransacion("debit", pubkey, invoice, -satoshi)).toString(), "id", mediaid)
        }else{
            await addTransacion("debit", pubkey, invoice, -satoshi);
        };

        logger.debug("Local balance used for payment")
        return "";
    }
}

const generateLNInvoice = async (amount: number) : Promise<invoice> => {
    return await generateGetalbyInvoice("nostrcheckme@getalby.com", amount);
}

const generateDebitInvoice = () => {

    const emptyInvoice : invoice = {
        paymentRequest: "",
        paymentHash: "",
        createdDate: "",
        expiryDate: "",
        description: "",
        isPaid: () => {return true},
        verifyPayment: () => {return true}
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

const payTransaction = async (transactionid: string, paymenthash: string) => {

    if ((transactionid == "" || transactionid == undefined) && (paymenthash == "" || paymenthash == undefined)) {return false;}

    const type = paymenthash? "paymenthash" : "id";

    const result = await dbMultiSelect("SELECT pubkey, satoshi FROM transactions WHERE " + type + " = ?", ["pubkey", "satoshi"], [paymenthash || transactionid], transactionsTableFields);

    const invoice = generateDebitInvoice();
    invoice.description = "Debit invoice: " + paymenthash;
    await addTransacion("debit", result[0], invoice, - result[1]);
    
    return await dbUpdate("transactions", "paid", "1", type, paymenthash || transactionid);

}

const getBalance = async (pubkey: string) => {
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


setInterval(async () => {
    const pendingInvoices = await getPendingInvoices();
    logger.debug("pending invoices:", pendingInvoices)

    for (const invoiceHash of pendingInvoices) {
        const paid = await isInvoicePaid(invoiceHash);
        if (paid) {
            await payTransaction("", invoiceHash)? logger.info(`Payment has been made. Invoice: ${invoiceHash}`) : logger.error(`Error updating payment status. Invoice: ${invoiceHash}`);
        }
    }
}, 10000);

export { requestPayment, getBalance}