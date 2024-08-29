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
                preimage: "",
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

const isInvoicePaidGetAlby = async (paymentHash: string) : Promise<{paiddate : string, preimage : string}> => {

    if (paymentHash == "") return {paiddate: "", preimage: ""};

    try{
        const response = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${app.get("config.payments")["paymentProviders"]["getalby"]["authToken"]}`
            }
        });

        const data = await response.json();

        if (data.preimage && data.preimage != "null") {
            return {paiddate: data.settled_at, preimage: data.preimage};
        }

        if (data.error != undefined) logger.error("Error checking invoice status", data.error);
        
        return {paiddate: "", preimage: ""};

    }catch(e){
        logger.error("Error checking GetAlby invoice status", e);
        return {paiddate: "", preimage: ""};
    }
}

export { generateGetalbyInvoice, isInvoicePaidGetAlby };