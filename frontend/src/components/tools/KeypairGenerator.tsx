import { useState } from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { bytesToHex } from '@noble/hashes/utils.js';
import CopyRow from './CopyRow';

type Pair = { nsec: string; hexSec: string; npub: string; hexPub: string };

export default function KeypairGenerator() {
	const [pair, setPair] = useState<Pair | null>(null);

	const generate = () => {
		const sk = generateSecretKey();
		const pk = getPublicKey(sk);
		setPair({
			nsec: nip19.nsecEncode(sk),
			hexSec: bytesToHex(sk),
			npub: nip19.npubEncode(pk),
			hexPub: pk,
		});
	};

	return (
		<div className="tool-body">
			<div className="tool-actions">
				<button type="button" className="tool-primary" onClick={generate}>
					{pair ? 'Generate another' : 'Generate a keypair'}
				</button>
				{pair && <button type="button" className="tool-secondary" onClick={() => setPair(null)}>Clear</button>}
			</div>

			<div aria-live="polite">
				{pair && (
					<>
						<p className="tool-warn" role="alert">
							Write the secret key down somewhere safe before you leave this page.
							It was made here and is not stored anywhere — close the tab and it is gone.
						</p>
						<ol className="tool-out">
							<CopyRow label="nsec (secret key)" value={pair.nsec} tone="danger" />
							<CopyRow label="hex secret key" value={pair.hexSec} tone="danger" />
							<CopyRow label="npub (public key)" value={pair.npub} />
							<CopyRow label="hex public key" value={pair.hexPub} />
						</ol>
					</>
				)}
			</div>
		</div>
	);
}
