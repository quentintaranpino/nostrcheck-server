import { useState } from 'preact/hooks';

type CopyRowProps = { label: string; value: string; tone?: 'danger' };

/**
 * One labelled value with copy-on-click. Shared by every tool so the readout
 * looks and behaves the same everywhere.
 */
const CopyRow = ({ label, value, tone }: CopyRowProps) => {
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
		<li class="nc-tool-row">
			<button type="button" class="nc-tool-row-btn" onClick={copy} aria-label={`Copy ${label}`}>
				<span class="nc-tool-row-head">
					<span class="nc-tool-row-label" data-tone={tone}>{label}</span>
					<span class="nc-tool-row-copy">{copied ? 'copied' : 'copy'}</span>
				</span>
				<code class="nc-tool-row-value">{value}</code>
			</button>
		</li>
	);
};

export { CopyRow };
