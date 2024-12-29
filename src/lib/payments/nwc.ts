// https://github.com/getAlby/js-sdk
// https://github.com/getAlby/js-lightning-tools
// https://github.com/getAlby/js-sdk/tree/master/examples/nwc
import { LightningAddress } from "@getalby/lightning-tools";
import { emptyInvoice, invoice } from "../../interfaces/payments.js";
import app from "../../app.js";
import { logger } from "../logger.js";
import { nwc as NWC } from "@getalby/sdk";
import WebSocket from 'ws'
global.WebSocket = WebSocket as any;

// const generateNwcInvoice = async (LNAddress: string, amount:number) : Promise<invoice> => {

//     if (LNAddress == "" || amount == 0) return emptyInvoice;

//     const ln = new LightningAddress(LNAddress);

//     const nwc = new NWC.NWCClient({
//         nostrWalletConnectUrl: `${app.get("config.payments")["paymentProviders"]["nwc"]["url"]}`,
//     });
//     const response = await nwc.makeInvoice({amount: amount, description: ""});

//     try{
//         await ln.fetch();
//         const getalbyInvoice = await ln.requestInvoice({ satoshi: amount });

//         if (!getalbyInvoice || getalbyInvoice.paymentRequest == "") return emptyInvoice;

//         return {paymentRequest: getalbyInvoice.paymentRequest, 
//                 paymentHash: getalbyInvoice.paymentHash, 
//                 satoshi: getalbyInvoice.satoshi, 
//                 isPaid: false, 
//                 preimage: "",
//                 createdDate: getalbyInvoice.createdDate, 
//                 expiryDate: getalbyInvoice.expiryDate, 
//                 paidDate: "", 
//                 description: getalbyInvoice.description, 
//                 transactionid: 0, 
//                 accountid: 0};
        
//     }catch(e){
//         logger.error("Error generating Getalby invoice", e);
//         return emptyInvoice;
//     }

// }

const isInvoicePaidNwc = async (paymentHash: string) : Promise<{paiddate : string, preimage : string}> => {

    if (paymentHash == "") return {paiddate: "", preimage: ""};

    try{
        const nwc = new NWC.NWCClient({
            nostrWalletConnectUrl: `${app.get("config.payments")["paymentProviders"]["nwc"]["url"]}`,
        });
        const response = await nwc.lookupInvoice({payment_hash: paymentHash})

        if (!response || response == undefined){
            logger.error("Error checking invoice status");
        };
        
        if (response.preimage && response.preimage != "null") {
            return {paiddate: response.settled_at.toString(), preimage: response.preimage};
        }

        return {paiddate: "", preimage: ""};
        
    }catch(e){
        logger.error("Error checking GetAlby invoice status", e);
        return {paiddate: "", preimage: ""};
    }
}

export { isInvoicePaidNwc };