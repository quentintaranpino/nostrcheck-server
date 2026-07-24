// Subpaths, not the root barrel: that one bundles relay/pool/WebSocket code
// this page has no business shipping to the browser.
import * as nip19 from 'nostr-tools/nip19';
import { getPublicKey } from 'nostr-tools/pure';
import { bytesToHex } from '@noble/hashes/utils.js';

export type ConversionRow = { label: string; value: string };
export type Detection = {
	type: 'npub' | 'nsec' | 'note' | 'nevent' | 'nprofile' | 'hex' | 'empty' | 'unknown';
	rows: ConversionRow[];
	warning?: string;
};

const HEX64 = /^[0-9a-f]{64}$/i;

export const detectAndConvert = (raw: string): Detection => {
	const input = raw.trim();
	if (input === '') return { type: 'empty', rows: [] };

	if (HEX64.test(input)) {
		const hex = input.toLowerCase();
		return {
			type: 'hex',
			rows: [
				{ label: 'npub (if this is a public key)', value: nip19.npubEncode(hex) },
				{ label: 'note (if this is an event id)', value: nip19.noteEncode(hex) },
			],
		};
	}

	let decoded: ReturnType<typeof nip19.decode>;
	try {
		decoded = nip19.decode(input.toLowerCase());
	} catch {
		return { type: 'unknown', rows: [] };
	}

	switch (decoded.type) {
		case 'npub':
			return { type: 'npub', rows: [{ label: 'hex public key', value: decoded.data }] };
		case 'note':
			return { type: 'note', rows: [{ label: 'hex event id', value: decoded.data }] };
		case 'nsec': {
			const skHex = bytesToHex(decoded.data);
			return {
				type: 'nsec',
				rows: [
					{ label: 'hex secret key', value: skHex },
					{ label: 'npub (derived public key)', value: nip19.npubEncode(getPublicKey(decoded.data)) },
				],
				warning: 'This is a secret key. Nothing leaves your browser, but never paste it on a machine you do not trust.',
			};
		}
		case 'nevent': {
			const rows: ConversionRow[] = [{ label: 'hex event id', value: decoded.data.id }];
			if (decoded.data.author) rows.push({ label: 'author (hex)', value: decoded.data.author });
			for (const r of decoded.data.relays ?? []) rows.push({ label: 'relay hint', value: r });
			return { type: 'nevent', rows };
		}
		case 'nprofile': {
			const rows: ConversionRow[] = [
				{ label: 'hex public key', value: decoded.data.pubkey },
				{ label: 'npub', value: nip19.npubEncode(decoded.data.pubkey) },
			];
			for (const r of decoded.data.relays ?? []) rows.push({ label: 'relay hint', value: r });
			return { type: 'nprofile', rows };
		}
		default:
			return { type: 'unknown', rows: [] };
	}
};
