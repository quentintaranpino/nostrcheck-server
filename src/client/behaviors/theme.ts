// Mirrors --bg per theme; scripts/check-contrast.mjs fails the build if these
// drift from the tokens. The same two values live in layout/head.ejs.
const THEME_COLOR = { dark: '#0c0912', light: '#fcfbfe' };

type Theme = 'dark' | 'light';

const readSaved = (): string | null => {
	try { return localStorage.getItem('theme'); } catch { return null; }
};

/**
 * Theme toggle. Reads and writes the same localStorage key and the same
 * data-bs-theme attribute as the legacy pages, so the choice survives a jump
 * between both. The first paint is handled by the inline script in the head.
 */
const initTheme = (): void => {

	const root = document.documentElement;
	const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');

	const paint = (theme: Theme): void => {
		root.setAttribute('data-bs-theme', theme);
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
		// The label names the current theme so the control has state.
		button?.setAttribute('aria-pressed', String(theme == 'dark'));
		button?.setAttribute('aria-label', theme == 'dark' ? 'Dark theme, switch to light' : 'Light theme, switch to dark');
	};

	paint(root.getAttribute('data-bs-theme') == 'light' ? 'light' : 'dark');

	button?.addEventListener('click', () => {
		const next: Theme = root.getAttribute('data-bs-theme') == 'dark' ? 'light' : 'dark';
		paint(next);
		try { localStorage.setItem('theme', next); } catch { /* private mode */ }
	});

	// Follow the OS while the user hasn't picked a side, same as legacy.
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
		const saved = readSaved();
		if (saved == 'dark' || saved == 'light') return;
		paint(e.matches ? 'dark' : 'light');
	});
};

export { initTheme };
