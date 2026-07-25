import { describe, it, expect } from 'vitest';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
import { detectAndConvert } from './keyconvert';

// Canonical NIP-19 test vector
const NPUB = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';
const HEX = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

describe('detectAndConvert', () => {
	it('empty input', () => {
		expect(detectAndConvert('  ').type).toBe('empty');
	});

	it('npub → hex (NIP-19 vector)', () => {
		const d = detectAndConvert(NPUB);
		expect(d.type).toBe('npub');
		expect(d.rows[0].value).toBe(HEX);
	});

	it('hex → npub + note (ambiguous, offers both)', () => {
		const d = detectAndConvert(HEX);
		expect(d.type).toBe('hex');
		expect(d.rows.map(r => r.value)).toContain(NPUB);
		expect(d.rows.map(r => r.value)).toContain(nip19.noteEncode(HEX));
	});

	it('nsec → hex + npub, with warning', () => {
		const sk = generateSecretKey();
		const d = detectAndConvert(nip19.nsecEncode(sk));
		expect(d.type).toBe('nsec');
		expect(d.warning).toBeTruthy();
		expect(d.rows.map(r => r.value)).toContain(nip19.npubEncode(getPublicKey(sk)));
	});

	it('note round-trip', () => {
		const d = detectAndConvert(nip19.noteEncode(HEX));
		expect(d.type).toBe('note');
		expect(d.rows[0].value).toBe(HEX);
	});

	it('nevent round-trip', () => {
		const nevent = nip19.neventEncode({ id: HEX, relays: ['wss://relay.example.com'] });
		const d = detectAndConvert(nevent);
		expect(d.type).toBe('nevent');
		expect(d.rows.map(r => r.value)).toContain(HEX);
	});

	it('nprofile round-trip', () => {
		const nprofile = nip19.nprofileEncode({ pubkey: HEX, relays: ['wss://relay.example.com'] });
		const d = detectAndConvert(nprofile);
		expect(d.type).toBe('nprofile');
		expect(d.rows.map(r => r.value)).toContain(HEX);
		expect(d.rows.map(r => r.value)).toContain(NPUB);
	});

	it('naddr round-trip', () => {
		const naddr = nip19.naddrEncode({ identifier: 'my-article', pubkey: HEX, kind: 30023, relays: ['wss://relay.example.com'] });
		const d = detectAndConvert(naddr);
		expect(d.type).toBe('naddr');
		expect(d.rows.map(r => r.value)).toContain(HEX);
		expect(d.rows.map(r => r.value)).toContain('my-article');
		expect(d.rows.map(r => r.value)).toContain('30023');
	});

	it('garbage → unknown', () => {
		expect(detectAndConvert('not-a-key').type).toBe('unknown');
	});

	it('uppercase hex accepted', () => {
		expect(detectAndConvert(HEX.toUpperCase()).type).toBe('hex');
	});

	it('uppercase npub accepted', () => {
		const d = detectAndConvert(NPUB.toUpperCase());
		expect(d.type).toBe('npub');
		expect(d.rows[0].value).toBe(HEX);
	});
});
