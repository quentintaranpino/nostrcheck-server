import app from "../../app.js";
import { accounts, checkPaymentResult, invoice } from "../../interfaces/payments.js";
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

    const existPayReq = await dbMultiSelect("SELECT id, accountid, paymentrequest, satoshi FROM transactions WHERE id = ?", ["id", "accountid", "paymentrequest", "satoshi", "pubkey"], [transactionid]);
    if (existPayReq[1] && existPayReq[2] && existPayReq[3]) {
        const balance = await getBalance(existPayReq[1]);
        if (balance <= Number(existPayReq[3])) {
            logger.debug("Already generated invoice for payment, skipping", existPayReq)
            return {paymentRequest: existPayReq[2], satoshi: Number(existPayReq[3])};
        }
    }

    const pubkey = await dbSelect("SELECT pubkey FROM " + orginTable + " WHERE id = ?", "pubkey", [originId]) as string;
    const accountid = Number(accounts[1].accountid.toString() + (await dbSelect("SELECT id FROM registered WHERE hex = ?", "id", [pubkey])));
    const balance = await getBalance(pubkey);
    const satoshi = Number(await dbSelect("SELECT satoshi FROM transactions WHERE id = ?", "satoshi", [transactionid])) || 1 // TODO set satoshi amount on settings
    
    logger.debug("Balance for pubkey " + pubkey + " :", balance)
    logger.debug("Requested payment for", satoshi, "satoshi")
    
    if (balance < satoshi) {
        
        const invoice = await generateLNInvoice(satoshi);
        invoice.description = "Invoice for: " + orginTable + ":" + originId;

        const transId = await addTransacion("invoice", accountid, invoice, satoshi)
        await dbUpdate(orginTable, "transactionid", transId.toString() , "id", originId)
        logger.debug("Generated invoice for " + orginTable + ":" + originId, " satoshi: ", satoshi, "transactionid: ", transId)

        await addJournalEntry(accountid, transId, satoshi, 0, "invoice for " + orginTable + ":" + originId);
        logger.debug("Journal entry added for debit transaction", transId, originId, orginTable)

        return {paymentRequest: invoice.paymentRequest, satoshi: satoshi};

    } else {
    
        const journalPayInvoice = await addJournalEntry(accountid, Number(existPayReq[0]) || 0, 0, satoshi ,"Payment for " + existPayReq[0]);
        if (journalPayInvoice) {
            logger.debug("Journal entry added for credit transaction", journalPayInvoice)
        }

        const journalSpendBalance = await addJournalEntry(accountid, Number(existPayReq[0]) || 0, satoshi , 0 ,"Spend balance for " + existPayReq[0]);
        if (journalPayInvoice) {
            logger.debug("Journal entry added for debit transaction", journalPayInvoice)
        }

        const journalRecInvoice = await addJournalEntry(accounts[0].accountid, Number(existPayReq[0]) || 0, 0, satoshi ,"Receipt of invoice payment " + existPayReq[0]);
        if (journalRecInvoice) {
            logger.debug("Journal entry added for credit transaction", journalRecInvoice)
        }

        if (journalPayInvoice && journalSpendBalance && journalRecInvoice) {
            await dbUpdate("transactions", "paid", "1", "id", transactionid);
            await dbUpdate("transactions", "paiddate", new Date(), "id", transactionid);
            logger.debug("Transaction updated as paid", transactionid)
            return {paymentRequest: "", satoshi: 0};
        }

        logger.debug("Error adding journal entry for debit transaction", transactionid, originId, orginTable)
        return "";
    }
}

const generateLNInvoice = async (amount: number) : Promise<invoice> => {
    return await generateGetalbyInvoice(app.get("config.payments")["LNAddress"], amount);
}

const addTransacion = async (type: string, accountid: number, invoice: invoice, satoshi: number) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }

    return await dbInsert(  "transactions",   
                            ["type",
                            "accountid", 
                            "paymentrequest", 
                            "paymenthash", 
                            "satoshi", 
                            "paid", 
                            "createddate", 
                            "expirydate",
                            "comments"], 
                            [type, 
                            accountid,
                            invoice.paymentRequest? invoice.paymentRequest : "", 
                            invoice.paymentHash? invoice.paymentHash : "", 
                            satoshi, 
                            (invoice.isPaid? 1 : 0).toString(), 
                            invoice.createdDate ? invoice.createdDate : new Date().toISOString().slice(0, 19).replace('T', ' '), 
                            invoice.expiryDate? invoice.expiryDate : new Date().toISOString().slice(0, 19).replace('T', ' '),
                            invoice.description? invoice.description : ""]
                        );
}

