import { transactionsTableFields } from "../../interfaces/database.js";
import { invoice } from "../../interfaces/payments.js";
import { dbInsert, dbSelect, dbUpdate } from "../database.js"
import { logger } from "../logger.js";
import { generateGetalbyInvoice, getInvoiceQR, isInvoicePaid } from "./getalby.js";


const requestPayment = async (pubkey: string, satoshi: number): Promise<string> => {
    const balance = await getBalance(pubkey);
    console.log("pending invoices: ", await getPendingInvoices());

    if (balance < satoshi) {
        console.log("Balance: ", balance, "Invoice satoshi amount: ", satoshi-balance)
        const invoice = await generateLNInvoice(satoshi-balance);
        addTransacion(pubkey, invoice, satoshi-balance);
        return getInvoiceQR(invoice.paymentHash);
    } else {
        return "";
    }
}

const generateLNInvoice = async (amount: number) : Promise<invoice> => {
    
    return await generateGetalbyInvoice("nostrcheckme@getalby.com", amount);
}

const addTransacion = async (pubkey: string, invoice: invoice, satoshi: number) : Promise<Boolean> => {

    const result = await dbInsert(  "transactions",   
                                    ["pubkey", 
                                    "paymentrequest", 
                                    "paymenthash", 
                                    "satoshi", 
                                    "paid", 
                                    "createddate", 
                                    "expirydate"], 
                                    [pubkey,
                                    invoice.paymentRequest, 
                                    invoice.paymentHash, 
                                    satoshi, 
                                    false, 
                                    invoice.createdDate, 
                                    invoice.expiryDate]
                                );
    if (result != 0 ) {
        return true;
    } else {
        return false;
    }
}

const getBalance = async (pubkey: string) => {
    const result = Number(await dbSelect("SELECT SUM(satoshi) as 'balance' FROM transactions WHERE pubkey = ? and paid = 1", "balance", [pubkey], transactionsTableFields));
    return result;
}

const getPendingInvoices = async () => {
    const result = await dbSelect("SELECT paymenthash FROM transactions WHERE paid = 0", "paymenthash", ["paymenthash"], transactionsTableFields, false);
    return result;
}

setInterval(async () => {
    const pendingInvoices = await getPendingInvoices();
    console.log("pending", pendingInvoices)

    for (const invoiceHash of pendingInvoices) {
        const paid = await isInvoicePaid(invoiceHash);
        if (paid) {
            const result = await dbUpdate("transactions", "paid", "1", "paymenthash", invoiceHash);
            if (result != false) {
                logger.info(`Payment has been made. Invoice: ${invoiceHash}`);
            }else{
                logger.error(`Error updating payment status. Invoice: ${invoiceHash}`);
            }
        }
    }
}, 5000);

export { requestPayment, getBalance}