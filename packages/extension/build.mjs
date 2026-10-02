#!/usr/bin/env node
// Build script for the browser extension.
// Runs vite build once per entry point since content scripts need IIFE format.
// A single dist/ + a single manifest.json serve BOTH Chrome and Firefox: each
// browser reads its own manifest keys (side_panel/service_worker vs
// sidebar_action/scripts) and ignores the other's, and the JS detects the
// browser at runtime (src/platform/target.ts).

import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { analyticsBuildEnv } from './analytics-build-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');

const entries = ['content', 'background', 'sidepanel'];
let buildEnv = process.env;
try {
  if (process.argv.slice(2).some(arg => arg !== '--analytics')) throw new Error('Unknown build option');
  if (process.argv.includes('--analytics')) buildEnv = analyticsBuildEnv(__dirname);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}


console.log('\n◆ Building Design Mode extension...\n');

for (const entry of entries) {
  console.log(`  Building ${entry}...`);
  execFileSync(process.execPath, [viteCli, 'build'], {
    cwd: __dirname,
    env: { ...buildEnv, ENTRY: entry },
    stdio: 'inherit',
    shell: false,
  });
}

// Copy static files to dist
console.log('  Copying static assets...');
try {
  cpSync(resolve(__dirname, 'public/manifest.json'), resolve(__dirname, 'dist/manifest.json'));

  // Copy sidepanel HTML
  mkdirSync(resolve(__dirname, 'dist/sidepanel'), { recursive: true });
  cpSync(resolve(__dirname, 'src/sidepanel/index.html'), resolve(__dirname, 'dist/sidepanel/index.html'));

  // Copy assets
  if (existsSync(resolve(__dirname, 'public/assets'))) {
    cpSync(resolve(__dirname, 'public/assets'), resolve(__dirname, 'dist/assets'), { recursive: true });
  }

  // Copy icons — prefer the repo-root /icons folder (user-provided), fall back to public/icons
  try {
    const rootIcons = resolve(__dirname, '../../icons');
    const publicIcons = resolve(__dirname, 'public/icons');
    if (existsSync(rootIcons)) {
      cpSync(rootIcons, resolve(__dirname, 'dist/icons'), { recursive: true });
    } else if (existsSync(publicIcons)) {
      cpSync(publicIcons, resolve(__dirname, 'dist/icons'), { recursive: true });
    }
  } catch {}
} catch (e) {
  console.error('  Warning copying assets:', e.message);
}

console.log('\n✓ Build complete! Load dist/ in chrome://extensions (Chrome) or about:debugging (Firefox)\n');