const addJournalEntry = async (accountid: number, transactionid: number, debit: number, credit: number, comments: string) : Promise<number> => {
    
    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }
    
    return await dbInsert(  "ledger", 
                            ["accountid", 
                            "transactionid", 
                            "debit", 
                            "credit", 
                            "createddate", 
                            "comments"], 
                            [accountid, 
                            transactionid, 
                            debit, 
                            credit, 
                            new Date().toISOString().slice(0, 19).replace('T', ' '), 
                            comments]
                        );

}

const getBalance = async (pubkey: string) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return 0;
    }

const result = Number(await dbSelect("SELECT SUM(credit) - SUM(debit) as 'balance' FROM ledger INNER JOIN registered on ledger.accountid = registered.id WHERE registered.hex = ?", "balance", [pubkey]));
    logger.debug("Balance for pubkey", pubkey, ":", result)
    return result;
}

const addBalance = async (pubkey: string, amount: number) : Promise<boolean> => {
    
        if (app.get("config.payments")["enabled"] == false) {
            logger.debug("The payments module is not enabled")
            return false;
        }

        const accountId = Number(await dbSelect("SELECT id FROM registered WHERE hex = ?", "id", [pubkey]));
        const transaction = await addTransacion("credit",   
                                                accountId, 
                                                {   accountid: accountId,
                                                    paymentRequest: "", 
                                                    paymentHash: "", 
                                                    createdDate: new Date().toISOString().slice(0, 19).replace('T', ' '), 
                                                    expiryDate: new Date().toISOString().slice(0, 19).replace('T', ' '), 
                                                    description: "", 
                                                    isPaid: true, 
                                                    transactionid: 0, 
                                                    satoshi: amount
                                                },
                                                amount);
        if (transaction) {
            const accountid = Number(await dbSelect("SELECT id FROM registered WHERE hex = ?", "id", [pubkey]));
            await addJournalEntry(accountid, transaction, 0, amount, "Credit for pubkey: " + pubkey);
            return true;
        }
        return false;

}

const getPendingInvoices = async () : Promise<invoice[]> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return [];
    }

    const result = await dbMultiSelect("SELECT id, accountid, paymentrequest, paymenthash, createddate, expirydate, satoshi FROM transactions WHERE paid = 0", ["id", "accountid", "paymentrequest", "paymenthash", "createddate", "expirydate", "satoshi"], ["paymenthash"], false);
    const invoices : invoice[] = [];
    result.forEach(async (invoiceString) => {
        const invoice = invoiceString.split(',');
        invoices.push({
            transactionid: Number(invoice[0]),
            accountid: Number(invoice[1]),
            paymentRequest: invoice[2],
            paymentHash: invoice[3],
            createdDate: new Date(invoice[4]),
            expiryDate: new Date(invoice[5]),
            description: "",
            isPaid: false,
            satoshi: Number(invoice[6]),

        });
    })
    return invoices;
}

setInterval(async () => {
    const pendingInvoices = await getPendingInvoices();
    logger.info("Pending invoices:", pendingInvoices.length)
    for (const invoice of pendingInvoices) {
        const paiddate = await isInvoicePaid(invoice.paymentHash);
        if (paiddate != "")  {
            await dbUpdate("transactions", "paid", "1", "id", invoice.transactionid.toString());
            await dbUpdate("transactions", "paiddate", new Date(paiddate), "id", invoice.transactionid.toString());
            logger.info("Invoice paid, transaction updated", invoice.transactionid);
            await addJournalEntry(invoice.accountid, invoice.transactionid, 0, invoice.satoshi, "Payment for invoice: " + invoice.paymentHash);
            await addJournalEntry(accounts[0].accountid, invoice.transactionid, 0, invoice.satoshi, "Receipt of invoice payment " + invoice.paymentHash);
            logger.info("Journal entry added for credit transaction", invoice.transactionid)
        }
    }
}, 15000);

export { checkPayment, addBalance, getBalance}