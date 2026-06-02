#!/usr/bin/env node
/**
 * Pre-publish gate for Design Mode.
 *
 * Runs every check that doesn't need a real Chrome browser, then prints a clear
 * pass/fail report and a pointer to docs/e2e-testcases.md for the manual phase.
 *
 *   npm run prepublish:check
 *
 * Exits 0 only if every automated step passes.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let failed = 0;
const results = [];

function step(name, fn) {
  process.stdout.write(`${DIM}…${RESET} ${name}`);
  try {
    fn();
    process.stdout.write(`\r${GREEN}✓${RESET} ${name}\n`);
    results.push({ name, ok: true });
  } catch (err) {
    process.stdout.write(`\r${RED}✗${RESET} ${name}\n`);
    process.stdout.write(`   ${RED}${err.message}${RESET}\n`);
    results.push({ name, ok: false, err: err.message });
    failed++;
  }
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', ...opts });
}

function assertFile(path, label = path) {
  const full = resolve(root, path);
  if (!existsSync(full) || !statSync(full).isFile()) {
    throw new Error(`Expected file: ${label}`);
  }
}

console.log(`\n${BOLD}◆ Design Mode — pre-publish check${RESET}\n`);

// ── 1. Build the extension ────────────────────────────────────────────────
step('Build extension', () => {
  run('npm run build:extension', { stdio: 'pipe' });
});

// ── 2. Verify extension dist has required files ────────────────────────────
step('Extension bundle integrity', () => {
  const expected = [
    'packages/extension/dist/manifest.json',
    'packages/extension/dist/content.js',
    'packages/extension/dist/background.js',
    'packages/extension/dist/sidepanel.js',
    'packages/extension/dist/sidepanel/index.html',
    'packages/extension/dist/icons/icon16.png',
    'packages/extension/dist/icons/icon48.png',
    'packages/extension/dist/icons/icon128.png',
  ];
  for (const f of expected) assertFile(f);
});

// ── 3. Validate manifest.json ─────────────────────────────────────────────
step('Manifest sanity', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'packages/extension/dist/manifest.json'), 'utf8')
  );
  if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
  if (!manifest.side_panel?.default_path) throw new Error('side_panel.default_path missing');
  if (!manifest.background?.service_worker) throw new Error('background.service_worker missing');
  if (!manifest.content_scripts?.[0]?.js?.includes('content.js')) {
    throw new Error('content_scripts must reference content.js');
  }
  if (!manifest.icons?.['16'] || !manifest.icons?.['48'] || !manifest.icons?.['128']) {
    throw new Error('icons 16 / 48 / 128 must be declared');
  }
  if (!manifest.permissions?.includes('storage')) {
    throw new Error('storage permission missing (needed for session persistence)');
  }
  if (!manifest.permissions?.includes('sidePanel')) {
    throw new Error('sidePanel permission missing');
  }
});

// ── 4. MCP tool count check (catch accidental tool deletions) ─────────────
step('Local MCP server has all 7 tools', () => {
  const mcp = readFileSync(resolve(root, 'packages/mcp-local/src/mcp-server.ts'), 'utf8');
  const matches = mcp.match(/server\.tool\(/g) || [];
  if (matches.length < 7) {
    throw new Error(`Expected ≥7 tools registered in mcp-server.ts, found ${matches.length}`);
  }
});

// ── 5. Local MCP build (uses extra heap; package.json sets NODE_OPTIONS) ──
step('Build local MCP server', () => {
  run('npm --workspace @design-mode/mcp-local run build', { stdio: 'pipe' });
});

step('Local MCP bundle integrity', () => {
  assertFile('packages/mcp-local/dist/bin/cli.js');
  assertFile('packages/mcp-local/dist/index.js');
  assertFile('packages/mcp-local/dist/mcp-server.js');
});

// ── 6. Build the website ──────────────────────────────────────────────────
step('Build website', () => {
  run('npm run build:website', { stdio: 'pipe' });
});

step('Website export integrity', () => {
  // Next.js produces .next/server/app/page.* files; static export goes to out/ if configured.
  // Either way the build manifests must exist.
  if (!existsSync(resolve(root, 'website/.next/BUILD_ID'))) {
    throw new Error('website/.next/BUILD_ID missing — did Next.js build complete?');
  }
});

// ── Report ────────────────────────────────────────────────────────────────
console.log();
if (failed === 0) {
  console.log(`${GREEN}${BOLD}✓ All ${results.length} automated checks passed.${RESET}\n`);
  console.log(`${YELLOW}Now walk the manual phase:${RESET}`);
  console.log(`  ${DIM}1.${RESET} Load ${BOLD}packages/extension/dist/${RESET} into chrome://extensions`);
  console.log(`  ${DIM}2.${RESET} Open ${BOLD}docs/e2e-testcases.md${RESET} and run every phase`);
  console.log(`  ${DIM}3.${RESET} Tag the run in your release notes\n`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}✗ ${failed} of ${results.length} checks failed.${RESET}`);
  console.log(`${RED}Do not publish until every step passes.${RESET}\n`);
  process.exit(1);
}
