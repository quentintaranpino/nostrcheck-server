import { useEffect, useState } from 'react';
import KeyConverter from './KeyConverter';
import KeypairGenerator from './KeypairGenerator';
import EventVerifier from './EventVerifier';
import BlobHasher from './BlobHasher';

export type ToolId = 'convert' | 'generate' | 'verify' | 'hash';

const TOOLS: { id: ToolId; name: string; hint: string; blurb: string }[] = [
	{ id: 'convert', name: 'Key converter', hint: 'npub ⇄ hex',
		blurb: 'Reads npub, nsec, note, nevent, nprofile, naddr or raw hex and shows everything it can derive.' },
	{ id: 'generate', name: 'Keypair generator', hint: 'new identity',
		blurb: 'A brand new Nostr identity, made in this browser and never sent anywhere.' },
	{ id: 'verify', name: 'Event verifier', hint: 'id + signature',
		blurb: 'Checks that a signed event really hashes to its id and that the signature holds.' },
	{ id: 'hash', name: 'Blob hash', blurb: 'The sha256 of a file — the same id Blossom uses, computed without uploading it.',
		hint: 'sha256' },
];

const isToolId = (v: string): v is ToolId => TOOLS.some(t => t.id === v);

export default function ToolsWorkspace() {
	const [active, setActive] = useState<ToolId>('convert');

	// Deep links keep working: /tools#verify opens the verifier, and picking a
	// tool updates the address bar without adding history entries.
	useEffect(() => {
		const fromHash = () => {
			const h = location.hash.slice(1);
			if (isToolId(h)) setActive(h);
		};
		fromHash();
		addEventListener('hashchange', fromHash);
		return () => removeEventListener('hashchange', fromHash);
	}, []);

	const pick = (id: ToolId) => {
		setActive(id);
		history.replaceState(null, '', `#${id}`);
	};

	// 1-4 jump between tools, unless you're typing into one of them.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			// instanceof, not a cast: a synthetic event can target window, which
			// has no closest() and would throw straight out of the handler.
			const el = e.target;
			if (el instanceof Element && el.closest('input, textarea, [contenteditable="true"]')) return;
			const n = Number(e.key);
			if (n >= 1 && n <= TOOLS.length) {
				e.preventDefault();
				pick(TOOLS[n - 1].id);
			}
		};
		addEventListener('keydown', onKey);
		return () => removeEventListener('keydown', onKey);
	}, []);

	const current = TOOLS.find(t => t.id === active) ?? TOOLS[0];

	return (
		<div className="ws">
			<nav className="ws-rail" aria-label="Tools">
				<ul>
					{TOOLS.map((t, i) => (
						<li key={t.id}>
							<button
								type="button"
								className="ws-tab"
								aria-current={t.id === active ? 'true' : undefined}
								onClick={() => pick(t.id)}
							>
								<span className="ws-tab-name">{t.name}</span>
								<span className="ws-tab-hint">{t.hint}</span>
								<kbd className="ws-tab-key" aria-hidden="true">{i + 1}</kbd>
							</button>
						</li>
					))}
				</ul>
			</nav>

			<div className="ws-pane">
				<div className="ws-pane-head">
					<h2>{current.name}</h2>
					<p>{current.blurb}</p>
				</div>

				{/* Every tool stays mounted so switching back keeps your input. */}
				<div hidden={active !== 'convert'}><KeyConverter /></div>
				<div hidden={active !== 'generate'}><KeypairGenerator /></div>
				<div hidden={active !== 'verify'}><EventVerifier /></div>
				<div hidden={active !== 'hash'}><BlobHasher /></div>
			</div>
		</div>
	);
}
