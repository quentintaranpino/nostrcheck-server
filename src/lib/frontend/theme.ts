// Tenant colour -> v8 design tokens. No imports on purpose: the client build
// (scripts/check-contrast.mjs) loads the compiled file to check the result
// against src/client/css/tokens.css, so this must stay free of side effects.

type Rgb = [number, number, number];
type Oklch = { l: number; c: number; h: number };
type ThemeName = "dark" | "light";
type ThemeTokens = { hue: number; accentDark: string; accentLight: string };

const DEFAULT_HUE = 300;
const DEFAULT_ACCENT: { [key in ThemeName]: Oklch } = {
	dark: { l: 0.6736, c: 0.1977, h: 296.8 },
	light: { l: 0.5, c: 0.21, h: 296.8 },
};

// Lightness and chroma of the neutrals the accent has to read against. Same
// numbers as tokens.css; check-contrast.mjs fails the build if they drift.
const NEUTRALS: { [key in ThemeName]: { [key: string]: [number, number] } } = {
	dark: { bg: [0.15, 0.02], surface: [0.225, 0.025], raised: [0.235, 0.03] },
	light: { bg: [0.99, 0.004], surface: [0.95, 0.008], raised: [1, 0] },
};

// --accent-hover in tokens.css is the accent mixed 90% with black in oklch.
const HOVER_MIX = 0.9;
// Below this chroma the tenant colour is a grey and has no usable hue.
const MIN_CHROMA = 0.03;
const MAX_CHROMA = 0.21;

const toLinear = (v: number): number => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const toGamma = (v: number): number => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Parses a CSS hex colour (#rgb or #rrggbb).
 * @param hex - The colour as written in the config.
 * @returns The sRGB channels in 0..1, or null when it isn't a hex colour.
 */
const parseHex = (hex: string): Rgb | null => {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
	if (!m) return null;
	const full = m[1].length == 3 ? m[1].split("").map(ch => ch + ch).join("") : m[1];
	return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
};

/**
 * Converts an oklch colour to linear sRGB, without clipping.
 * @returns The linear channels; outside 0..1 means out of the sRGB gamut.
 */
const oklchToLinear = (l: number, c: number, h: number): Rgb => {
	const a = c * Math.cos(h * Math.PI / 180);
	const b = c * Math.sin(h * Math.PI / 180);
	const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
	const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3);
	const s_ = Math.pow(l - 0.0894841775 * a - 1.2914855480 * b, 3);
	return [
		4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		-0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
	];
};

/**
 * Converts an oklch colour to sRGB, clipping each channel the way a browser
 * does on an sRGB display.
 * @returns The sRGB channels in 0..1.
 */
const oklchToRgb = (l: number, c: number, h: number): Rgb => {
	return oklchToLinear(l, c, h).map(v => clamp(toGamma(clamp(v, 0, 1)), 0, 1)) as Rgb;
};

/**
 * Converts an sRGB colour to oklch.
 * @param rgb - The sRGB channels in 0..1.
 */
const rgbToOklch = (rgb: Rgb): Oklch => {
	const [r, g, b] = rgb.map(toLinear);
	const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const l = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
	const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
	const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
	const h = Math.atan2(bb, a) * 180 / Math.PI;
	return { l, c: Math.sqrt(a * a + bb * bb), h: h < 0 ? h + 360 : h };
};

/**
 * Formats an sRGB colour as #rrggbb.
 */
const rgbToHex = (rgb: Rgb): string => {
	return "#" + rgb.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("");
};

/**
 * WCAG 2 contrast ratio between two sRGB colours.
 * @returns A ratio from 1 to 21.
 */
