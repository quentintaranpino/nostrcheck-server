import { useState } from 'react';
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
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const hash = async (file: File | undefined) => {
		if (!file) return;
		setBusy(true);
		setError(null);
		try {
			// The file is read here and never uploaded: this is the same sha256
			// Blossom uses as the blob id, so you can check a server has your
			// blob before (or without) sending it.
			const buf = await file.arrayBuffer();
			const digest = await crypto.subtle.digest('SHA-256', buf);
			const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
			setResult({ name: file.name, size: file.size, hash: hex });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not read that file');
			setResult(null);
		} finally {
			setBusy(false);
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
				{busy && <p className="tool-muted">Hashing…</p>}
				{error && <p className="tool-warn" role="alert">{error}</p>}
				{result && !busy && (
					<>
						<p className="tool-muted">
							<strong>{result.name}</strong> · {fmtSize(result.size)}
						</p>
						<ol className="tool-out">
							<CopyRow label="sha256 (Blossom blob id)" value={result.hash} />
						</ol>
					</>
				)}
			</div>
		</div>
	);
}
