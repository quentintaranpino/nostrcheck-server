// NIP-45 HyperLogLog, following the reference implementation (go-nostr nip45): registers for
// follower (#p kind 3), reaction (#e kind 7) and comment (#E kind 1111) counts.

import { Filter } from "nostr-tools";

const HLL_REGISTERS = 256;
const HLL_FILTERS: { tag: string, kind: number }[] = [
	{ tag: "#p", kind: 3 },
	{ tag: "#e", kind: 7 },
	{ tag: "#E", kind: 1111 },
];
const HEX64 = /^[a-f0-9]{64}$/;

/**
 * HLL offset for a filter (8-23), or -1 when NIP-45 defines no HLL for it.
 * @param filter - The COUNT filter.
 * @returns The byte offset into the event pubkey, or -1.
 */
const getHllOffset = (filter: Filter): number => {
	const f = filter as Record<string, unknown>;
	if (f.ids || f.since != undefined || f.until != undefined || f.authors || f.search) return -1;
	if (!Array.isArray(filter.kinds) || filter.kinds.length != 1) return -1;
	const tagKeys = Object.keys(f).filter(key => key.startsWith("#"));
	if (tagKeys.length != 1) return -1;
	const rule = HLL_FILTERS.find(r => r.tag == tagKeys[0] && r.kind == filter.kinds![0]);
	const values = f[tagKeys[0]] as string[];
	if (!rule || !Array.isArray(values) || values.length != 1 || !HEX64.test(values[0])) return -1;
	return parseInt(values[0][32], 16) + 8;
};

/**
 * HyperLogLog registers of a set of pubkeys, as the 512-char hex NIP-45 sends.
 * @param pubkeys - Hex pubkeys of the counted events.
 * @param offset - From getHllOffset.
 * @returns The registers in hex.
 */
const buildHll = (pubkeys: Iterable<string>, offset: number): string => {
	const registers = new Uint8Array(HLL_REGISTERS);
	for (const pubkey of pubkeys) {
		if (!HEX64.test(pubkey)) continue;
		const window = Buffer.from(pubkey.slice(offset * 2, offset * 2 + 16), "hex");
		const index = window[0];
		// Leading zero bits over the next 7 bytes (56 bits), MSB first, plus one.
		let zeros = 0;
		for (let i = 1; i < 8; i++) {
			const byte = window[i];
			if (byte == 0) { zeros += 8; continue; }
			zeros += Math.clz32(byte) - 24;
			break;
		}
		const value = zeros + 1;
		if (value > registers[index]) registers[index] = value;
	}
	return Buffer.from(registers).toString("hex");
};

export { getHllOffset, buildHll };
