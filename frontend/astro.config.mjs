import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

export default defineConfig({
	output: 'server',
	adapter: node({ mode: 'middleware' }),
	integrations: [react()],
	// Build into the server's dist so `npm start` ships one artifact.
	outDir: '../dist/frontend',
	vite: {
		// build lands outside frontend/'s node_modules tree, so bundle
		// everything into the entry instead of externalizing
		ssr: { noExternal: true },
	},
});
