// Builds the browser side of the frontend: src/client -> dist/client, served
// by Express under /assets with hashed, immutable file names. Writes
// dist/client/manifest.json, which the server reads to resolve asset('x.js').
//   node scripts/build-client.mjs           one build, contrast check, size budgets
//   node scripts/build-client.mjs --watch   rebuild on change (npm run dev)
import * as esbuild from 'esbuild';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';
import { checkContrast } from './check-contrast.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src/client');
const OUT = path.join(root, 'dist/client');
const PUBLIC_PATH = '/assets';
const watch = process.argv.includes('--watch');

// Entry points. The key the server asks for is the file name with the output
// extension: asset('base.js'), asset('site.css').
const ENTRIES = ['base.ts', 'css/site.css', 'css/tokens.css', 'css/tools.css'];
// Copied as they are, with a content hash.
const STATIC = ['icons.svg'];

// Gzip budgets in bytes, per page on the v8 layout (spec, non-negotiable 6).
const BUDGET = { css: 30 * 1024, base: 15 * 1024, island: 60 * 1024 };

const rel = (file) => path.relative(root, file).split(path.sep).join('/');
const url = (file) => `${PUBLIC_PATH}/${path.relative(OUT, path.join(root, file)).split(path.sep).join('/')}`;
const gz = (file) => gzipSync(readFileSync(path.join(root, file))).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// Every chunk a file pulls in statically, itself included.
const closure = (outputs, file, seen = new Set()) => {
	if (seen.has(file)) return seen;
	seen.add(file);
	for (const imp of outputs[file]?.imports || []) {
		if (imp.kind == 'import-statement' && !imp.external) closure(outputs, imp.path, seen);
	}
	return seen;
};

const writeManifest = (metafile) => {
	const outputs = metafile.outputs;
	const manifest = { files: {}, islands: {} };
	let baseFile = '';

	for (const [file, info] of Object.entries(outputs)) {
		if (!info.entryPoint) continue;
		const entry = rel(path.join(root, info.entryPoint));
		const known = ENTRIES.find(e => entry == `src/client/${e}`);
		if (known) {
			manifest.files[path.basename(known).replace(/\.tsx?$/, '.js')] = url(file);
			if (known == 'base.ts') baseFile = file;
		}
		// An island is a dynamic import of src/client/islands/<name>/index.tsx.
		const island = /^src\/client\/islands\/([\w-]+)\/index\.tsx?$/.exec(entry);
		if (island) manifest.islands[island[1]] = [...closure(outputs, file)].map(url);
	}

	for (const name of STATIC) {
		const body = readFileSync(path.join(SRC, name));
		const hash = createHash('sha256').update(body).digest('hex').slice(0, 8).toUpperCase();
		const ext = path.extname(name);
		const file = `${path.basename(name, ext)}-${hash}${ext}`;
		writeFileSync(path.join(OUT, file), body);
		manifest.files[name] = `${PUBLIC_PATH}/${file}`;
	}

	writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, '\t'));
	return { manifest, baseFile };
};

// Prints what each page costs and reports anything over budget.
const checkBudgets = (metafile, baseFile) => {
	const outputs = metafile.outputs;
	const over = [];
	const line = (label, bytes, budget) => {
		console.log(`  ${label.padEnd(34)} ${kb(bytes).padStart(9)}  / ${kb(budget)}`);
		if (bytes > budget) over.push(`${label}: ${kb(bytes)} gzip, budget ${kb(budget)}`);
	};

	console.log('build-client - sizes (gzip)');
	const cssFiles = Object.entries(outputs).filter(([f, i]) => i.entryPoint && f.endsWith('.css'));
	const site = cssFiles.find(([, i]) => i.entryPoint.endsWith('css/site.css'));
	const siteBytes = site ? gz(site[0]) : 0;
	line('css  site', siteBytes, BUDGET.css);
	for (const [file, info] of cssFiles) {
		const name = path.basename(info.entryPoint, '.css');
		// tokens.css is already inside site.css; it ships alone only to legacy pages
		if (name == 'site' || name == 'tokens') continue;
		line(`css  site + ${name}`, siteBytes + gz(file), BUDGET.css);
	}

	const base = [...closure(outputs, baseFile)];
	const baseBytes = base.reduce((sum, f) => sum + gz(f), 0);
	line('js   base', baseBytes, BUDGET.base);
	for (const [file, info] of Object.entries(outputs)) {
		const island = /islands\/([\w-]+)\/index\.tsx?$/.exec(info.entryPoint || '');
		if (!island) continue;
		const extra = [...closure(outputs, file)].filter(f => !base.includes(f));
		line(`js   base + island ${island[1]}`, baseBytes + extra.reduce((sum, f) => sum + gz(f), 0), BUDGET.island);
	}
	return over;
};

const options = {
	absWorkingDir: root,
	entryPoints: ENTRIES.map(e => path.join(SRC, e)),
	outdir: OUT,
	bundle: true,
	splitting: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2020',
	minify: !watch,
	sourcemap: watch ? 'inline' : false,
	metafile: true,
	publicPath: PUBLIC_PATH,
	entryNames: '[name]-[hash]',
	chunkNames: 'chunks/[name]-[hash]',
	assetNames: 'fonts/[name]-[hash]',
	loader: { '.woff2': 'file', '.woff': 'file' },
	tsconfig: path.join(SRC, 'tsconfig.json'),
	legalComments: 'none',
	logLevel: 'warning',
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

if (watch) {
	// Old hashed files pile up while watching; the next full build clears them.
	const ctx = await esbuild.context({
		...options,
		plugins: [{
			name: 'manifest',
			setup(build) {
				build.onEnd(result => {
					if (result.errors.length > 0 || !result.metafile) return;
					writeManifest(result.metafile);
					console.log(`build-client - rebuilt ${new Date().toLocaleTimeString()}`);
				});
			},
		}],
	});
	await ctx.rebuild();
	await ctx.watch();
	console.log('build-client - watching src/client');
} else {
	if (!await checkContrast()) process.exit(1);

	const result = await esbuild.build(options);
	const { manifest, baseFile } = writeManifest(result.metafile);
	for (const key of ENTRIES.map(e => path.basename(e).replace(/\.tsx?$/, '.js')).concat(STATIC)) {
		if (!manifest.files[key]) {
			console.error(`build-client - ${key} is missing from the manifest`);
			process.exit(1);
		}
	}

	const over = checkBudgets(result.metafile, baseFile);
	if (over.length > 0) {
		console.error('build-client - over budget:');
		for (const o of over) console.error(`  ${o}`);
		process.exit(1);
	}
	console.log(`build-client - ${Object.keys(result.metafile.outputs).length} files in ${rel(OUT)}`);
}
