#!/usr/bin/env node
/**
 * Builds the zip the Chrome Web Store takes.
 *
 * Packaging by hand is how a stale dist/, a stray source map or a version that
 * disagrees with package.json ends up uploaded — none of which are visible in
 * the zip until a reviewer rejects it. This refuses rather than guesses.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const out = join(root, 'release');

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

if (!existsSync(dist)) fail('dist/ is missing — run `npm run build` first.');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

if (manifest.version !== pkg.version) {
  fail(`dist/manifest.json is version ${manifest.version}, package.json is ${pkg.version} — rebuild.`);
}

// A source map in the package ships the whole source to every user and bloats
// the upload; the store does not want it and neither do we.
const maps = execFileSync('find', [dist, '-name', '*.map']).toString().trim();
if (maps) fail(`source maps in dist/:\n${maps}`);

mkdirSync(out, { recursive: true });
const zip = join(out, `unshackled-llm-bridge-${pkg.version}.zip`);
rmSync(zip, { force: true });
// -X leaves out the extra file attributes that make zips differ between
// machines for no reason.
execFileSync('zip', ['-qrX', zip, '.'], { cwd: dist });

const size = execFileSync('du', ['-h', zip]).toString().split('\t')[0];
console.log(`✓ ${zip} (${size})`);
console.log(`  version ${pkg.version}, from dist/ built at ${manifest.version}`);
