// https://github.com/getAlby/js-sdk
// https://github.com/getAlby/js-lightning-tools
import { LightningAddress } from "@getalby/lightning-tools";
import { invoice } from "../../interfaces/payments.js";
import app from "../../app.js";

const generateGetalbyInvoice = async (LNAddress: string, amount:number) : Promise<invoice> => {
    const ln = new LightningAddress(LNAddress);
    await ln.fetch();

    const getalbyInvoice = await ln.requestInvoice({ satoshi: amount });

    return getalbyInvoice;
}

const isInvoicePaid = async (paymentHash: string) : Promise<boolean> => {

    const authToken = app.get("config.payments")["getalby"]["authToken"];

    const response = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    const data = await response.json();

    if (data.preimage && data.preimage != "null") {
        return true;
    }

    return false;
}

const getInvoiceQR = async (paymentHash: string) : Promise<string> => {

    const authToken = app.get("config.payments")["getalby"]["authToken"];

    const response = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    const data = await response.json();

    return data.qr_code_png;

}

export { generateGetalbyInvoice, isInvoicePaid, getInvoiceQR }