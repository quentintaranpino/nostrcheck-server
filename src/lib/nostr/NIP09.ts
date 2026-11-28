// https://github.com/nostr-protocol/nips/blob/master/09.md

import { isAddressable, isReplaceable } from "./NIP01.js";

interface EventAddress {
	kind: number;
	pubkey: string;
	d: string;
}

const MAX_DELETION_TARGETS = 256;

/**
 * Parses an `a` tag value, `<kind>:<pubkey>:<d>`. The d identifier may contain colons.
 * @param value - The tag value.
 * @returns The address, or null if it is not one of a replaceable or addressable kind.
 */
const parseAddress = (value: unknown): EventAddress | null => {
	if (typeof value !== "string") return null;
	const match = /^(\d{1,5}):([a-f0-9]{64}):([\s\S]*)$/.exec(value);
	if (!match) return null;
	const kind = Number(match[1]);
	if (!isReplaceable(kind) && !isAddressable(kind)) return null;
	// Replaceable kinds have a single version per pubkey, whatever comes after the last colon.
	return { kind, pubkey: match[2], d: isAddressable(kind) ? match[3] : "" };
};

/**
 * The address of a replaceable or addressable event, as it is written in an `a` tag.
 * @returns `<kind>:<pubkey>:<d>`, or null for any other kind.
 */
const getEventAddress = (event: { kind: number, pubkey: string, tags: string[][] }): string | null => {
	if (isReplaceable(event.kind)) return `${event.kind}:${event.pubkey}:`;
	if (isAddressable(event.kind)) return `${event.kind}:${event.pubkey}:${event.tags.find(tag => tag[0] === "d")?.[1] ?? ""}`;
	return null;
};

/**
 * What a kind 5 asks to delete: event ids (`e` tags) and addresses (`a` tags). Addresses of
 * another author are dropped, a deletion only reaches its own author's events.
 * @param event - The kind 5 event.
 * @returns The ids and addresses, without duplicates, and whether it had any e or a tag at all.
 */
const getDeletionTargets = (event: { pubkey: string, tags: string[][] }): { ids: string[], addresses: EventAddress[], hasTargets: boolean } => {
	const ids = new Set<string>();
	const addresses = new Map<string, EventAddress>();
	let hasTargets = false;
	for (const tag of event.tags) {
		if ((tag[0] !== "e" && tag[0] !== "a") || typeof tag[1] !== "string") continue;
		hasTargets = true;
		const value = tag[1].trim();
		if (tag[0] === "e") {
			if (/^[a-f0-9]{64}$/.test(value) && ids.size < MAX_DELETION_TARGETS) ids.add(value);
			continue;
		}
		const address = parseAddress(value);
		if (address && address.pubkey === event.pubkey && addresses.size < MAX_DELETION_TARGETS) addresses.set(`${address.kind}:${address.d}`, address);
	}
	return { ids: Array.from(ids), addresses: Array.from(addresses.values()), hasTargets };
};

export { EventAddress, parseAddress, getEventAddress, getDeletionTargets };
