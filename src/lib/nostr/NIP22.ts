// https://github.com/nostr-protocol/nips/blob/master/22.md

const hasValue = (tag: string[]): boolean => typeof tag[1] === "string" && tag[1].trim() !== "";

/**
 * Checks the root scope of a kind 1111 comment: a K tag with the root kind and an E, A or I
 * tag pointing to it. The parent tags (k, e/a/i) and P/p are not enforced: many clients,
 * and the NIP-7D example itself, leave them out.
 * @param tags - The tags of the comment.
 * @returns True if the comment has a root scope.
 */
const hasCommentRootScope = (tags: string[][]): boolean => {
	const hasRootKind = tags.some(tag => tag[0] === "K" && hasValue(tag));
	const hasRoot = tags.some(tag => (tag[0] === "E" || tag[0] === "A" || tag[0] === "I") && hasValue(tag));
	return hasRootKind && hasRoot;
};

export { hasCommentRootScope };
