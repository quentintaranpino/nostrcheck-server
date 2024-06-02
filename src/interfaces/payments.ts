interface invoice {
    paymentRequest: string;
    paymentHash: string;
    createdDate: string;
    expiryDate: string;
    description: string;
    isPaid: () => boolean;
    verifyPayment: () => boolean;
}

interface checkPaymentResult {
    paymentRequest: string;
    satoshi: number;
}

export { invoice, checkPaymentResult}