/**
 * Chrome behaviours: scroll hairline, light-dismiss for the <details> menus,
 * the search hotkeys and the logout cleanup.
 */
const initNav = (): void => {

	const nav = document.querySelector<HTMLElement>('[data-nav]');
	if (nav) {
		const onScroll = (): void => { nav.classList.toggle('is-scrolled', window.scrollY > 4); };
		onScroll();
		addEventListener('scroll', onScroll, { passive: true });
	}

	// Native <details> doesn't light-dismiss; give it outside-click and Escape.
	const menus = [...document.querySelectorAll<HTMLDetailsElement>('[data-menu]')];
	document.addEventListener('click', e => {
		for (const menu of menus) {
			if (menu.open && e.target instanceof Node && !menu.contains(e.target)) menu.open = false;
		}
	});
	document.addEventListener('keydown', e => {
		if (e.key != 'Escape') return;
		for (const menu of menus) {
			if (!menu.open) continue;
			menu.open = false;
			menu.querySelector<HTMLElement>('summary')?.focus();
		}
	});

	// The Ctrl/Cmd+K hint has to be true. "/" works too, outside a field.
	const search = document.querySelector<HTMLAnchorElement>('[data-search]');
	if (search) {
		addEventListener('keydown', e => {
			const inField = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]') != null;
			const cmdK = (e.key == 'k' || e.key == 'K') && (e.ctrlKey || e.metaKey);
			const slash = e.key == '/' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey;
			if (!cmdK && !slash) return;
			e.preventDefault();
			search.click();
		});
	}

	// The endpoint kills the session, but the cached profile lives in
	// localStorage. Drop it too or the legacy pages keep the old avatar.
	for (const link of document.querySelectorAll('[data-logout]')) {
		link.addEventListener('click', () => {
			try { localStorage.removeItem('profileData'); } catch { /* private mode */ }
		});
	}
};

export { initNav };
