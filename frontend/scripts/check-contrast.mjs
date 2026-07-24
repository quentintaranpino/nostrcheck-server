// Validates token pairs against WCAG, for every theme in tokens.css. Fails the
// build conversation early instead of shipping unreadable text.
// Run: node scripts/check-contrast.mjs
import { wcagContrast, formatHex, oklch, parse } from 'culori';
import { readFileSync } from 'fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');

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

// [foreground, background, minimum]. 4.5 = body text (1.4.3), 3 = large text,
// UI component boundaries and meaningful graphics (1.4.11).
const pairs = [
	['--ink', '--bg', 4.5],
	['--ink', '--surface', 4.5],
	['--ink-muted', '--surface', 4.5],
	['--ink-muted', '--bg', 4.5],
	['--ink-muted', '--surface-raised', 4.5],
	['--accent', '--bg', 3],
	['--accent', '--surface-raised', 3],
	['--danger', '--surface', 3],
	['--danger', '--surface-raised', 3],
	// state colours label small badge text, so they need the body threshold
	['--success', '--surface', 4.5],
	['--success', '--surface-raised', 4.5],
	['--warning', '--surface', 4.5],
	['--warning', '--surface-raised', 4.5],
	['--info', '--surface', 4.5],
	['--info', '--surface-raised', 4.5],
	// component outlines: every surface the border can land on
	['--border', '--bg', 3],
	['--border', '--surface', 3],
	['--border', '--surface-raised', 3],
	// primary button paints --bg over --accent
	['--bg', '--accent', 4.5],
	// focus ring has to read against what it surrounds
	['--accent', '--surface', 3],
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

// The theme-color meta is a literal in the layout; it has drifted from --bg
// once already, so fail the build when it does.
console.log('\ntheme-color vs --bg');
const literals = [...layout.matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0].toLowerCase());
for (const [name, theme] of [['dark', dark], ['light', light]]) {
	const expected = formatHex(oklch(parse(theme['--bg'])));
	const ok = literals.includes(expected);
	if (!ok) failed = true;
	console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: --bg is ${expected}${ok ? '' : ' — not found in Layout.astro'}`);
}

process.exit(failed ? 1 : 0);
