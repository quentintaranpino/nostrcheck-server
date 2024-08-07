import { ResultMessagev2 } from "./server.js";

interface invoice {
    paymentRequest: string;
    paymentHash: string;
    satoshi: number;
    isPaid: boolean;
    createdDate: any;
    expiryDate: any;
    paidDate: any;
    description: any;
    transactionid: number;
    accountid: number;
}

const emptyInvoice: invoice = {
    paymentRequest: "",
    paymentHash: "",
    satoshi: 0,
    isPaid: true,
    createdDate: "",
    expiryDate: "",
    paidDate: "",
    description: "",
    transactionid: 0,
    accountid: 0
}

interface transaction {
    transactionid: number;
    type: string;
    accountid: number;
    paymentRequest: string;
    paymentHash: string;
    satoshi: number;
    isPaid: boolean;
    createdDate: any;
    expiryDate: any;
    paidDate: any;
    comments: any;
}

const emptyTransaction: transaction = {
    transactionid: 0,
    type: "",
    accountid: 0,
    paymentRequest: "",
    paymentHash: "",
    satoshi: 0,
    isPaid: true,
    createdDate: "",
    expiryDate: "",
    paidDate: "",
    comments: ""
}

const accounts = [
    {accountid: 1000, accountname: "Main Wallet", accounttype: "Asset", comments: "Main wallet for holding server funds"},
    {accountid: 1100, accountname: "Users wallets", accounttype: "Asset", comments: "Account for holding user funds"},
    {accountid: 2000, accountname: "Accounts Receivable", accounttype: "Asset", comments: "Pending invoices and receivables from customers"},
    {accountid: 4000, accountname: "Revenue", accounttype: "Revenue", comments: "Account for recording revenue"},
    {accountid: 5000, accountname: "Expenses", accounttype: "Expense", comments: "Account for recording expenses"},
    
];

interface paymentResultMessage extends ResultMessagev2 {
    payment_request: string;
}

interface invoiceReturnMessage extends ResultMessagev2 {
    invoice: invoice;
}

interface amountReturnMessage extends ResultMessagev2 {
    amount: number;
}


export { invoice, emptyInvoice, transaction, emptyTransaction, accounts, paymentResultMessage, invoiceReturnMessage, amountReturnMessage}