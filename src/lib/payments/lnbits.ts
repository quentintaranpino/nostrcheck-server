import app from "../../app.js";
import { emptyInvoice, invoice } from "../../interfaces/payments.js";
import { logger } from "../logger.js";
import bolt11 from 'bolt11';
import { getNewDate } from "../utils.js";

const generateLNBitsInvoice = async (amount: number, memo: string) : Promise<invoice> => {

    if (amount == 0) return emptyInvoice
    
    try{
        const response = await fetch(app.get("config.payments")["paymentProviders"]["lnbits"]["nodeUrl"] + '/api/v1/payments', {
            method: 'POST',
            headers: {
                'X-Api-Key': app.get("config.payments")["paymentProviders"]["lnbits"]["readKey"],
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                out: false,
                amount: amount,
                memo: memo
            })
        });

        const data = await response.json();
        if (!data || data.payment_request == "") return emptyInvoice

        const decoded = bolt11.decode(data.payment_request);
        if (!decoded) return emptyInvoice;

        return {
            paymentRequest: data.payment_request,
            paymentHash: data.payment_hash,
            satoshi: decoded.satoshis? decoded.satoshis : 0,
            isPaid: false,
            preimage: "",
            createdDate: decoded.timestampString? new Date(decoded.timestampString) : getNewDate(),
            expiryDate: decoded.timeExpireDateString? new Date(decoded.timeExpireDateString) : getNewDate(),
            paidDate: null,
            description: memo,
            transactionid: 0,
            accountid: 0
        }

    }catch(e){
        logger.error("Error generating LNBits invoice");
        return emptyInvoice;
    }

}

const isInvoicePaidLNbits = async (paymentHash: string) : Promise<{paiddate : string, preimage : string}> => {

    if (paymentHash == "") return {paiddate: "", preimage: ""};

    try{
        const response = await fetch(app.get("config.payments")["paymentProviders"]["lnbits"]["nodeUrl"] + "/api/v1/payments/" + paymentHash, {
            method: 'GET',
            headers: {
                'X-Api-Key': app.get("config.payments")["paymentProviders"]["lnbits"]["readKey"]
            }
        });

        const data = await response.json();

        if (data.paid && data.paid != "null") {
            return {paiddate: new Date().toISOString().slice(0, 19).replace('T', ' '), preimage: data.preimage};
        }
        return {paiddate: "", preimage: ""};
        
    }catch(e){
        logger.error("Error checking LNbits invoice status");
        return {paiddate: "", preimage: ""};
    }
}

export { generateLNBitsInvoice, isInvoicePaidLNbits };