// https://github.com/getAlby/js-sdk
// https://github.com/getAlby/js-lightning-tools
import { LightningAddress } from "@getalby/lightning-tools";
import { invoice } from "../../interfaces/payments.js";
import app from "../../app.js";
import { logger } from "../logger.js";

const generateGetalbyInvoice = async (LNAddress: string, amount:number) : Promise<invoice> => {

    const ln = new LightningAddress(LNAddress);

    try{
        await ln.fetch();
        const getalbyInvoice = await ln.requestInvoice({ satoshi: amount });
        return {accountid: 1, paymentRequest: getalbyInvoice.paymentRequest, paymentHash: getalbyInvoice.paymentHash, createdDate: getalbyInvoice.createdDate, expiryDate: getalbyInvoice.expiryDate, description: getalbyInvoice.description, isPaid: false, satoshi: getalbyInvoice.satoshi, transactionid: 0};
        
    }catch(e){
        logger.error("Error generating invoice", e);
        return {accountid: 0, paymentRequest: "", paymentHash: "", createdDate: "", expiryDate: "", description: "", isPaid: false, satoshi: amount, transactionid: 0};
    }

}

const isInvoicePaid = async (paymentHash: string) : Promise<string> => {

    const authToken = app.get("config.payments")["getalby"]["authToken"];

    try{
        const response = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.preimage && data.preimage != "null") {
            return data.settled_at;
        }
        return "";
    }catch(e){
        logger.error("Error checking invoice status", e);
        return "";
    }
}

const getInvoiceQR = async (paymentHash: string) : Promise<string> => {

    const authToken = app.get("config.payments")["getalby"]["authToken"];

    try{
        const response = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        return data.qr_code_png;
    }catch(e){
        logger.error("Error getting invoice QR code", e);
        return "";
    }

}

export { generateGetalbyInvoice, isInvoicePaid, getInvoiceQR }