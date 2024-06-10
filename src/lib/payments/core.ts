import { S } from "vitest/dist/reporters-5f784f42.js";
import app from "../../app.js";
import { accounts, emptyInvoice, emptyTransaction, invoice, transaction } from "../../interfaces/payments.js";
import { dbInsert, dbMultiSelect, dbSelect, dbUpdate } from "../database.js"
import { logger } from "../logger.js";
import { generateGetalbyInvoice, isInvoicePaid } from "./getalby.js";




const checkTransaction = async (transactionid : string, originId: string, originTable : string, filesize: number, pubkey : string): Promise<transaction> => {

    if (app.get("config.payments")["enabled"] == false) {
        return emptyTransaction;
    }

    // Get the transaction
    let transaction = await getTransaction(transactionid);
    const balance = await getBalance(transaction.accountid);
    const satoshi = await calculateSatoshi(originTable, filesize);

    if (transaction.paymentHash != "") {

        // If the transaction is already paid or if the balance is not enough we return the transaction
        if (transaction.isPaid || balance <= satoshi) {return transaction};
        
        // If the balance is enough we pay the transaction and return the updated transaction
        if (balance >= satoshi) {
            let inv = await getInvoice(transaction.transactionid.toString());
            inv.paidDate = new Date();
            if (await collectInvoice(inv)){
                logger.info("Paying invoice with user balance:", balance, "satoshi:", satoshi, "transactionid:", inv.transactionid, "Accountid:", inv.accountid)
                return await getTransaction(inv.transactionid.toString())
            };
        }
    };

    // If transaction not exist we generate an invoice and fill the transaction
    if (transaction.paymentHash == ""){
        const accountid = formatAccountNumber(Number(await dbSelect("SELECT id FROM registered WHERE hex = ?", "id", [pubkey])));
        const invoice = await generateLNInvoice(accountid, satoshi, originTable, originId);
        if (invoice.paymentRequest == "") {return emptyTransaction};

        // Fill the transaction with the invoice data
        transaction = await getTransaction(invoice.transactionid.toString());

        // If the balance is enough we pay the new transaction and return the updated transaction
        if (balance >= satoshi) {
            let invoice = await getInvoice(transaction.transactionid.toString());
            invoice.paidDate = new Date();
            if (await collectInvoice(invoice)){
                logger.info("Paying invoice with user balance:", balance, "satoshi:", satoshi, "transactionid:", invoice.transactionid, "Accountid:", invoice.accountid)
                return await getTransaction(invoice.transactionid.toString())
            };
        }
    }
    
    return transaction;

}

const generateLNInvoice = async (accountid: number, satoshi: number, originTable : string, originId : string) : Promise<invoice> => {
    
    const albyInvoice = await generateGetalbyInvoice(app.get("config.payments")["LNAddress"], satoshi);
    albyInvoice.description = "Invoice for: " + originTable + ":" + originId;

    const transId = await addTransacion("invoice", accountid, albyInvoice, satoshi)
    if (transId) {
        await dbUpdate(originTable, "transactionid", transId.toString() , "id", originId)
        logger.info("Generated invoice for " + originTable + ":" + originId, " satoshi: ", satoshi, "transactionid: ", transId)
        albyInvoice.transactionid = transId;
    }

    const debit = await addJournalEntry(accountid, transId, satoshi, 0, "invoice for " + originTable + ":" + originId);
    const credit = await addJournalEntry(accounts[2].accountid, transId, 0, satoshi, "Accounts Receivable for " + originTable + ":" + originId);
    if (credit && debit) {
        logger.debug("Journal entry added for debit transaction", transId, originId, originTable)
    }

    if (transId && credit && debit) {
        return albyInvoice;
    }

    return emptyInvoice;
}

const addTransacion = async (type: string, accountid: number, invoice: invoice, satoshi: number) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
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
                            "paiddate",
                            "comments"], 
                            [type, 
                            accountid,
                            invoice.paymentRequest? invoice.paymentRequest : "", 
                            invoice.paymentHash? invoice.paymentHash : "", 
                            satoshi, 
                            (invoice.isPaid? 1 : 0).toString(), 
                            invoice.createdDate ? invoice.createdDate : new Date().toISOString().slice(0, 19).replace('T', ' '), 
                            invoice.expiryDate? invoice.expiryDate : null,
                            invoice.paidDate? invoice.paidDate : null,
                            invoice.description]
                        );
}

