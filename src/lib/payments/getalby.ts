// https://github.com/getAlby/js-sdk
// https://github.com/getAlby/js-lightning-tools
import { LightningAddress } from "@getalby/lightning-tools";

const generateGetalbyInvoice = async () => {
    const ln = new LightningAddress("nostrcheckme@getalby.com");
    await ln.fetch();

    const invoice = await ln.requestInvoice({ satoshi: 1 });
    console.log(invoice.paymentRequest); 

    while (!await invoice.isPaid()) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("Waiting for payment...");
    }

    const paid = await invoice.verifyPayment(); 
    if (paid) {
        console.log(invoice.preimage);
    }

    return invoice;
}

export { generateGetalbyInvoice }