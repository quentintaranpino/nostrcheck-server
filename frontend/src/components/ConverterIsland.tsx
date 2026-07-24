import { useMemo, useState, type CSSProperties } from 'react';
import { generateSecretKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { detectAndConvert } from '../lib/keyconvert';

const TYPE_LABEL: Record<string, string> = {
	npub: 'public key', nsec: 'secret key', note: 'note id',
	nevent: 'event pointer', nprofile: 'profile pointer', hex: 'hex',
};

export default function ConverterIsland() {
	const [input, setInput] = useState('');
	const [copied, setCopied] = useState<string | null>(null);
	const detection = useMemo(() => detectAndConvert(input), [input]);

	const copy = async (value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(value);
			// long enough for a screen reader to reach the live-region update
			setTimeout(() => setCopied(null), 3000);
		} catch { /* clipboard denied: the value is selectable text anyway */ }
	};

	// A fresh keypair, made here in the browser. Filling the field with the
	// nsec means the readout shows its hex and derived npub straight away —
	// and the secret-key warning fires, which is the honest thing to do.
	const generate = () => setInput(nip19.nsecEncode(generateSecretKey()));

	const tag = TYPE_LABEL[detection.type];
	const known = tag !== undefined;
	// Decoration that happens to be information: the field name it recognised.
	const ghost = known ? detection.type : 'nostr';

	return (
		<div className="pc" data-type={detection.type}>
			<div className="pc-panel">
				<label className="pc-prompt" htmlFor="converter-input">Paste anything</label>

				{/* Flex row, not an overlay: the type tag can never cover the value. */}
				<div className="pc-field">
					<input
						id="converter-input"
						className="pc-input"
						type="text"
						value={input}
						onChange={e => setInput(e.target.value)}
						placeholder="npub1… nsec1… note1… nevent1… nprofile1… or 64-char hex"
						autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
						autoFocus
					/>
					{tag && <span className="pc-tag">{tag}</span>}
				</div>

				<div className="pc-actions">
					<button type="button" className="pc-generate" onClick={generate}>Generate a keypair</button>
					{input !== '' && <button type="button" className="pc-clear" onClick={() => setInput('')}>Clear</button>}
					<span className="pc-note">Made and decoded in your browser. Never sent anywhere.</span>
				</div>
			</div>

			{/* The ghost lives in the readout band, never behind the header —
			    it's texture for the empty space, not an overlay on the copy. */}
			<div className="pc-readout">
				<span className="pc-ghost" aria-hidden="true">{ghost}</span>

				<div aria-live="polite">
				{detection.warning && <p className="pc-warn" role="alert">{detection.warning}</p>}

				{detection.type === 'unknown' && input.trim() !== '' && (
					<p className="pc-nothing">Not a recognisable Nostr entity.</p>
				)}

				{detection.rows.length > 0 && (
					<ol className="pc-out">
						{detection.rows.map((row, i) => (
							<li key={row.label + row.value} style={{ '--i': i } as CSSProperties}>
								<button
									type="button"
									className="pc-out-btn"
									onClick={() => copy(row.value)}
									aria-label={`Copy ${row.label}`}
								>
									<span className="pc-out-head">
										<span className="pc-out-label">{row.label}</span>
										<span className="pc-out-copy">{copied === row.value ? 'copied' : 'copy'}</span>
									</span>
									<code className="pc-out-value">{row.value}</code>
								</button>
							</li>
						))}
					</ol>
				)}
				</div>
			</div>
		</div>
	);
}
