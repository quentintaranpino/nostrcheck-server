import { useMemo, useState } from 'react';
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
			setTimeout(() => setCopied(null), 1500);
		} catch { /* clipboard denied: selection still works */ }
	};

	return (
		<div>
			<label className="converter-label" htmlFor="converter-input">
				Paste anything — npub, nsec, note, nevent, nprofile or hex
			</label>
			<div className="converter-inputwrap" data-type={detection.type}>
				<input
					id="converter-input"
					className="converter-input"
					type="text"
					value={input}
					onChange={e => setInput(e.target.value)}
					placeholder="npub1…"
					autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
					autoFocus
				/>
				{detection.type !== 'empty' && detection.type !== 'unknown' && (
					<span className="converter-badge">{TYPE_LABEL[detection.type]}</span>
				)}
			</div>

			<div aria-live="polite">
				{detection.warning && <p className="converter-warning" role="alert">{detection.warning}</p>}
				{detection.type === 'unknown' && input.trim() !== '' && (
					<p className="converter-empty">Not a recognizable Nostr entity.</p>
				)}
				{detection.rows.length > 0 && (
					<ul className="converter-results">
						{detection.rows.map(row => (
							<li key={row.label + row.value} className="converter-row">
								<span className="converter-row-label">{row.label}</span>
								<button
									type="button"
									className="converter-row-value"
									onClick={() => copy(row.value)}
									title="Copy to clipboard"
								>
									<code>{row.value}</code>
									<span className="converter-row-copy">{copied === row.value ? 'copied' : 'copy'}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
