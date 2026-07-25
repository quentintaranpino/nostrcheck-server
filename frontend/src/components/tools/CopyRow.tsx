import { useState } from 'react';

/** One labelled value with copy-on-click. Shared by every tool so the
 *  readout looks and behaves the same everywhere. */
export default function CopyRow({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			// long enough for a screen reader to reach the live-region update
			setTimeout(() => setCopied(false), 3000);
		} catch { /* clipboard denied: the value is selectable text anyway */ }
	};

	return (
		<li className="tool-row">
			<button type="button" className="tool-row-btn" onClick={copy} aria-label={`Copy ${label}`}>
				<span className="tool-row-head">
					<span className="tool-row-label" data-tone={tone}>{label}</span>
					<span className="tool-row-copy">{copied ? 'copied' : 'copy'}</span>
				</span>
				<code className="tool-row-value">{value}</code>
			</button>
		</li>
	);
}