const addJournalEntry = async (accountid: number, transactionid: number, debit: number, credit: number, comments: string) : Promise<number> => {
    
    if (app.get("config.payments")["enabled"] == false) {
        return 0;
    }
    
    const insert = await dbInsert(  "ledger", 
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

    if (insert != 0) {return insert;}

    logger.error("Error adding journal entry for account:", accountid, "transaction:", transactionid)
    return 0;

}

const getBalance = async (accountid: number) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        return 0;
    }

    if (!accountid) {
        logger.warn("No accountid provided for balance check")
        return 0;
    }

const result = Number(await dbSelect("SELECT SUM(credit) - SUM(debit) as 'balance' FROM ledger WHERE ledger.accountid = ?", "balance", [accountid.toString()]));
    logger.debug("Balance for account", accountid, ":", result)
    const balance = await dbUpdate("registered", "balance", result.toString(), "id", formatRegisteredId(accountid));
    if (balance) {
        return result;
    }
    return 0;
}

const addBalance = async (accountid: number, amount: number) : Promise<boolean> => {
    
        if (app.get("config.payments")["enabled"] == false) {
            return false;
        }

        const transaction = await addTransacion("credit",   
                                                accountid, 
                                                {   accountid: accountid,
                                                    paymentRequest: "", 
                                                    paymentHash: "", 
                                                    createdDate: new Date().toISOString().slice(0, 19).replace('T', ' '), 
                                                    expiryDate: new Date().toISOString().slice(0, 19).replace('T', ' '), 
                                                    paidDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
                                                    description: "", 
                                                    isPaid: true, 
                                                    transactionid: 0, 
                                                    satoshi: amount
                                                },
                                                amount);
        if (transaction) {
            const debit = await addJournalEntry(accounts[4].accountid, transaction, amount, 0, "Expense for adding credit to account: " + accountid);
            const credit = await addJournalEntry(accountid, transaction, 0, amount, "Credit added to account: " + accountid);
            if (credit && debit) {
                logger.debug("Journal entries added for adding balance to account:", accountid, "transaction:", transaction)
                
                // Update the balance for the account
                await getBalance(accountid);
                return true;
            }
        }
        return false;
}

const getPendingInvoices = async () : Promise<invoice[]> => {

    if (app.get("config.payments")["enabled"] == false) {
        return [];
    }

    const result = await dbMultiSelect("SELECT id, accountid, paymentrequest, paymenthash, satoshi, createddate, expirydate, paiddate, comments FROM transactions WHERE paid = 0", 
                                    ["id", "accountid", "paymentrequest", "paymenthash",  "satoshi", "createddate", "expirydate", "paiddate", "comments",], 
                                    [], false);
    const invoices : invoice[] = [];
    result.forEach(async (invoiceString) => {
        const invoice = invoiceString.split(',');
        invoices.push({
            transactionid: Number(invoice[0]),
            accountid: Number(invoice[1]),
            paymentRequest: invoice[2],
            paymentHash: invoice[3],
            satoshi: Number(invoice[4]),
            isPaid: false,
            createdDate: new Date(invoice[5]),
            expiryDate: new Date(invoice[6]),
            paidDate: new Date(invoice[7]),
            description: invoice[8],



        });
    })
    return invoices;
}

const getInvoice = async (transactionid: string) : Promise<invoice> => {

    if (app.get("config.payments")["enabled"] == false) {
        return emptyInvoice;
    }

    if (!transactionid || transactionid == "0") {
        return emptyInvoice;
    }

    const result = await dbMultiSelect("SELECT id, accountid, paymentrequest, paymenthash, satoshi, paid, createddate, expirydate, paiddate, comments  FROM transactions WHERE id = ?", 
                                        ["id", "accountid", "paymentrequest", "paymenthash", "satoshi", "paid", "createddate", "expirydate", "paiddate", "comments"], 
                                        [transactionid], false);
    if (result.length == 0) {return emptyInvoice};
    const invoice = result[0].split(',');
    
    // Update the balance for the invoice's account
    await getBalance(Number(invoice[1]));

    return {
        paymentRequest: invoice[2],
        paymentHash: invoice[3],
        satoshi: Number(invoice[4]),
        isPaid: Boolean(Number(invoice[5])),
        createdDate: new Date(invoice[6]),
        expiryDate: new Date(invoice[7]),
        paidDate: new Date(invoice[8]),
        description: invoice[9],
        transactionid: Number(invoice[0]),
        accountid: Number(invoice[1])

    }
    
}


