// Entry point for every page on the v8 layout. Loaded as a module, so the
// DOM is already parsed when this runs.
import { initTheme } from './behaviors/theme.js';
import { initNav } from './behaviors/nav.js';
import { initDialogs } from './behaviors/dialog.js';
import { mountIslands } from './islands/index.js';

initTheme();
initNav();
initDialogs();
mountIslands();
