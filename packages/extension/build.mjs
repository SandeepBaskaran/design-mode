#!/usr/bin/env node
// Build script for Chrome extension
// Runs vite build once per entry point since content scripts need IIFE format

import { execSync } from 'child_process';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const entries = ['content', 'background', 'sidepanel'];

// In a linked worktree, re-point dist/ at the primary worktree's copy before
// building, so every build writes through to the single Chrome-loaded dist.
// (Worktrees provisioned without a git checkout never ran the post-checkout
// hook that normally creates this symlink.)
try {
  execSync(`node ${resolve(__dirname, '../../scripts/link-shared-dist.mjs')}`, { stdio: 'inherit' });
} catch {}

console.log('\n\u25c6 Building Design Mode extension...\n');

for (const entry of entries) {
  console.log(`  Building ${entry}...`);
  execSync(`npx vite build`, {
    cwd: __dirname,
    env: { ...process.env, ENTRY: entry },
    stdio: 'inherit',
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

console.log('\n\u2713 Build complete! Load dist/ in chrome://extensions\n');
