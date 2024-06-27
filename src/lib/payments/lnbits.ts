import app from "../../app";
import { logger } from "../logger";



const isInvoicePaidLNbits = async (paymentHash: string) : Promise<boolean> => {

    const authToken = app.get("config.payments")["lnbits"]["readKey"];

    try{
        const response = await fetch(`https://lnbits.com/api/v1/payments/${paymentHash}`, {
            method: 'GET',
            headers: {
                'X-Api-Key': `${authToken}`
            }
        });

        const data = await response.json();

        if (data.paid && data.paid != "null") {
            return data.paid;
        }
        return false;
        
    }catch(e){
        logger.error("Error checking invoice status", e);
        return false;
    }
}

