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

    const pubkey = await dbSelect("SELECT pubkey FROM " + orginTable + " WHERE id = ?", "pubkey", [originId]) as string;
    const satoshi = Number(await dbSelect("SELECT satoshi FROM transactions WHERE id = ?", "satoshi", [transactionid])) || 1 // TODO set satoshi amount on settings
    const balance = await getBalance(pubkey);

    logger.debug("Balance for pubkey " + pubkey + " :", balance)
    logger.debug("Requested payment for", satoshi, "satoshi")
    
    if (balance < satoshi) {

        const payReq = await dbSelect("SELECT paymentrequest FROM transactions WHERE id = ?", "paymentrequest", [transactionid]) as string;
        if (payReq) {
            logger.debug("Already generated invoice for payment, skipping", payReq)
            return {paymentRequest: payReq, satoshi: satoshi-balance};
        }

        const invoice = await generateLNInvoice(satoshi-balance);

        await dbUpdate(orginTable, "transactionid", (await addTransacion("credit", pubkey, invoice, satoshi-balance)).toString(), "id", originId)
    
        logger.debug("Generated invoice for payment")
        return {paymentRequest: invoice.paymentRequest, satoshi: satoshi-balance};

    } else {
        const invoice = generateDebitInvoice();
        invoice.description = "Debit for ", orginTable, ":", originId;

        await dbUpdate(orginTable, "transactionid", (await addTransacion("debit", pubkey, invoice, -satoshi)).toString(), "id", originId)

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

const getBalance = async (pubkey: string) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }

    const result = Number(await dbSelect("SELECT SUM(satoshi) as 'balance' FROM transactions WHERE pubkey = ? and paid = 1", "balance", [pubkey]));
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

export { checkPayment, getBalance, addBalance, debitTransaction}