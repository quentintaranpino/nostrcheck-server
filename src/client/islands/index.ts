type Mount = (el: HTMLElement, props: Record<string, unknown>) => void;

// One entry per island. Each is its own chunk, fetched only by the page
// that carries a matching <div data-island="name">.
const islands: Record<string, () => Promise<{ mount: Mount }>> = {
	tools: () => import('./tools/index.js'),
};

const readProps = (el: HTMLElement): Record<string, unknown> => {
	try { return JSON.parse(el.dataset.props || '{}'); } catch { return {}; }
};

/**
 * Mounts every `<div data-island="name" data-props='{...}'>` on the page.
 * Whatever the server rendered inside the element is replaced on mount.
 */
const mountIslands = (): void => {

	for (const el of document.querySelectorAll<HTMLElement>('[data-island]')) {
		const name = el.dataset.island || '';
		const load = islands[name];
		if (!load) {
			console.error(`mountIslands - Unknown island: ${name}`);
			continue;
		}
		load()
			.then(mod => {
				el.replaceChildren();
				mod.mount(el, readProps(el));
				el.dataset.mounted = 'true';
			})
			.catch(e => console.error(`mountIslands - Failed to load island: ${name}`, e));
	}
};

export { mountIslands };
export type { Mount };
