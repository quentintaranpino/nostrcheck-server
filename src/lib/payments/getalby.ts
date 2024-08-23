// https://github.com/getAlby/js-sdk
// https://github.com/getAlby/js-lightning-tools
import { LightningAddress } from "@getalby/lightning-tools";
import { emptyInvoice, invoice } from "../../interfaces/payments.js";
import app from "../../app.js";
import { logger } from "../logger.js";

const generateGetalbyInvoice = async (LNAddress: string, amount:number) : Promise<invoice> => {

    if (LNAddress == "" || amount == 0) return emptyInvoice;

    const ln = new LightningAddress(LNAddress);

    try{
        await ln.fetch();
        const getalbyInvoice = await ln.requestInvoice({ satoshi: amount });

        if (!getalbyInvoice || getalbyInvoice.paymentRequest == "") return emptyInvoice;

        return {paymentRequest: getalbyInvoice.paymentRequest, 
                paymentHash: getalbyInvoice.paymentHash, 
                satoshi: getalbyInvoice.satoshi, 
                isPaid: false, 
                createdDate: getalbyInvoice.createdDate, 
                expiryDate: getalbyInvoice.expiryDate, 
                paidDate: "", 
                description: getalbyInvoice.description, 
                transactionid: 0, 
                accountid: 0};
        
    }catch(e){
        logger.error("Error generating Getalby invoice", e);
        return emptyInvoice;
    }

}

const isInvoicePaidGetAlby = async (paymentHash: string) : Promise<string> => {

    if (paymentHash == "") return "";

    try{
        const response = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${app.get("config.payments")["paymentProviders"]["getalby"]["authToken"]}`
            }
        });

        const data = await response.json();

        if (data.preimage && data.preimage != "null") {
            return data.settled_at;
        }

        if (data.error != undefined) logger.error("Error checking invoice status", data.error);
        
        return "";

    }catch(e){
        logger.error("Error checking GetAlby invoice status", e);
        return "";
    }
}

export { generateGetalbyInvoice, isInvoicePaidGetAlby };