import { useState } from 'preact/hooks';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from 'nostr-tools/utils';
import { CopyRow } from './CopyRow.js';

type Hashed = { name: string; size: number; hash: string };

const fmtSize = (n: number): string => {
	const units = ['B', 'KB', 'MB', 'GB'];
	let i = 0, v = n;
	while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
	return `${v.toFixed(v >= 100 || i == 0 ? 0 : 1)} ${units[i]}`;
};

/**
 * The sha256 of a local file, which is the id Blossom gives the blob. The
 * file is read here and never uploaded.
 */
const BlobHasher = () => {
	const [result, setResult] = useState<Hashed | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const hash = async (file: File | undefined) => {
		if (!file) return;
		setError(null);
		setResult(null);
		setProgress(0);
		try {
			// Streamed in chunks rather than file.arrayBuffer(): Blossom blobs are
			// routinely hundreds of MB, and materialising one whole buffer is an
			// out-of-memory tab kill that no try/catch here could ever catch.
			const hasher = sha256.create();
			const reader = file.stream().getReader();
			let read = 0;
			let shown = -1;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				hasher.update(value);
				read += value.byteLength;
				// one render per percent, not one per chunk
				const pct = file.size > 0 ? Math.floor((read / file.size) * 100) : 100;
				if (pct != shown) { shown = pct; setProgress(pct); }
			}
			setResult({ name: file.name, size: file.size, hash: bytesToHex(hasher.digest()) });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not read that file');
		} finally {
			setProgress(null);
		}
	};

	return (
		<div class="nc-tool-body">
			<label class="nc-tool-label" for="bh-input">Pick a file</label>
			<input
				id="bh-input"
				class="nc-tool-file"
				type="file"
				onChange={e => hash(e.currentTarget.files?.[0])}
			/>

			<div aria-live="polite">
				{progress != null && <p class="nc-tool-muted">Hashing… {progress}%</p>}
				{error && <p class="nc-tool-warn" role="alert">{error}</p>}
				{result && (
					<p class="nc-tool-muted"><strong>{result.name}</strong> · {fmtSize(result.size)}</p>
				)}
			</div>

			{result && (
				<ol class="nc-tool-out">
					<CopyRow label="sha256 (Blossom blob id)" value={result.hash} />
				</ol>
			)}
		</div>
	);
};

export { BlobHasher };
