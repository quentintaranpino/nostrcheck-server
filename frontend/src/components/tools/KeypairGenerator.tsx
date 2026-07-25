import { useState } from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import CopyRow from './CopyRow';

type Pair = { nsec: string; npub: string };

export default function KeypairGenerator() {
	const [pair, setPair] = useState<Pair | null>(null);

	const generate = () => {
		const sk = generateSecretKey();
		setPair({
			nsec: nip19.nsecEncode(sk),
			npub: nip19.npubEncode(getPublicKey(sk)),
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
						{/* Just the two you save. The hex forms are a keypress away
						    in the converter if you ever need them. */}
						<ol className="tool-out">
							<CopyRow label="nsec (secret key)" value={pair.nsec} tone="danger" />
							<CopyRow label="npub (public key)" value={pair.npub} />
						</ol>
					</>
				)}
			</div>
		</div>
	);
}
