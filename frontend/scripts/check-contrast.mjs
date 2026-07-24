// Validates token pairs against WCAG, for every theme in tokens.css. Fails the
// build conversation early instead of shipping unreadable text.
// Run: node scripts/check-contrast.mjs
import { wcagContrast } from 'culori';
import { readFileSync } from 'fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

// Each theme is one declaration block: `:root {…}` is dark, the
// `[data-bs-theme="light"]` block overrides it. Light inherits anything it
// doesn't redeclare, so resolve it on top of dark.
const block = (selector) => {
	const start = css.indexOf(selector);
	if (start === -1) throw new Error(`block ${selector} not found`);
	const open = css.indexOf('{', start);
	const close = css.indexOf('}', open);
	const out = {};
	for (const line of css.slice(open + 1, close).split('\n')) {
		const m = line.match(/(--[\w-]+):\s*([^;]+);/);
		if (m) out[m[1]] = m[2].trim();
	}
	return out;
};

const dark = block(':root');
const light = { ...dark, ...block('html[data-bs-theme="light"]') };

// [foreground, background, minimum]. The last pair is the primary button,
// which paints --bg over --accent.
const pairs = [
	['--ink', '--bg', 4.5],
	['--ink', '--surface', 4.5],
	['--ink-muted', '--surface', 4.5],
	['--ink-muted', '--bg', 4.5],
	['--accent', '--bg', 3],
	['--danger', '--surface', 3],
	['--border', '--bg', 1.3],
	['--bg', '--accent', 4.5],
];

let failed = false;
for (const [name, theme] of [['dark', dark], ['light', light]]) {
	console.log(`\n${name}`);
	for (const [fg, bg, min] of pairs) {
		const ratio = wcagContrast(theme[fg], theme[bg]);
		const ok = ratio >= min;
		if (!ok) failed = true;
		console.log(`  ${ok ? 'PASS' : 'FAIL'} ${fg} on ${bg}: ${ratio.toFixed(2)} (min ${min})`);
	}
}
process.exit(failed ? 1 : 0);
