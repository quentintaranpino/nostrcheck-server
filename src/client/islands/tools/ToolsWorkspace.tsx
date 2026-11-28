import { useEffect, useState } from 'preact/hooks';
import { KeyConverter } from './KeyConverter.js';
import { KeypairGenerator } from './KeypairGenerator.js';
import { EventVerifier } from './EventVerifier.js';
import { BlobHasher } from './BlobHasher.js';

type ToolId = 'convert' | 'generate' | 'verify' | 'hash';

const TOOLS: { id: ToolId; name: string; hint: string; blurb: string }[] = [
	{ id: 'convert', name: 'Key converter', hint: 'npub ⇄ hex',
		blurb: 'Reads npub, nsec, note, nevent, nprofile, naddr or raw hex and shows everything it can derive.' },
	{ id: 'generate', name: 'Keypair generator', hint: 'new identity',
		blurb: 'A brand new Nostr identity, made in this browser and never sent anywhere.' },
	{ id: 'verify', name: 'Event verifier', hint: 'id + signature',
		blurb: 'Checks that a signed event really hashes to its id and that the signature holds.' },
	{ id: 'hash', name: 'Blob hash', hint: 'sha256',
		blurb: 'The sha256 of a file, the same id Blossom uses, computed without uploading it.' },
];

const isToolId = (v: string): v is ToolId => TOOLS.some(t => t.id == v);

/**
 * The tools page: a rail that picks a tool and a pane that runs it. Every
 * tool stays mounted, so switching back keeps what was typed.
 */
const ToolsWorkspace = () => {
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
			if (el instanceof Element && el.closest('input, textarea, select, [contenteditable="true"]')) return;
			const n = Number(e.key);
			if (Number.isInteger(n) && n >= 1 && n <= TOOLS.length) {
				e.preventDefault();
				pick(TOOLS[n - 1].id);
			}
		};
		addEventListener('keydown', onKey);
		return () => removeEventListener('keydown', onKey);
	}, []);

	const current = TOOLS.find(t => t.id == active) ?? TOOLS[0];

	return (
		<div class="nc-ws">
			<nav class="nc-ws-rail" aria-label="Tools">
				<ul>
					{TOOLS.map((t, i) => (
						<li key={t.id}>
							<button
								type="button"
								class="nc-ws-tab"
								aria-current={t.id == active ? 'true' : undefined}
								onClick={() => pick(t.id)}
							>
								<span class="nc-ws-tab-name">{t.name}</span>
								<span class="nc-ws-tab-hint">{t.hint}</span>
								<kbd class="nc-ws-tab-key" aria-hidden="true">{i + 1}</kbd>
							</button>
						</li>
					))}
				</ul>
			</nav>

			<div class="nc-ws-pane">
				<div class="nc-ws-pane-head">
					<h2>{current.name}</h2>
					<p>{current.blurb}</p>
				</div>

				<div hidden={active != 'convert'}><KeyConverter /></div>
				<div hidden={active != 'generate'}><KeypairGenerator /></div>
				<div hidden={active != 'verify'}><EventVerifier /></div>
				<div hidden={active != 'hash'}><BlobHasher /></div>
			</div>
		</div>
	);
};

export { ToolsWorkspace };
