/**
 * Native <dialog> wiring. `data-dialog-autoshow` opens one on load,
 * `data-dialog-open="id"` on any control opens that dialog. Closing is a
 * `<form method="dialog">` button or Escape, both handled by the browser.
 */
const initDialogs = (): void => {

	for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[data-dialog-autoshow]')) {
		if (!dialog.open) dialog.showModal();
	}

	for (const opener of document.querySelectorAll<HTMLElement>('[data-dialog-open]')) {
		opener.addEventListener('click', () => {
			const target = document.getElementById(opener.dataset.dialogOpen || '');
			if (target instanceof HTMLDialogElement && !target.open) target.showModal();
		});
	}
};

export { initDialogs };
