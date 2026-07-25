import { useMemo, useState } from 'react';
import { detectAndConvert } from '../../lib/keyconvert';
import CopyRow from './CopyRow';

const TYPE_LABEL: Record<string, string> = {
	npub: 'public key', nsec: 'secret key', note: 'note id',
	nevent: 'event pointer', nprofile: 'profile pointer', naddr: 'address', hex: 'hex',
};

export default function KeyConverter() {
	const [input, setInput] = useState('');
	const detection = useMemo(() => detectAndConvert(input), [input]);
	const tag = TYPE_LABEL[detection.type];

	return (
		<div className="tool-body">
			<label className="tool-label" htmlFor="kc-input">Paste anything</label>
			{/* Flex row, not an overlay: the tag can never cover the value. */}
			<div className="tool-field" data-tone={detection.type === 'nsec' ? 'danger' : undefined}>
				<input
					id="kc-input"
					className="tool-input"
					type="text"
					value={input}
					onChange={e => setInput(e.target.value)}
					placeholder="npub1… nsec1… note1… nevent1… nprofile1… or 64-char hex"
					autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
				/>
				{tag && <span className="tool-tag" data-tone={detection.type === 'nsec' ? 'danger' : undefined}>{tag}</span>}
			</div>

			<div aria-live="polite">
				{detection.warning && <p className="tool-warn" role="alert">{detection.warning}</p>}
				{detection.type === 'unknown' && input.trim() !== '' && (
					<p className="tool-muted">Not a recognisable Nostr entity.</p>
				)}
				{detection.rows.length > 0 && (
					<ol className="tool-out">
						{detection.rows.map(row => (
							<CopyRow key={row.label + row.value} label={row.label} value={row.value} />
						))}
					</ol>
				)}
			</div>
		</div>
	);
}
