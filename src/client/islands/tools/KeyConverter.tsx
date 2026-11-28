import { useMemo, useState } from 'preact/hooks';
import { detectAndConvert } from '../../lib/keyconvert.js';
import { CopyRow } from './CopyRow.js';

const TYPE_LABEL: Record<string, string> = {
	npub: 'public key', nsec: 'secret key', note: 'note id',
	nevent: 'event pointer', nprofile: 'profile pointer', naddr: 'address', hex: 'hex',
};

/**
 * Paste any Nostr entity and read every form that can be derived from it.
 */
const KeyConverter = () => {
	const [input, setInput] = useState('');
	const detection = useMemo(() => detectAndConvert(input), [input]);
	const tag = TYPE_LABEL[detection.type];
	const tone = detection.type == 'nsec' ? 'danger' : undefined;

	return (
		<div class="nc-tool-body">
			<label class="nc-tool-label" for="kc-input">Paste anything</label>
			{/* Flex row, not an overlay: the tag can never cover the value. */}
			<div class="nc-tool-field" data-tone={tone}>
				<input
					id="kc-input"
					class="nc-tool-input"
					type="text"
					value={input}
					onInput={e => setInput(e.currentTarget.value)}
					placeholder="npub1… nsec1… note1… nevent1… nprofile1… or 64-char hex"
					autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck={false}
				/>
				{tag && <span class="nc-tool-tag" data-tone={tone}>{tag}</span>}
			</div>

			<div aria-live="polite">
				{detection.warning && <p class="nc-tool-warn" role="alert">{detection.warning}</p>}
				{detection.type == 'unknown' && input.trim() != '' && (
					<p class="nc-tool-muted">Not a recognisable Nostr entity.</p>
				)}
				{detection.rows.length > 0 && (
					<ol class="nc-tool-out">
						{detection.rows.map(row => (
							<CopyRow key={row.label + row.value} label={row.label} value={row.value} />
						))}
					</ol>
				)}
			</div>
		</div>
	);
};

export { KeyConverter };
