// Validates token pairs against WCAG. Fails the build conversation early
// instead of shipping unreadable text. Run: node scripts/check-contrast.mjs
import { wcagContrast } from 'culori';
import { readFileSync } from 'fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const token = (name) => {
	const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
	if (!m) throw new Error(`token ${name} not found`);
	return m[1].trim();
};

const pairs = [
	['--ink', '--bg', 4.5],
	['--ink', '--surface', 4.5],
	['--ink-muted', '--surface', 4.5],
	['--accent', '--bg', 3],
	['--danger', '--surface', 3],
];

let failed = false;
for (const [fg, bg, min] of pairs) {
	const ratio = wcagContrast(token(fg), token(bg));
	const ok = ratio >= min;
	if (!ok) failed = true;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${fg} on ${bg}: ${ratio.toFixed(2)} (min ${min})`);
}
process.exit(failed ? 1 : 0);
