// npm run dev: the client build in watch mode next to the server under
// nodemon. The server refuses to start without dist/client/manifest.json, so
// it is only launched once the first client build has written it.
import { spawn } from 'child_process';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(root, 'dist/client/manifest.json');

rmSync(manifest, { force: true });

const children = [];
const run = (command, args) => {
	const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: process.platform == 'win32' });
	children.push(child);
	child.on('exit', code => {
		for (const other of children) if (other != child && other.exitCode == null) other.kill();
		process.exit(code ?? 0);
	});
	return child;
};

run(process.execPath, ['scripts/build-client.mjs', '--watch']);

const started = Date.now();
const timer = setInterval(() => {
	if (existsSync(manifest)) {
		clearInterval(timer);
		run('npm', ['run', 'dev:server']);
	} else if (Date.now() - started > 60000) {
		clearInterval(timer);
		console.error('dev - The client build did not produce dist/client/manifest.json');
		for (const child of children) child.kill();
		process.exit(1);
	}
}, 200);

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		for (const child of children) child.kill();
		process.exit(0);
	});
}