const getTransaction = async (transactionid: string) : Promise<transaction> => {

    if (app.get("config.payments")["enabled"] == false) {
        return emptyTransaction;
    }

    if (!transactionid || transactionid == "0") {
        return emptyTransaction;
    }

    const result = await dbMultiSelect("SELECT id, type, accountid, paymentrequest, paymenthash, satoshi, paid, createddate, expirydate, paiddate, comments FROM transactions WHERE id = ?", 
                                    ["id", "type", "accountid", "paymentrequest", "paymenthash", "satoshi", "paid", "createddate", "expirydate", "paiddate", "comments"], 
                                    [transactionid], false);
    if (result.length == 0) {return emptyTransaction};
    const strTrans = result[0].split(',');
    const transaction: transaction = {
        transactionid: Number(strTrans[0]),
        type: strTrans[1],
        accountid: Number(strTrans[2]),
        paymentRequest: strTrans[3],
        paymentHash: strTrans[4],
        satoshi: Number(strTrans[5]),
        isPaid: Boolean(Number(strTrans[6])),
        createdDate: new Date(strTrans[7]),
        expiryDate: new Date(strTrans[8]),
        paidDate: new Date(strTrans[9]),
        comments: strTrans[10]
    }

    // If transaction expirydate is passed we generate a new LN invoice
    if (transaction.type == "invoice" && transaction.expiryDate < new Date()) {
        const inv = await generateGetalbyInvoice(app.get("config.payments")["LNAddress"], transaction.satoshi);
        transaction.paymentRequest = inv.paymentRequest;
        transaction.paymentHash = inv.paymentHash;
        transaction.createdDate = inv.createdDate;
        transaction.expiryDate = inv.expiryDate;
        const updatePayreq = await dbUpdate("transactions", "paymentrequest", inv.paymentRequest, "id", transactionid);
        const updatePayhash = await dbUpdate("transactions", "paymenthash", inv.paymentHash, "id", transactionid);
        const updateCreated = await dbUpdate("transactions", "createddate", inv.createdDate, "id", transactionid);
        const updateExpyry = await dbUpdate("transactions", "expirydate", inv.expiryDate, "id", transactionid);
        if (!updatePayreq || !updatePayhash || !updateCreated || !updateExpyry) {
            logger.error("Error updating transaction with new invoice data", transactionid)
            return emptyTransaction;
        }
        logger.info("Invoice expired, new invoice generated for transaction:", transactionid)

    }

    // Update the balance for the transaction account
    await getBalance(transaction.accountid);

    return transaction;
}


const formatAccountNumber = (registeredid: number): number => {
    let numStr = registeredid.toString();
    while (numStr.length < 6) {
        numStr = '0' + numStr;
    }
    let prefix = accounts[1].accountid.toString();
    return Number(prefix + numStr);
}

const formatRegisteredId = (accountid: number): number => {
    let numStr = accountid.toString();
    let prefixLength = accounts[1].accountid.toString().length;
    let originalIdStr = numStr.slice(prefixLength);
    return Number(originalIdStr);
}

