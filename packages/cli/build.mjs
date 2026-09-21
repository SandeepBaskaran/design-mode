import { build } from 'esbuild';
import { chmod, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const result = await build({
  metafile: true,
  absWorkingDir: root,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.cjs',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['bufferutil', 'utf-8-validate'],
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'inline',
});
await chmod(new URL('dist/cli.cjs', import.meta.url), 0o755);

const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const absolute = resolve(root, input);
  const marker = '/node_modules/';
  const start = absolute.lastIndexOf(marker);
  if (start < 0) continue;
  const parts = absolute.slice(start + marker.length).split('/');
  const name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  packages.add(absolute.slice(0, start + marker.length) + name);
}
const notices = [];
for (const directory of [...packages].sort()) {
  const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const licenses = (await readdir(directory)).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  if (!licenses.length) throw new Error(`Missing bundled dependency license: ${metadata.name}`);
  const texts = await Promise.all(licenses.sort().map(name => readFile(resolve(directory, name), 'utf8')));
  notices.push(`${metadata.name}@${metadata.version} (${metadata.license})\n\n${texts.join('\n')}`);
}
await writeFile(resolve(root, 'dist/THIRD-PARTY-NOTICES.txt'), notices.join('\n\n---\n\n'));

