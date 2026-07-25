import { useState } from 'react';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import CopyRow from './CopyRow';

type Hashed = { name: string; size: number; hash: string };

const fmtSize = (n: number) => {
	const units = ['B', 'KB', 'MB', 'GB'];
	let i = 0, v = n;
	while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
	return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export default function BlobHasher() {
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
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				hasher.update(value);
				read += value.byteLength;
				setProgress(file.size > 0 ? read / file.size : 1);
			}
			setResult({ name: file.name, size: file.size, hash: bytesToHex(hasher.digest()) });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not read that file');
		} finally {
			setProgress(null);
		}
	};

	return (
		<div className="tool-body">
			<label className="tool-label" htmlFor="bh-input">Pick a file</label>
			<input
				id="bh-input"
				className="tool-file"
				type="file"
				onChange={e => hash(e.target.files?.[0])}
			/>

			<div aria-live="polite">
				{progress !== null && (
					<p className="tool-muted">Hashing… {Math.round(progress * 100)}%</p>
				)}
				{error && <p className="tool-warn" role="alert">{error}</p>}
				{result && (
					<p className="tool-muted"><strong>{result.name}</strong> · {fmtSize(result.size)}</p>
				)}
			</div>

			{result && (
				<ol className="tool-out">
					<CopyRow label="sha256 (Blossom blob id)" value={result.hash} />
				</ol>
			)}
		</div>
	);
}
