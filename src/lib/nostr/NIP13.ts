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

/**
 * Checks an event against the difficulty the relay asks for. The id needs at least
 * minDifficulty leading zero bits; the target committed in the nonce tag is optional, but
 * one below the minimum is refused even if the id got lucky (NIP-13).
 * @param id - The event id, hex.
 * @param tags - The event tags.
 * @param minDifficulty - Leading zero bits required by the relay.
 * @returns An empty string if the proof of work is enough, or the reason it isn't.
 */
const checkPow = (id: string, tags: string[][], minDifficulty: number): string => {
    if (!(minDifficulty > 0)) return "";

    const difficulty = countLeadingZeroes(id);
    if (difficulty < minDifficulty) return `pow: difficulty ${difficulty} is less than ${minDifficulty}`;

    const nonceTag = tags.find(tag => tag[0] === "nonce");
    if (nonceTag && nonceTag[2] !== undefined && nonceTag[2] !== "") {
        const target = Number(nonceTag[2]);
        if (!Number.isInteger(target) || target < 0) return "pow: invalid target difficulty in nonce tag";
        if (target < minDifficulty) return `pow: committed target difficulty ${target} is less than ${minDifficulty}`;
    }

    return "";
};

export { validatePow, countLeadingZeroes, checkPow };
