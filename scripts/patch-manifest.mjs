#!/usr/bin/env node
/**
 * Makes the content script loadable on the sites a user adds.
 *
 * The bundler emits each content script as a small loader that imports the
 * real module at runtime, and Chrome only allows that import on origins the
 * module is web accessible to. The bundler derives those origins from the
 * manifest's static content scripts — the three built-in sites — so on every
 * site a user added, the script was registered, the loader ran, and the import
 * was refused with "Denying load of …". Adding a site did nothing at all.
 *
 * The content script's resources are therefore also made accessible to the
 * patterns a user can grant: the same optional host permissions the manifest
 * already declares. Nothing broader is exposed than what a user can choose to
 * reach, and on a site they have not added the content script never runs.
 *
 * Trade-off, stated: a web-accessible resource can be requested by any page
 * those patterns cover, which lets such a page detect that the extension is
 * installed. The code itself is public; the cost is detectability, and it is
 * the price of running on sites chosen at runtime rather than at build time.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = join(process.cwd(), 'dist', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const optional = manifest.optional_host_permissions ?? [];
if (optional.length === 0) {
  console.log('patch-manifest: no optional hosts, nothing to do');
  process.exit(0);
}

const loaders = (manifest.content_scripts ?? []).flatMap((script) => script.js ?? []);
let patched = 0;

for (const entry of manifest.web_accessible_resources ?? []) {
  // Only the entry the bundler generated for the content scripts: it is the one
  // whose origins are the content scripts' own.
  const forContentScripts = (manifest.content_scripts ?? []).some((script) =>
    (script.matches ?? []).every((match) => (entry.matches ?? []).includes(match)),
  );
  if (!forContentScripts) continue;

  entry.matches = [...new Set([...(entry.matches ?? []), ...optional])];
  patched += 1;
}

if (patched === 0) {
  // Refuse rather than ship an extension that silently cannot run on added
  // sites: a bundler change that moved this entry should fail the build.
  console.error('patch-manifest: found no web_accessible_resources entry for the content scripts');
  console.error(`  loaders: ${loaders.join(', ')}`);
  process.exit(1);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`patch-manifest: content script reachable on ${optional.join(', ')}`);
