// Validates the v8 colour tokens against WCAG, for both themes and for every
// hue a tenant can land on, then does the same for the accent the server
// derives from a tenant colour. Part of `npm run build`: unreadable text
// breaks the build instead of shipping.
// Run on its own: node scripts/check-contrast.mjs [--verbose]   (after tsc)
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = path.join(root, 'src/client/css/tokens.css');
const THEME_LIB = path.join(root, 'dist/lib/frontend/theme.js');
const APPEARANCE = path.join(root, 'dist/interfaces/appearance.js');
// Files that carry the theme-color literals, which must mirror --bg.
const THEME_COLOR_FILES = ['src/pages/layout/head.ejs', 'src/client/behaviors/theme.ts'];

// [foreground, background, minimum]. 4.5 = body text (1.4.3), 3 = large text,
// UI component boundaries and meaningful graphics (1.4.11).
const PAIRS = [
	['--ink', '--bg', 4.5],
	['--ink', '--surface', 4.5],
	['--ink', '--surface-raised', 4.5],
	['--ink-muted', '--bg', 4.5],
	['--ink-muted', '--surface', 4.5],
	['--ink-muted', '--surface-raised', 4.5],
	// links in prose, text on cards, the focus ring on a menu
	['--accent', '--bg', 4.5],
	['--accent', '--surface', 4.5],
	['--accent', '--surface-raised', 3],
	// primary button paints --bg over --accent, hovered or not
	['--bg', '--accent', 4.5],
	['--bg', '--accent-hover', 4.5],
	// These are used as text straight on the page background too (tool
	// warnings, check marks, the type tag), so they need the body threshold.
	['--danger', '--bg', 4.5],
	['--danger', '--surface', 4.5],
	['--danger', '--surface-raised', 4.5],
	['--success', '--bg', 4.5],
	['--success', '--surface', 4.5],
	['--success', '--surface-raised', 4.5],
	['--warning', '--bg', 4.5],
	['--warning', '--surface', 4.5],
	['--warning', '--surface-raised', 4.5],
	['--info', '--bg', 4.5],
	['--info', '--surface', 4.5],
	['--info', '--surface-raised', 4.5],
	// component outlines: every surface the border can land on
	['--border', '--bg', 3],
	['--border', '--surface', 3],
	['--border', '--surface-raised', 3],
];

// Each theme is one declaration block: `:root {…}` is dark, the
// `[data-bs-theme="light"]` block overrides it. Light inherits anything it
// doesn't redeclare, so it is resolved on top of dark.
const block = (css, selector) => {
	const start = css.indexOf(selector);
	if (start == -1) throw new Error(`block ${selector} not found in tokens.css`);
	const open = css.indexOf('{', start);
	const close = css.indexOf('}', open);
	const out = {};
	for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
	return out;
};

/**
 * Runs every check.
 * @param {{ verbose?: boolean }} options - verbose prints each passing pair too.
 * @returns {Promise<boolean>} true when everything passes.
 */