const collectInvoice = async (invoice: invoice, collectFromExpenses = false, collectFromPayment = false) : Promise<boolean> => {

    if (app.get("config.payments")["enabled"] == false) {
        logger.debug("The payments module is not enabled")
        return false;
    }

    if (invoice.isPaid) {
        logger.debug("Invoice already paid", invoice.transactionid)
        return true;
    }

    const paid = await dbUpdate("transactions", "paid", "1", "id", invoice.transactionid.toString());
    const paiddate = await dbUpdate("transactions", "paiddate", new Date(invoice.paidDate), "id", invoice.transactionid.toString());
    if (paid && paiddate) {
        logger.info("Invoice paid, transaction updated", invoice.transactionid);
    }else{
        logger.error("Error updating transaction", invoice.transactionid);
        return false;
    }

    // If we are collecting from expenses we don't need to debit the main wallet and we need to debit the expenses account.
    if (collectFromExpenses) {
        // Debit expenses account
        await addJournalEntry(accounts[4].accountid, invoice.transactionid, invoice.satoshi, 0, "Expense for adding credit to account: " + invoice.accountid);
    }else{
        // Debit main wallet
        await addJournalEntry(accounts[0].accountid, invoice.transactionid, invoice.satoshi, 0 , "Receipt of invoice payment " + invoice.transactionid);
    }

    if (collectFromPayment) {
        // Credit user wallet
        await addJournalEntry(invoice.accountid, invoice.transactionid, 0, invoice.satoshi, "Payment received for invoice: " + invoice.transactionid);
    }
    
    // Debit Accounts Receivable
    await addJournalEntry(accounts[2].accountid, invoice.transactionid, invoice.satoshi, 0, "Clear Accounts Receivable for invoice payment " + invoice.transactionid);
    
    // Credit Revenue
    await addJournalEntry(accounts[3].accountid, invoice.transactionid, 0, invoice.satoshi, "Revenue from invoice payment " + invoice.transactionid);

    logger.debug("Journal entries added for invoice payment", invoice.transactionid)
        
    // Update the balance for the invoice's account
    await getBalance(invoice.accountid);
    return true;

}

const calculateSatoshi = async (originTable: string, size: number) : Promise<number> => {

    if (app.get("config.payments")["enabled"] == false) {
        return 0;
    }

    if (originTable == "mediafiles") {
    
        // For mediafiles
        const maxSize = Number(app.get("config.media")["maxMBfilesize"]);
        let fileSizeMB = size / 1024 / 1024;
        if (fileSizeMB > maxSize) {fileSizeMB = maxSize;}

        const satoshi = Math.round((fileSizeMB / maxSize) * app.get("config.payments")["satoshi"]["mediaMaxSatoshi"]);
        logger.info("Filesize:", fileSizeMB, "Satoshi:", satoshi)
        return satoshi >= 1 ? satoshi : 1;

    }

    if (originTable == "registered") {
        // For registered the minus size is more expensive
        let sizeStr = size.toString().length;
        if (sizeStr = 1) {return app.get("config.payments")["satoshi"]["registerMaxSatoshi"]};

        const satoshi = Math.round(app.get("config.payments")["satoshi"]["registerMaxSatoshi"] / (Math.log(sizeStr + 100)))
        logger.debug("Register size:", sizeStr, "Satoshi:", satoshi)
        return satoshi >= 1 ? satoshi : 1;
    }

    return 0;
    
}

const getUnpaidTransactionsBalance = async () : Promise<string> => {
    return await dbSelect("SELECT SUM(satoshi) as 'balance' FROM transactions WHERE paid = 0", "balance", []) as string;
}

const payInvoiceFromExpenses = async (transactionid: string) : Promise<boolean> => {

    if (app.get("config.payments")["enabled"] == false) {
        return false;
    }

    if (!transactionid || transactionid == "0") {
        return false;
    }

    const invoice = await getInvoice(transactionid);
    if (invoice.paymentHash == "") {
        logger.error("No payment hash found for transaction", transactionid)
        return false;
    }

    if (invoice.isPaid) {
        logger.debug("Invoice already paid", transactionid)
        return true;
    }

    // We send the parameter to debit the expenses account instead of the main wallet.
    const collect = await collectInvoice(invoice, true, true);
    if (collect) {
        logger.info("Invoice paid", transactionid)
        return true;
    }

    return false
}

setInterval(async () => {
    const pendingInvoices = await getPendingInvoices();
    logger.debug("Pending invoices:", pendingInvoices.length)
    for (const invoice of pendingInvoices) {
        const paiddate = await isInvoicePaid(invoice.paymentHash);
        if (paiddate != "")  {
            invoice.paidDate = paiddate;
            // We send the parameter to collect from a payment and credit the user wallet
            await collectInvoice(invoice, false, true);
        }
    }
    //   await addBalance("1100000001", 10)
}, 5000);

export { checkTransaction, addBalance, getBalance, payInvoiceFromExpenses, formatAccountNumber, getUnpaidTransactionsBalance}