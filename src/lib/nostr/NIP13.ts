// https://github.com/nostr-protocol/nips/blob/master/13.md

const countLeadingZeroes = (hex: string): number => {
    let count = 0;

    for (let i = 0; i < hex.length; i++) {
        const nibble = parseInt(hex[i], 16);
        if (isNaN(nibble)) return 0;
        
        if (nibble === 0) {
            count += 4;
        } else {
            count += Math.clz32(nibble) - 28; 
            break;
        }
    }

    return count;
};

const validatePow = (hash: string, difficulty: number): boolean => {
    return countLeadingZeroes(hash) >= difficulty;
}

export { validatePow };