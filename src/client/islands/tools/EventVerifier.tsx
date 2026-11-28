import { useMemo, useState } from 'preact/hooks';
import { verifyEvent, getEventHash } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { CopyRow } from './CopyRow.js';

type Check = { ok: boolean; label: string; detail: string };

type Result =
	| { state: 'empty' }
	| { state: 'badjson'; message: string }
	| { state: 'checked'; checks: Check[]; kind: number; created: string; npub: string | null };

const REQUIRED = ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig'];

const analyse = (raw: string): Result => {
	if (raw.trim() == '') return { state: 'empty' };

	let ev: Record<string, unknown>;
	try {
		ev = JSON.parse(raw);
	} catch (e) {
		return { state: 'badjson', message: e instanceof Error ? e.message : 'Not valid JSON' };
	}
	if (ev == null || typeof ev != 'object' || Array.isArray(ev)) {
		return { state: 'badjson', message: 'Not an event object' };
	}

	const missing = REQUIRED.filter(f => !(f in ev));
	if (missing.length > 0) {
		return { state: 'badjson', message: `Missing field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` };
	}

	const checks: Check[] = [];
	// The id is a hash of the event's own contents, so a mismatch means the
	// event was altered after signing. Worth separating from a bad sig.
	try {
		const computed = getEventHash(ev as never);
		checks.push({
			ok: computed === ev.id,
			label: 'Event id',
			detail: computed === ev.id ? 'matches the hash of its contents' : `should be ${computed}`,
		});
	} catch {
		checks.push({ ok: false, label: 'Event id', detail: 'could not be computed from these fields' });
	}

	try {
		const valid = verifyEvent(ev as never);
		checks.push({
			ok: valid,
			label: 'Signature',
			detail: valid ? 'signed by this pubkey' : 'does not verify against this pubkey',
		});
	} catch {
		checks.push({ ok: false, label: 'Signature', detail: 'could not be verified' });
	}

	let npub: string | null = null;
	try { npub = nip19.npubEncode(String(ev.pubkey)); } catch { /* malformed pubkey */ }

	const ts = Number(ev.created_at);
	return {
		state: 'checked',
		checks,
		kind: Number(ev.kind),
		created: Number.isFinite(ts) ? new Date(ts * 1000).toLocaleString() : String(ev.created_at),
		npub,
	};
};

/**
 * Checks that a signed event hashes to its id and that the signature holds.
 */
const EventVerifier = () => {
	const [raw, setRaw] = useState('');
	const result = useMemo(() => analyse(raw), [raw]);

	return (
		<div class="nc-tool-body">
			<label class="nc-tool-label" for="ev-input">Paste a signed event</label>
			<textarea
				id="ev-input"
				class="nc-tool-textarea"
				value={raw}
				onInput={e => setRaw(e.currentTarget.value)}
				placeholder={'{"id":"…","pubkey":"…","created_at":…,"kind":1,"tags":[],"content":"…","sig":"…"}'}
				spellcheck={false}
				rows={5}
			/>

			<div aria-live="polite">
				{result.state == 'badjson' && <p class="nc-tool-warn" role="alert">{result.message}</p>}

				{result.state == 'checked' && (
					<>
						<ul class="nc-tool-checks">
							{result.checks.map(c => (
								<li key={c.label} data-ok={String(c.ok)}>
									<span class="nc-tool-check-mark" aria-hidden="true">{c.ok ? '✓' : '✕'}</span>
									<span><strong>{c.label}</strong> {c.detail}</span>
								</li>
							))}
						</ul>
						<dl class="nc-tool-facts">
							<div><dt>Kind</dt><dd>{result.kind}</dd></div>
							<div><dt>Created</dt><dd>{result.created}</dd></div>
						</dl>
					</>
				)}
			</div>

			{/* Deliberately outside the live region: 63 characters of bech32 read
			    aloud on every keystroke is noise. It still gets the same copy
			    affordance as every other derived value on the page. */}
			{result.state == 'checked' && result.npub && (
				<ol class="nc-tool-out">
					<CopyRow label="author (npub)" value={result.npub} />
				</ol>
			)}
		</div>
	);
};

export { EventVerifier };
