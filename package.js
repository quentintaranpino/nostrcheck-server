import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const versionParts = packageJson.version.split('.');
let buildNumber = 0;
if (versionParts.length > 1) {
  buildNumber = parseInt(versionParts[versionParts.length - 1], 10);
  if (isNaN(buildNumber)) {
    buildNumber = 0;
  }
}

buildNumber += 1;

versionParts[versionParts.length - 1] = buildNumber.toString();
packageJson.version = versionParts.join('.');

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');

execSync('npm install', { stdio: 'inherit' });