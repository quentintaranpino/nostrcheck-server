interface invoice {
    paymentRequest: string;
    paymentHash: string;
    createdDate: string;
    expiryDate: string;
    description: string;
    isPaid: () => boolean;
    verifyPayment: () => boolean;
}

export { invoice }