const checkContrast = async ({ verbose = false } = {}) => {

	if (!existsSync(THEME_LIB) || !existsSync(APPEARANCE)) {
		console.error('check-contrast - dist/lib/frontend/theme.js not found. Run tsc first (npm run build does).');
		return false;
	}
	const lib = await import(pathToFileURL(THEME_LIB).href);
	const { dynamicbackgroundThemes } = await import(pathToFileURL(APPEARANCE).href);
	const css = readFileSync(TOKENS, 'utf8');

	const dark = block(css, ':root');
	const light = { ...dark, ...block(css, 'html[data-bs-theme="light"]') };
	const themes = { dark, light };
	const failures = [];
	let checked = 0;

	// Resolves one token to sRGB at a given hue, with an optional accent override.
	const resolve = (theme, name, hue, accent) => {
		if (name == '--accent' && accent) return lib.parseHex(accent);
		if (name == '--accent-hover') {
			const mix = /^color-mix\(in oklch, var\(--accent\) (\d+)%, black\)$/.exec(theme[name] || '');
			if (!mix || Number(mix[1]) / 100 != lib.HOVER_MIX) throw new Error(`--accent-hover is "${theme[name]}", expected a ${lib.HOVER_MIX * 100}% oklch mix with black (theme.ts HOVER_MIX)`);
			const a = lib.rgbToOklch(resolve(theme, '--accent', hue, accent));
			return lib.oklchToRgb(a.l * lib.HOVER_MIX, a.c * lib.HOVER_MIX, a.h);
		}
		const m = /^oklch\(([\d.]+) ([\d.]+) (var\(--hue\)|[\d.]+)\)$/.exec(theme[name] || '');
		if (!m) throw new Error(`cannot read ${name}: "${theme[name]}"`);
		return lib.oklchToRgb(Number(m[1]), Number(m[2]), m[3] == 'var(--hue)' ? hue : Number(m[3]));
	};

	const run = (label, hue, accents, pairs) => {
		for (const name of ['dark', 'light']) {
			for (const [fg, bg, min] of pairs) {
				const ratio = lib.contrastRatio(resolve(themes[name], fg, hue, accents?.[name]), resolve(themes[name], bg, hue, accents?.[name]));
				checked++;
				const line = `${label} ${name}: ${fg} on ${bg} = ${ratio.toFixed(2)} (min ${min})`;
				if (ratio < min) failures.push(line);
				else if (verbose) console.log(`  PASS ${line}`);
			}
		}
	};

	// 1. The tokens as written, for every hue the neutrals can be tinted with.
	for (let hue = 0; hue < 360; hue += 10) run(`hue ${hue}`, hue, null, PAIRS);
	run(`hue ${dark['--hue']} (default)`, Number(dark['--hue']), null, PAIRS);

	// 2. The accent the server derives, for the built-in themes and a sweep of
	//    whatever an operator could type into the colour field.
	const accentPairs = PAIRS.filter(p => p[0].startsWith('--accent') || p[1].startsWith('--accent'));
	const colours = Object.values(dynamicbackgroundThemes).map(t => t.color1).filter(Boolean);
	colours.push('#000000', '#ffffff', '#808080', '#a575ff', 'not-a-colour');
	for (let h = 0; h < 360; h += 15) {
		for (const [l, c] of [[0.3, 0.1], [0.55, 0.2], [0.7, 0.15], [0.9, 0.08], [0.97, 0.03]]) colours.push(lib.rgbToHex(lib.oklchToRgb(l, c, h)));
	}
	for (const colour of new Set(colours)) {
		const t = lib.deriveThemeTokens(colour);
		run(`tenant ${colour}`, t.hue, { dark: t.accentDark, light: t.accentLight }, accentPairs);
	}

	// 3. theme.ts repeats the neutrals and the default knobs; catch drift.
	const lc = (theme, name) => { const m = /^oklch\(([\d.]+) ([\d.]+)/.exec(theme[name]); return [Number(m[1]), Number(m[2])]; };
	for (const name of ['dark', 'light']) {
		for (const [key, token] of [['bg', '--bg'], ['surface', '--surface'], ['raised', '--surface-raised']]) {
			checked++;
			if (String(lib.NEUTRALS[name][key]) != String(lc(themes[name], token))) failures.push(`theme.ts NEUTRALS.${name}.${key} is ${lib.NEUTRALS[name][key]} but tokens.css ${token} is ${lc(themes[name], token)}`);
		}
		const a = lib.DEFAULT_ACCENT[name];
		checked++;
		if (themes[name]['--accent'] != `oklch(${a.l} ${a.c} ${a.h})`) failures.push(`theme.ts DEFAULT_ACCENT.${name} differs from tokens.css --accent (${themes[name]['--accent']})`);
	}
	checked++;
	if (Number(dark['--hue']) != lib.DEFAULT_HUE) failures.push(`theme.ts DEFAULT_HUE is ${lib.DEFAULT_HUE} but tokens.css --hue is ${dark['--hue']}`);

	// 4. The theme-color meta is a literal; it has drifted from --bg before.
	for (const file of THEME_COLOR_FILES) {
		const literals = [...readFileSync(path.join(root, file), 'utf8').matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0].toLowerCase());
		for (const name of ['dark', 'light']) {
			const expected = lib.rgbToHex(resolve(themes[name], '--bg', Number(dark['--hue'])));
			checked++;
			if (!literals.includes(expected)) failures.push(`${file}: ${name} theme-color should be ${expected} (--bg)`);
		}
	}

	if (failures.length > 0) {
		console.error(`check-contrast - ${failures.length} of ${checked} checks failed:`);
		for (const f of failures) console.error(`  FAIL ${f}`);
		return false;
	}
	console.log(`check-contrast - ${checked} checks passed (36 hues, ${new Set(colours).size} tenant colours, both themes)`);
	return true;
};

if (process.argv[1] && path.resolve(process.argv[1]) == fileURLToPath(import.meta.url)) {
	process.exit(await checkContrast({ verbose: process.argv.includes('--verbose') }) ? 0 : 1);
}

export { checkContrast };
