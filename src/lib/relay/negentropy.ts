// Negentropy V1, responder side (NIP-77). nostr-tools ships the storage and fingerprints, but its
// reconcile only plays the initiator: a relay must answer IdList ranges with its own ids, which
// that code never does. This follows the reference implementation (hoytech/negentropy).

import { nip77 } from "nostr-tools";

const PROTOCOL_VERSION = 0x61;
const ID_SIZE = 32;
const FINGERPRINT_SIZE = 16;
const BUCKETS = 16;
const INFINITY = Number.MAX_VALUE;
const MODE_SKIP = 0;
const MODE_FINGERPRINT = 1;
const MODE_IDLIST = 2;

type Item = { timestamp: number, id: Uint8Array };

class Reader {
	private pos = 0;
	constructor(private buf: Uint8Array) {}
	get remaining(): number { return this.buf.length - this.pos; }
	bytes(n: number): Uint8Array {
		if (this.remaining < n) throw new Error("parse ends prematurely");
		const out = this.buf.subarray(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}
	byte(): number { return this.bytes(1)[0]; }
	varint(): number {
		let result = 0;
		for (;;) {
			const b = this.byte();
			result = result * 128 + (b & 0x7f);
			if (result > Number.MAX_SAFE_INTEGER) throw new Error("varint too large");
			if ((b & 0x80) == 0) return result;
		}
	}
}

class Writer {
	private chunks: Uint8Array[] = [];
	length = 0;
	bytes(b: Uint8Array): void { this.chunks.push(b); this.length += b.length; }
	varint(n: number): void {
		const digits: number[] = [];
		do { digits.push(n % 128); n = Math.floor(n / 128); } while (n > 0);
		digits.reverse();
		for (let i = 0; i < digits.length - 1; i++) digits[i] |= 0x80;
		this.bytes(Uint8Array.from(digits));
	}
	append(other: Writer): void { for (const c of other.chunks) this.bytes(c); }
	toBytes(): Uint8Array {
		const out = new Uint8Array(this.length);
		let offset = 0;
		for (const c of this.chunks) { out.set(c, offset); offset += c.length; }
		return out;
	}
}

const hexToBytes = (hex: string): Uint8Array => {
	if (hex.length % 2 != 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error("invalid hex");
	return Uint8Array.from(Buffer.from(hex, "hex"));
};
const bytesToHex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] != b[i]) return a[i] - b[i];
	return a.length - b.length;
};

/**
 * The set of (created_at, id) records a NEG-OPEN filter matched, and the responder state.
 * One per subscription; reconcile() is called once per NEG-OPEN / NEG-MSG.
 */
class NegentropyResponder {
	private storage: nip77.NegentropyStorageVector;
	private lastTimestampIn = 0;
	private lastTimestampOut = 0;

	constructor(records: { created_at: number, id: string }[], private frameSizeLimit: number) {
		this.storage = new nip77.NegentropyStorageVector();
		const seen = new Set<string>();
		for (const r of records) {
			if (seen.has(r.id)) continue;
			seen.add(r.id);
			this.storage.insert(r.created_at, r.id);
		}
		this.storage.seal();
	}

	get size(): number { return this.storage.size(); }

