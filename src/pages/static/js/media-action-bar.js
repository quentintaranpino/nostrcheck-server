// Shared action bar for media tiles. Exposes window.mediaActionBar so the public
// gallery and the moderation gallery build the same control strip instead of each
// hand-rolling its own.
//
// The bar is declarative: callers pass a list of action descriptors and get a
// container back. What varies between the two galleries is which actions exist
// and whether the bar hides until hover, not what a button looks like.
//
// The caller owns the behaviour: this file writes no click handlers and knows
// nothing about endpoints. Every button carries data-action so a single delegated
// listener on the tile can route it.

(function () {
  if (window.mediaActionBar) return; // idempotent — safe to load twice

  // Bootstrap variant per action kind, so "delete is danger, ban is danger,
  // confirm is success" is decided once for every gallery that uses the bar.
  const variants = {
    info:       'btn-primary',
    view:       'btn-dark',
    zoom:       'btn-dark',
    report:     'btn-warning',
    visibility: 'btn-secondary',
    active:     'btn-secondary',
    checked:    'btn-success',
    nsfw:       'mod-btn-nsfw',
    retry:      'btn-info',
    pay:        'btn-warning',
    ban:        'btn-danger',
    delete:     'btn-danger',
  };

  const icons = {
    info:       'fa-solid fa-info',
    view:       'fa-solid fa-arrow-up-right-from-square',
    zoom:       'fa-solid fa-magnifying-glass-plus',
    report:     'fa-solid fa-flag',
    visibility: 'fa-solid fa-eye',
    active:     'fa-solid fa-eye',
    checked:    'fa-solid fa-check',
    nsfw:       'fa-solid fa-mask',
    retry:      'fa-solid fa-paper-plane',
    pay:        'fa-solid fa-bolt',
    ban:        'fa-solid fa-triangle-exclamation',
    delete:     'fa-solid fa-trash',
  };

  /**
   * Builds one button.
   *
   * @param {object} action - {kind, title, icon?, className?, hidden?, data?}
   *        kind decides the variant and the default icon; icon overrides it.
   *        data becomes data-* attributes, which is how the caller's delegated
   *        listener finds what it needs without a closure per button.
   * @returns {HTMLButtonElement}
   */
  function button(action) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = ['btn', variants[action.kind] || 'btn-secondary', `media-btn-${action.kind}`, action.className]
                          .filter(Boolean).join(' ');
    element.dataset.action = action.kind;
    if (action.title) element.title = action.title;
    if (action.hidden) element.classList.add('d-none');
    element.innerHTML = `<i class="${action.icon || icons[action.kind] || 'fa-solid fa-circle'}"></i>`;
    for (const [key, value] of Object.entries(action.data || {})) element.dataset[key] = String(value);
    return element;
  }

  /**
   * Builds the bar.
   *
   * @param {object[]} actions - Action descriptors, rendered in order.
   * @param {object} options - {reveal: 'hover' | 'always', className}
   *        'hover' is the public gallery's behaviour (the bar fades in over the
   *        media). 'always' is the moderation grid's: a control that appears on
   *        hover doesn't exist on a touch screen, and in batch triage the bar is
   *        the work surface, not a garnish.
   * @returns {HTMLDivElement}
   */
  function build(actions, options) {
    const settings = options || {};
    const container = document.createElement('div');
    container.className = ['media-action-bar',
                           settings.reveal === 'hover' ? 'media-action-bar-hover' : 'media-action-bar-always',
                           settings.className].filter(Boolean).join(' ');
    for (const action of actions || []) container.appendChild(button(action));
    return container;
  }

  // Swaps a button's icon and title in place. Used for the toggles (visibility,
  // active) whose icon states what the next press will do.
  function setState(bar, kind, iconClass, title) {
    const element = bar.querySelector(`[data-action="${kind}"]`);
    if (!element) return;
    const icon = element.querySelector('i');
    if (icon && iconClass) icon.className = iconClass;
    if (title) element.title = title;
  }

  function toggle(bar, kind, visible) {
    bar.querySelector(`[data-action="${kind}"]`)?.classList.toggle('d-none', !visible);
  }

  window.mediaActionBar = { build, button, setState, toggle, variants, icons };
})();
