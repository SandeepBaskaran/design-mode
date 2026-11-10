#!/usr/bin/env node
// Build a minimal source archive for Firefox AMO reviewers and copy it to
// ~/Downloads. Only tracked files from HEAD are included (git archive).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const archiveName = `design-mode-firefox-source-${version}`;
const outputPath = join(homedir(), 'Downloads', `${archiveName}.zip`);

const WORKSPACE_MANIFESTS = new Set([
  'packages/cli/package.json',
  'packages/mcp-cloud/package.json',
  'packages/mcp-local/package.json',
  'website/package.json',
]);

function gitLsFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root });
  return out.toString('utf8').split('\0').filter(Boolean);
}

function isTestPath(file) {
  return (
    /(^|\/)tests?\//.test(file) ||
    /(^|\/)test-fixtures\//.test(file) ||
    /\.(test|spec|integration\.test)\.[cm]?[jt]sx?$/.test(file)
  );
}

function shouldInclude(file) {
  if (file === 'package.json' || file === 'package-lock.json' || file === 'LICENSE') return true;
  if (file === 'SOURCE-BUILD-README.md') return true;
  if (file.startsWith('icons/')) return true;
  if (WORKSPACE_MANIFESTS.has(file)) return true;
  if (file.startsWith('packages/shared/')) return !isTestPath(file);
  if (file.startsWith('packages/extension/')) {
    if (isTestPath(file)) return false;
    // Keep the Inter font README; drop review/docs markdown that is not a build input.
    if (file.endsWith('.md') && file !== 'packages/extension/public/assets/fonts/README.md') return false;
    return true;
  }
  return false;
}

const files = gitLsFiles().filter(shouldInclude);
if (!files.includes('package.json') || !files.includes('package-lock.json')) {
  throw new Error('Refusing to package: package.json or package-lock.json missing from git ls-files');
}
if (!files.some((file) => file.startsWith('packages/extension/src/'))) {
  throw new Error('Refusing to package: no extension source in the file list');
}

const staging = mkdtempSync(join(tmpdir(), 'dm-firefox-source-'));
const archiveZip = join(staging, `${archiveName}.zip`);

try {
  execFileSync('git', ['archive', '--format=zip', `--prefix=${archiveName}/`, '-o', archiveZip, 'HEAD', ...files], {
    cwd: root,
    stdio: 'inherit',
  });
  execFileSync('mkdir', ['-p', dirname(outputPath)]);
  execFileSync('cp', [archiveZip, outputPath]);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

const bytes = execFileSync('wc', ['-c', outputPath], { encoding: 'utf8' }).trim();
const digest = execFileSync('shasum', ['-a', '256', outputPath], { encoding: 'utf8' }).trim();
process.stdout.write(`Wrote ${outputPath}\n`);
process.stdout.write(`Files: ${files.length}\n`);
process.stdout.write(`${bytes}\n`);
process.stdout.write(`${digest}\n`);
