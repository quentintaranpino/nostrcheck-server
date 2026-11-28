import { useState } from 'preact/hooks';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { CopyRow } from './CopyRow.js';

type Pair = { nsec: string; npub: string };

/**
 * Makes a new Nostr identity in the browser. The secret key only ever lives
 * in this component's state.
 */
const KeypairGenerator = () => {
	const [pair, setPair] = useState<Pair | null>(null);

	const generate = () => {
		const sk = generateSecretKey();
		setPair({
			nsec: nip19.nsecEncode(sk),
			npub: nip19.npubEncode(getPublicKey(sk)),
		});
	};

	return (
		<div class="nc-tool-body">
			<div class="nc-tool-actions">
				<button type="button" class="nc-tool-primary" onClick={generate}>
					{pair ? 'Generate another' : 'Generate a keypair'}
				</button>
				{pair && <button type="button" class="nc-tool-secondary" onClick={() => setPair(null)}>Clear</button>}
			</div>

			<div aria-live="polite">
				{pair && (
					<>
						<p class="nc-tool-warn" role="alert">
							Write the secret key down somewhere safe before you leave this page.
							It was made here and is not stored anywhere: close the tab and it is gone.
						</p>
						{/* Just the two you save. The hex forms are a keypress away
						    in the converter if you ever need them. */}
						<ol class="nc-tool-out">
							<CopyRow label="nsec (secret key)" value={pair.nsec} tone="danger" />
							<CopyRow label="npub (public key)" value={pair.npub} />
						</ol>
					</>
				)}
			</div>
		</div>
	);
};

export { KeypairGenerator };
