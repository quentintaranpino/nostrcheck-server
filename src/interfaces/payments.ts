interface invoice {
    paymentRequest: string;
    paymentHash: string;
    createdDate: any;
    expiryDate: any;
    description: any;
    isPaid: boolean;
    transactionid: number;
    satoshi: number;
    accountid: number;
}

interface checkPaymentResult {
    paymentRequest: string;
    satoshi: number;
}

const accounts = [
    {accountid: 1000, accountname: "Main Wallet", accounttype: "Asset", comments: "Main wallet for holding funds"},
    {accountid: 1100, accountname: "Users wallets", accounttype: "Asset", comments: "Wallet for holding user funds"},
    {accountid: 4000, accountname: "Revenue", accounttype: "Revenue", comments: "Account for recording revenue"},
    {accountid: 5000, accountname: "Expenses", accounttype: "Expense", comments: "Account for recording expenses"},
    
];

export { invoice, checkPaymentResult, accounts}