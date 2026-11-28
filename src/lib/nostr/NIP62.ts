// https://github.com/nostr-protocol/nips/blob/master/62.md

/**
 * Reduces a relay URL to host + path so that wss://Host/relay/ and ws://host/relay compare equal.
 * @param url - A relay URL, with or without scheme.
 * @returns The URL in lower case, without scheme or trailing slashes.
 */
const normalizeRelayUrl = (url: string): string =>
	url.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/+$/, "");

/**
 * Whether a request to vanish (kind 62) is addressed to this relay: a `relay` tag with
 * ALL_RELAYS, or with one of the URLs the relay is reached at.
 * @param tags - The tags of the kind 62 event.
 * @param relayUrls - URLs of this relay, in any form normalizeRelayUrl accepts.
 */
const isVanishForRelay = (tags: string[][], relayUrls: string[]): boolean => {
	const ours = new Set(relayUrls.map(normalizeRelayUrl).filter(url => url !== ""));
	return tags.some(tag => tag[0] === "relay" && typeof tag[1] === "string" &&
		(tag[1].trim().toUpperCase() === "ALL_RELAYS" || ours.has(normalizeRelayUrl(tag[1]))));
};

export { normalizeRelayUrl, isVanishForRelay };
