import { useMemo, useState, type CSSProperties } from 'react';
import { generateSecretKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { detectAndConvert } from '../lib/keyconvert';

const TYPE_LABEL: Record<string, string> = {
	npub: 'public key', nsec: 'SECRET KEY', note: 'note id',
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
	// nsec means the readout immediately shows its hex and derived npub —
	// and the secret-key warning fires, which is the honest thing to show.
	const generate = () => setInput(nip19.nsecEncode(generateSecretKey()));

	const tag = TYPE_LABEL[detection.type];

	return (
		<div className="term-io">
			<label className="term-prompt" htmlFor="converter-input">
				<span className="term-caret" aria-hidden="true">&gt;</span>
				paste anything
				<span className="term-cursor" aria-hidden="true" />
			</label>

			<div className="term-field" data-type={detection.type}>
				<input
					id="converter-input"
					className="term-input"
					type="text"
					value={input}
					onChange={e => setInput(e.target.value)}
					placeholder="npub1… nsec1… note1… nevent1… nprofile1… or 64-char hex"
					autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
					autoFocus
				/>
				{tag && <span className="term-tag" data-type={detection.type}>[&nbsp;{tag}&nbsp;]</span>}
			</div>

			<div className="term-hints">
				<button type="button" className="term-generate" onClick={generate}>
					generate a new keypair
				</button>
				{input !== '' && (
					<button type="button" className="term-hint" onClick={() => setInput('')}>clear</button>
				)}
				<span className="term-hints-note">generated in your browser, never sent anywhere</span>
			</div>

			<div aria-live="polite">
				{detection.warning && (
					<p className="term-warn" role="alert">
						<span className="term-warn-mark" aria-hidden="true">!!</span>
						{detection.warning}
					</p>
				)}

				{detection.type === 'unknown' && input.trim() !== '' && (
					<p className="term-empty">not a recognisable Nostr entity</p>
				)}

				{detection.rows.length > 0 && (
					<ol className="term-out">
						{detection.rows.map((row, i) => (
							<li key={row.label + row.value} style={{ '--i': i } as CSSProperties}>
								<span className="term-out-key">{row.label}</span>
								<button
									type="button"
									className="term-out-val"
									onClick={() => copy(row.value)}
									aria-label={`Copy ${row.label}`}
								>
									<code>{row.value}</code>
									<span className="term-out-copy">{copied === row.value ? 'copied' : 'copy'}</span>
								</button>
							</li>
						))}
					</ol>
				)}
			</div>
		</div>
	);
}