	/** Answers a client message (hex). An unsupported version gets our version byte alone. */
	reconcile(queryHex: string): string {
		const query = new Reader(hexToBytes(queryHex));
		this.lastTimestampIn = 0;
		this.lastTimestampOut = 0;

		const full = new Writer();
		full.bytes(Uint8Array.of(PROTOCOL_VERSION));

		const version = query.byte();
		if (version < 0x60 || version > 0x6f) throw new Error("invalid negentropy protocol version byte");
		if (version != PROTOCOL_VERSION) return bytesToHex(full.toBytes());

		const storageSize = this.storage.size();
		let prevBound: Item = this.bound(0);
		let prevIndex = 0;
		let skip = false;

		while (query.remaining > 0) {
			let o = new Writer();
			const doSkip = () => {
				if (!skip) return;
				skip = false;
				o.append(this.encodeBound(prevBound));
				o.varint(MODE_SKIP);
			};

			const currBound = this.decodeBound(query);
			const mode = query.varint();
			const lower = prevIndex;
			let upper = this.storage.findLowerBound(prevIndex, storageSize, currBound);

			if (mode == MODE_SKIP) {
				skip = true;
			} else if (mode == MODE_FINGERPRINT) {
				const theirs = query.bytes(FINGERPRINT_SIZE);
				const ours = this.storage.fingerprint(lower, upper);
				if (compareBytes(theirs, ours) != 0) {
					doSkip();
					this.splitRange(lower, upper, currBound, o);
				} else {
					skip = true;
				}
			} else if (mode == MODE_IDLIST) {
				const numIds = query.varint();
				query.bytes(numIds * ID_SIZE);
				// The responder sends back every id it holds in the range; the client works out
				// what it has and needs.
				doSkip();
				const ids = new Writer();
				let numResponseIds = 0;
				let endBound: Item = currBound;
				this.storage.iterate(lower, upper, (item: Item, index: number) => {
					if (this.exceededFrameSizeLimit(full.length + ids.length)) {
						endBound = item;
						upper = index;
						return false;
					}
					ids.bytes(item.id);
					numResponseIds++;
					return true;
				});
				o.append(this.encodeBound(endBound));
				o.varint(MODE_IDLIST);
				o.varint(numResponseIds);
				o.append(ids);
				full.append(o);
				o = new Writer();
			} else {
				throw new Error("unexpected mode");
			}

			if (this.exceededFrameSizeLimit(full.length + o.length)) {
				const remaining = this.storage.fingerprint(upper, storageSize);
				full.append(this.encodeBound(this.bound(INFINITY)));
				full.varint(MODE_FINGERPRINT);
				full.bytes(remaining);
				break;
			}
			full.append(o);

			prevIndex = upper;
			prevBound = currBound;
		}

		return bytesToHex(full.toBytes());
	}

	private splitRange(lower: number, upper: number, upperBound: Item, o: Writer): void {
		const numElems = upper - lower;
		if (numElems < BUCKETS * 2) {
			o.append(this.encodeBound(upperBound));
			o.varint(MODE_IDLIST);
			o.varint(numElems);
			this.storage.iterate(lower, upper, (item: Item) => { o.bytes(item.id); return true; });
			return;
		}

		const itemsPerBucket = Math.floor(numElems / BUCKETS);
		const bucketsWithExtra = numElems % BUCKETS;
		let curr = lower;
		for (let i = 0; i < BUCKETS; i++) {
			const bucketSize = itemsPerBucket + (i < bucketsWithExtra ? 1 : 0);
			const fingerprint = this.storage.fingerprint(curr, curr + bucketSize);
			curr += bucketSize;
			const nextBound = curr == upper
				? upperBound
				: this.minimalBound(this.storage.getItem(curr - 1), this.storage.getItem(curr));
			o.append(this.encodeBound(nextBound));
			o.varint(MODE_FINGERPRINT);
			o.bytes(fingerprint);
		}
	}

	private exceededFrameSizeLimit(n: number): boolean {
		return this.frameSizeLimit > 0 && n > this.frameSizeLimit - 200;
	}

	private bound(timestamp: number, id?: Uint8Array): Item {
		return { timestamp, id: id || new Uint8Array(0) };
	}

	private minimalBound(prev: Item, curr: Item): Item {
		if (curr.timestamp != prev.timestamp) return this.bound(curr.timestamp);
		let shared = 0;
		for (let i = 0; i < ID_SIZE; i++) {
			if (curr.id[i] != prev.id[i]) break;
			shared++;
		}
		return this.bound(curr.timestamp, curr.id.subarray(0, shared + 1));
	}

	private decodeTimestampIn(r: Reader): number {
		const encoded = r.varint();
		const delta = encoded == 0 ? INFINITY : encoded - 1;
		if (this.lastTimestampIn == INFINITY || delta == INFINITY) {
			this.lastTimestampIn = INFINITY;
			return INFINITY;
		}
		this.lastTimestampIn += delta;
		return this.lastTimestampIn;
	}

	private decodeBound(r: Reader): Item {
		const timestamp = this.decodeTimestampIn(r);
		const len = r.varint();
		if (len > ID_SIZE) throw new Error("bound key too long");
		return this.bound(timestamp, r.bytes(len));
	}

	private encodeBound(key: Item): Writer {
		const w = new Writer();
		if (key.timestamp == INFINITY) {
			this.lastTimestampOut = INFINITY;
			w.varint(0);
		} else {
			const delta = key.timestamp - this.lastTimestampOut;
			this.lastTimestampOut = key.timestamp;
			w.varint(delta + 1);
		}
		w.varint(key.id.length);
		w.bytes(key.id);
		return w;
	}
}

export { NegentropyResponder };
