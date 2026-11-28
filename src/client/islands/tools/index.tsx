import { render } from 'preact';
import type { Mount } from '../index.js';
import { ToolsWorkspace } from './ToolsWorkspace.js';

/**
 * Mounts the tools workspace into its island element.
 * @param el - The `<div data-island="tools">` element.
 */
const mount: Mount = (el) => {
	render(<ToolsWorkspace />, el);
};

export { mount };
