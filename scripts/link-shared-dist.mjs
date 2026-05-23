#!/usr/bin/env node
// Point this worktree's extension dist/ at the main clone's dist/ so every
// parallel-agent worktree shares one build folder (load it in Chrome once).

import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const git = (args) =>
  execSync(`git rev-parse --path-format=absolute ${args}`, { cwd: __dirname, encoding: 'utf8' }).trim();

// In the main working tree --git-dir === --git-common-dir; a linked worktree's
// git-dir lives under <main>/.git/worktrees/<name>, so they differ.
const gitDir = git('--git-dir');
const commonDir = git('--git-common-dir');
const mainDist = join(dirname(commonDir), 'packages/extension/dist');
const thisDist = join(__dirname, '..', 'packages/extension/dist');

if (gitDir === commonDir) {
  mkdirSync(mainDist, { recursive: true });
  console.log(`✓ Main copy — dist/ stays a normal folder.\n  Load this in Chrome once: ${mainDist}`);
} else {
  mkdirSync(mainDist, { recursive: true });
  rmSync(thisDist, { recursive: true, force: true });
  symlinkSync(mainDist, thisDist);
  console.log(`✓ Linked this worktree's dist/ → main copy.\n  ${thisDist}\n  → ${mainDist}`);
}
