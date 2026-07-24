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

	return (
		<div className="kc">
			<label className="kc-prompt" htmlFor="converter-input">Paste anything</label>

			{/* Flex row, not an overlay: the type tag can never cover the value. */}
			<div className="kc-field" data-type={detection.type}>
				<input
					id="converter-input"
					className="kc-input"
					type="text"
					value={input}
					onChange={e => setInput(e.target.value)}
					placeholder="npub1… nsec1… note1… nevent1… nprofile1… or 64-char hex"
					autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
					autoFocus
				/>
				{tag && <span className="kc-tag" data-type={detection.type}>{tag}</span>}
			</div>

			<div className="kc-actions">
				<button type="button" className="kc-generate" onClick={generate}>Generate a keypair</button>
				{input !== '' && <button type="button" className="kc-clear" onClick={() => setInput('')}>Clear</button>}
				<span className="kc-note">Made and decoded in your browser. Never sent anywhere.</span>
			</div>

			<div aria-live="polite">
				{detection.warning && <p className="kc-warn" role="alert">{detection.warning}</p>}

				{detection.type === 'unknown' && input.trim() !== '' && (
					<p className="kc-nothing">Not a recognisable Nostr entity.</p>
				)}

				{detection.rows.length > 0 && (
					<ol className="kc-out">
						{detection.rows.map((row, i) => (
							<li key={row.label + row.value} style={{ '--i': i } as CSSProperties}>
								<button
									type="button"
									className="kc-out-btn"
									onClick={() => copy(row.value)}
									aria-label={`Copy ${row.label}`}
								>
									<span className="kc-out-label">
										{row.label}
										<span className="kc-out-copy">{copied === row.value ? 'copied' : 'copy'}</span>
									</span>
									{/* The value is the whole point of the page, so it gets the size. */}
									<code className="kc-out-value">{row.value}</code>
								</button>
							</li>
						))}
					</ol>
				)}
			</div>
		</div>
	);
}