const contrastRatio = (a: Rgb, b: Rgb): number => {
	const lum = (rgb: Rgb): number => {
		const [r, g, bl] = rgb.map(toLinear);
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const la = lum(a), lb = lum(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// Largest chroma up to `wanted` that still fits in sRGB at this lightness and hue.
const fitChroma = (l: number, wanted: number, h: number): number => {
	const fits = (c: number): boolean => oklchToLinear(l, c, h).every(v => v >= -0.0005 && v <= 1.0005);
	if (fits(wanted)) return wanted;
	let lo = 0, hi = wanted;
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2;
		if (fits(mid)) lo = mid; else hi = mid;
	}
	return lo;
};

// Everything tokens.css asks of --accent, for one theme at one hue. Asked
// with a little headroom so rounding to hex can't land a hair under.
const MARGIN = 0.05;
const accentPasses = (theme: ThemeName, hue: number, accent: Rgb, hover: Rgb): boolean => {
	const n = NEUTRALS[theme];
	const bg = oklchToRgb(n.bg[0], n.bg[1], hue);
	const surface = oklchToRgb(n.surface[0], n.surface[1], hue);
	const raised = oklchToRgb(n.raised[0], n.raised[1], hue);
	return contrastRatio(accent, bg) >= 4.5 + MARGIN		// links in prose, and --bg text on a primary button
		&& contrastRatio(accent, surface) >= 4.5 + MARGIN	// text on a card
		&& contrastRatio(accent, raised) >= 3 + MARGIN		// focus ring on a menu
		&& contrastRatio(hover, bg) >= 4.5 + MARGIN;		// --bg text on a hovered primary button
};

const deriveAccent = (theme: ThemeName, hue: number, base: Oklch): string => {
	const dark = theme == "dark";
	const step = dark ? 0.005 : -0.005;
	let l = dark ? clamp(base.l, 0.62, 0.82) : clamp(base.l, 0.35, 0.55);
	for (let i = 0; i < 80 && l > 0.15 && l < 0.97; i++, l += step) {
		const c = fitChroma(l, Math.min(base.c, MAX_CHROMA), base.h);
		// Judge the colour the browser will get: the rounded hex, and the
		// hover it mixes from that hex.
		const hex = rgbToHex(oklchToRgb(l, c, base.h));
		const accent = parseHex(hex) as Rgb;
		const mixed = rgbToOklch(accent);
		const hover = oklchToRgb(mixed.l * HOVER_MIX, mixed.c * HOVER_MIX, mixed.h);
		if (accentPasses(theme, hue, accent, hover)) return hex;
	}
	const fallback = DEFAULT_ACCENT[theme];
	return rgbToHex(oklchToRgb(fallback.l, fallback.c, fallback.h));
};

/**
 * Derives the two tenant knobs of the v8 tokens from the tenant's main colour:
 * the hue that tints the neutrals and an accent per theme. The accent keeps
 * the tenant's hue and chroma, and its lightness is moved until it passes the
 * same contrast pairs the build checks, so no tenant colour can end up
 * unreadable in either theme.
 * @param color1 - appearance.dynamicbackground.color1, a hex colour.
 * @returns The hue and one accent per theme as #rrggbb.
 */
const deriveThemeTokens = (color1: string): ThemeTokens => {
	const rgb = parseHex(color1);
	if (rgb == null) {
		return {
			hue: DEFAULT_HUE,
			accentDark: rgbToHex(oklchToRgb(DEFAULT_ACCENT.dark.l, DEFAULT_ACCENT.dark.c, DEFAULT_ACCENT.dark.h)),
			accentLight: rgbToHex(oklchToRgb(DEFAULT_ACCENT.light.l, DEFAULT_ACCENT.light.c, DEFAULT_ACCENT.light.h)),
		};
	}
	const base = rgbToOklch(rgb);
	// A grey tenant colour has no hue of its own: keep the default tint.
	const grey = base.c < MIN_CHROMA;
	const hue = grey ? DEFAULT_HUE : Math.round(base.h * 10) / 10;
	const source: Oklch = grey ? { l: base.l, c: 0, h: DEFAULT_HUE } : { l: base.l, c: base.c, h: hue };
	return {
		hue,
		accentDark: deriveAccent("dark", hue, source),
		accentLight: deriveAccent("light", hue, source),
	};
};

/**
 * The block /static/css/theme.css appends for the v8 tokens.
 * @param color1 - appearance.dynamicbackground.color1, a hex colour.
 * @returns CSS overriding --hue and --accent for both themes.
 */
const themeTokensCss = (color1: string): string => {
	const t = deriveThemeTokens(color1);
	return `:root { --hue: ${t.hue}; --accent: ${t.accentDark}; }\n`
		+ `html[data-bs-theme="light"] { --accent: ${t.accentLight}; }\n`;
};

export {
	deriveThemeTokens,
	themeTokensCss,
	parseHex,
	oklchToRgb,
	rgbToOklch,
	rgbToHex,
	contrastRatio,
	NEUTRALS,
	DEFAULT_HUE,
	DEFAULT_ACCENT,
	HOVER_MIX,
};
export type { Rgb, Oklch, ThemeName, ThemeTokens };
