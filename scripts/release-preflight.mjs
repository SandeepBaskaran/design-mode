#!/usr/bin/env node
// Fast release preflight (before `npm run verify`) and post-release check
// (after npm publish). No extra dependencies.
//
//   npm run release:preflight
//   npm run release:postcheck -- --tarball /path/to/designmode-app-cli-<version>.tgz
//
// Leftover previous-version hits are ignored in CHANGELOG.md, package-lock.json,
// website/src/content/changelog.ts (historical entries),
// packages/extension/src/content/cloud-readiness.test.ts (mock SSE hello
// payloads; those tests do not assert that version string), and
// scripts/release-preflight.test.mjs (fixtures for this checker). Add a path
// to LEFTOVER_IGNORED_FILES only for genuine historical mentions.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const EXPECTED_NAME = 'Sandeep Baskaran';
export const EXPECTED_EMAIL = '29013187+SandeepBaskaran@users.noreply.github.com';
export const CLI_PACKAGE = '@designmode-app/cli';

export const VERSION_JSON_FILES = [
  'package.json',
  'packages/cli/package.json',
  'packages/extension/package.json',
  'packages/mcp-cloud/package.json',
  'packages/mcp-local/package.json',
  'packages/shared/package.json',
  'website/package.json',
  'packages/extension/public/manifest.json',
];

export const LOCKFILE_WORKSPACE_KEYS = [
  '',
  'packages/cli',
  'packages/extension',
  'packages/mcp-cloud',
  'packages/mcp-local',
  'packages/shared',
  'website',
];

export const VERSION_TEXT_FILES = [
  'packages/shared/src/constants.ts',
  'packages/cli/src/remote.ts',
  'packages/mcp-local/src/agent-cli.ts',
  'packages/mcp-local/src/bin/cli.ts',
  'packages/mcp-local/src/mcp-server.ts',
  'packages/mcp-local/src/owner-bridge.ts',
  'packages/mcp-local/src/websocket-server.ts',
  'packages/mcp-cloud/api/mcp.ts',
  'packages/mcp-cloud/api/extension/stream.ts',
  'website/src/components/site/json-ld.tsx',
  'website/public/llms.txt',
  'website/public/llms-full.txt',
];

export const LEFTOVER_PATHSPEC_EXCLUDES = [
  ':!CHANGELOG.md',
  ':!package-lock.json',
  ':!website/src/content/changelog.ts',
];

export const LEFTOVER_IGNORED_FILES = new Set([
  'packages/extension/src/content/cloud-readiness.test.ts',
  'scripts/release-preflight.test.mjs',
]);

const NETWORK_TIMEOUT_MS = 30_000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export function parseArgs(argv) {
  const args = { post: false, tarball: null, help: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--post' || arg === '--postcheck') {
      args.post = true;
    } else if (arg === '--tarball') {
      const value = rest[++i];
      if (!value || value.startsWith('--')) {
        throw new Error('`--tarball` requires a path');
      }
      args.tarball = value;
    } else if (arg.startsWith('--tarball=')) {
      args.tarball = arg.slice('--tarball='.length);
      if (!args.tarball) throw new Error('`--tarball` requires a path');
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.tarball && !args.post) {
    throw new Error('`--tarball` is only valid with `--post`');
  }
  return args;
}

export function parseSemver(value) {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    version: `${match[1]}.${match[2]}.${match[3]}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

export function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
  }
  return 0;
}

export function previousReleaseVersion(tags, targetVersion) {
  const target = parseSemver(targetVersion);
  if (!target) throw new Error(`Invalid target version: ${targetVersion}`);
  const older = tags
    .map(parseSemver)
    .filter((tag) => tag && compareSemver(tag, target) < 0);
  if (older.length === 0) return null;
  older.sort(compareSemver);
  return older[older.length - 1].version;
}

export function versionTokenPattern(version) {
  const escaped = version.replace(/\./g, '\\.');
  return `(^|[^0-9])${escaped}([^0-9]|$)`;
}

export function versionTokenRegex(version) {
  return new RegExp(versionTokenPattern(version));
}

export function findVersionHits(text, version) {
  const token = versionTokenRegex(version);
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (token.test(lines[i])) hits.push({ line: i + 1, text: lines[i] });
  }
  return hits;
}

export function changelogHasSection(markdown, version) {
  const pattern = new RegExp(
    `^## \\[${version.replace(/\./g, '\\.')}\\] — \\d{4}-\\d{2}-\\d{2}$`,
    'm',
  );
  return pattern.test(markdown);
}

export function websiteChangelogNewestVersion(source) {
  const match = source.match(/version:\s*"(\d+\.\d+\.\d+)"/);
  return match ? match[1] : null;
}

export function sha1File(filePath) {
  const hash = createHash('sha1');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

export function parseGitGrep(output) {
  const hits = [];
  for (const raw of output.split('\n')) {
    if (!raw) continue;
    const match = raw.match(/^(.*?):(\d+):(.*)$/);
    if (!match) continue;
    hits.push({ file: match[1], line: Number(match[2]), text: match[3] });
  }
  return hits;
}

function colorize(enabled, color, text) {
  return enabled ? `${color}${text}${RESET}` : text;
}

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

function npm(args, opts = {}) {
  return execFileSync('npm', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: NETWORK_TIMEOUT_MS,
    ...opts,
  }).trim();
}

function commandExists(name) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'));
}

function localTags() {
  const out = git(['tag', '-l', 'v*']);
  return out.split('\n').map((line) => line.trim()).filter(Boolean);
}

function originHasTag(version) {
  const out = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/v${version}`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: NETWORK_TIMEOUT_MS,
  });
  return out.trim().length > 0;
}

function localHasTag(version) {
  try {
    git(['rev-parse', '-q', '--verify', `refs/tags/v${version}`]);
    return true;
  } catch {
    return false;
  }
}

function checkIdentity(results) {
  const name = git(['config', '--get', 'user.name']).trim();
  const email = git(['config', '--get', 'user.email']).trim();
  const problems = [];
  if (name !== EXPECTED_NAME) {
    problems.push(`user.name is ${name || '(unset)'}, expected ${EXPECTED_NAME}`);
  }
  if (email !== EXPECTED_EMAIL) {
    problems.push(`user.email is ${email || '(unset)'}, expected ${EXPECTED_EMAIL}`);
  }

  let range = 'origin/main..HEAD';
  try {
    git(['rev-parse', '--verify', 'origin/main']);
  } catch {
    results.push({
      status: 'FAIL',
      check: 'Git identity',
      detail: 'origin/main is missing; cannot inspect unpushed commits',
    });
    return;
  }

  const log = git(['log', '--format=%H%x09%ae%x09%ce', range]).trim();
  const commits = log ? log.split('\n') : [];
  const bad = [];
  for (const line of commits) {
    const [hash, authorEmail, committerEmail] = line.split('\t');
    if (authorEmail !== EXPECTED_EMAIL || committerEmail !== EXPECTED_EMAIL) {
      bad.push(`${hash.slice(0, 8)} author=${authorEmail} committer=${committerEmail}`);
    }
  }
  if (bad.length) {
    problems.push(
      `${bad.length} commit(s) in ${range} do not use ${EXPECTED_EMAIL}:\n${bad.join('\n')}`,
    );
  }

  if (problems.length) {
    results.push({ status: 'FAIL', check: 'Git identity', detail: problems.join('\n') });
    return;
  }

  const commitNote = commits.length === 0
    ? `no commits in ${range}`
    : `${commits.length} commit${commits.length === 1 ? '' : 's'} in ${range} use${commits.length === 1 ? 's' : ''} that author and committer email`;
  results.push({
    status: 'PASS',
    check: 'Git identity',
    detail: `user.name=${name}, user.email=${email}; ${commitNote}`,
  });
}

function checkVersions(results, version) {
  const problems = [];

  for (const rel of VERSION_JSON_FILES) {
    const full = join(root, rel);
    if (!existsSync(full)) {
      problems.push(`${rel}: missing`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (err) {
      problems.push(`${rel}: invalid JSON (${err.message})`);
      continue;
    }
    if (parsed.version !== version) {
      problems.push(`${rel}: version is ${parsed.version ?? '(missing)'}, expected ${version}`);
    }
  }

  const lockPath = join(root, 'package-lock.json');
  if (!existsSync(lockPath)) {
    problems.push('package-lock.json: missing');
  } else {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (lock.version !== version) {
      problems.push(`package-lock.json: top-level version is ${lock.version}, expected ${version}`);
    }
    for (const key of LOCKFILE_WORKSPACE_KEYS) {
      const entry = lock.packages?.[key];
      const label = key === '' ? 'package-lock.json packages[""]' : `package-lock.json packages["${key}"]`;
      if (!entry) {
        problems.push(`${label}: missing`);
      } else if (entry.version !== version) {
        problems.push(`${label}: version is ${entry.version}, expected ${version}`);
      }
    }
  }

  const token = versionTokenRegex(version);
  for (const rel of VERSION_TEXT_FILES) {
    const full = join(root, rel);
    if (!existsSync(full)) {
      problems.push(`${rel}: missing`);
      continue;
    }
    const text = readFileSync(full, 'utf8');
    if (!token.test(text)) {
      problems.push(`${rel}: does not contain ${version}`);
    }
  }

  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  if (!changelogHasSection(changelog, version)) {
    problems.push(`CHANGELOG.md: missing "## [${version}] — YYYY-MM-DD" section`);
  }

  const siteChangelogPath = join(root, 'website/src/content/changelog.ts');
  if (!existsSync(siteChangelogPath)) {
    problems.push('website/src/content/changelog.ts: missing');
  } else {
    const newest = websiteChangelogNewestVersion(readFileSync(siteChangelogPath, 'utf8'));
    if (newest !== version) {
      problems.push(
        `website/src/content/changelog.ts: newest version is ${newest ?? '(none)'}, expected ${version}`,
      );
    }
  }

  if (problems.length) {
    results.push({
      status: 'FAIL',
      check: 'Version consistency',
      detail: `${problems.length} location(s) do not carry ${version}:\n${problems.join('\n')}`,
    });
  } else {
    const count = VERSION_JSON_FILES.length + LOCKFILE_WORKSPACE_KEYS.length + VERSION_TEXT_FILES.length + 2;
    results.push({
      status: 'PASS',
      check: 'Version consistency',
      detail: `${count} required locations carry ${version}`,
    });
  }
}

function checkLeftovers(results, previous) {
  if (!previous) {
    results.push({
      status: 'PASS',
      check: 'Previous-version leftovers',
      detail: 'no previous v* tag to scan for',
    });
    return;
  }

  let output = '';
  try {
    output = git([
      'grep',
      '-n',
      '-I',
      '-E',
      versionTokenPattern(previous),
      '--',
      '.',
      ...LEFTOVER_PATHSPEC_EXCLUDES,
    ]);
  } catch (err) {
    if (err.status === 1) {
      output = '';
    } else {
      results.push({
        status: 'FAIL',
        check: 'Previous-version leftovers',
        detail: err.stderr?.trim() || err.message,
      });
      return;
    }
  }

  const hits = parseGitGrep(output).filter((hit) => !LEFTOVER_IGNORED_FILES.has(hit.file));
  if (hits.length) {
    const listed = hits
      .map((hit) => `${hit.file}:${hit.line}: ${hit.text.trim()}`)
      .join('\n');
    results.push({
      status: 'FAIL',
      check: 'Previous-version leftovers',
      detail: `${hits.length} leftover ${previous} hit(s):\n${listed}`,
    });
    return;
  }

  results.push({
    status: 'PASS',
    check: 'Previous-version leftovers',
    detail: `no leftover ${previous} in tracked files (ignored: CHANGELOG.md, package-lock.json, website changelog history, cloud-readiness and preflight test fixtures)`,
  });
}

function checkTagAvailable(results, version) {
  let origin = false;
  let originError = null;
  try {
    origin = originHasTag(version);
  } catch (err) {
    originError = err.stderr?.trim() || err.message;
  }
  const local = localHasTag(version);
  if (originError) {
    results.push({
      status: 'FAIL',
      check: `Tag v${version} not already used`,
      detail: `could not query origin: ${originError}${local ? `; v${version} already exists locally` : ''}`,
    });
    return;
  }
  if (local || origin) {
    const where = [local ? 'locally' : null, origin ? 'on origin' : null].filter(Boolean).join(' and ');
    results.push({
      status: 'FAIL',
      check: `Tag v${version} not already used`,
      detail: `v${version} already exists ${where}`,
    });
    return;
  }
  results.push({
    status: 'PASS',
    check: `Tag v${version} not already used`,
    detail: `v${version} is absent locally and on origin`,
  });
}

function checkNpmPreflight(results, previous) {
  try {
    const who = npm(['whoami']);
    results.push({ status: 'PASS', check: 'npm login', detail: `npm whoami → ${who}` });
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message).toString().trim();
    results.push({
      status: 'WARN',
      check: 'npm login',
      detail: `npm whoami failed (${detail || 'not signed in'}). Sign in with: npm login --auth-type=web`,
    });
  }

  try {
    const latest = npm(['view', CLI_PACKAGE, 'version']);
    if (previous && latest !== previous) {
      results.push({
        status: 'WARN',
        check: 'npm latest',
        detail: `registry latest for ${CLI_PACKAGE} is ${latest}, expected previous release ${previous}`,
      });
    } else if (!previous) {
      results.push({
        status: 'PASS',
        check: 'npm latest',
        detail: `registry latest for ${CLI_PACKAGE} is ${latest} (no previous tag to compare)`,
      });
    } else {
      results.push({
        status: 'PASS',
        check: 'npm latest',
        detail: `registry latest for ${CLI_PACKAGE} is ${latest}, matching previous release ${previous}`,
      });
    }
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message).toString().trim();
    results.push({
      status: 'WARN',
      check: 'npm latest',
      detail: `could not read ${CLI_PACKAGE} from the registry: ${detail}`,
    });
  }
}

function checkWorkingTree(results) {
  const dirty = git(['status', '--porcelain']);
  if (dirty.trim()) {
    const lines = dirty.trim().split('\n');
    results.push({
      status: 'WARN',
      check: 'Working tree',
      detail: `${lines.length} uncommitted change(s):\n${lines.join('\n')}`,
    });
    return;
  }
  results.push({ status: 'PASS', check: 'Working tree', detail: 'clean' });
}

function checkOriginTagPresent(results, version) {
  try {
    if (originHasTag(version)) {
      results.push({
        status: 'PASS',
        check: `Origin tag v${version}`,
        detail: `refs/tags/v${version} exists on origin`,
      });
    } else {
      results.push({
        status: 'FAIL',
        check: `Origin tag v${version}`,
        detail: `refs/tags/v${version} is not on origin`,
      });
    }
  } catch (err) {
    results.push({
      status: 'FAIL',
      check: `Origin tag v${version}`,
      detail: err.stderr?.trim() || err.message,
    });
  }
}

function checkGithubRelease(results, version) {
  if (!commandExists('gh')) {
    results.push({
      status: 'WARN',
      check: 'GitHub release',
      detail: `gh is not available; skipped \`gh release view v${version}\``,
    });
    return;
  }
  try {
    const out = execFileSync('gh', ['release', 'view', `v${version}`, '--json', 'tagName,url'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: NETWORK_TIMEOUT_MS,
    });
    const parsed = JSON.parse(out);
    results.push({
      status: 'PASS',
      check: 'GitHub release',
      detail: parsed.url || `v${version} exists`,
    });
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message).toString().trim();
    results.push({
      status: 'FAIL',
      check: 'GitHub release',
      detail: detail || `gh release view v${version} failed`,
    });
  }
}

function checkNpmPost(results, version, tarball) {
  try {
    const latest = npm(['view', CLI_PACKAGE, 'dist-tags.latest']);
    if (latest === version) {
      results.push({
        status: 'PASS',
        check: 'npm dist-tags.latest',
        detail: `${CLI_PACKAGE}@${latest}`,
      });
    } else {
      results.push({
        status: 'FAIL',
        check: 'npm dist-tags.latest',
        detail: `registry latest is ${latest}, expected ${version}`,
      });
    }
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message).toString().trim();
    results.push({
      status: 'FAIL',
      check: 'npm dist-tags.latest',
      detail: detail || `could not read ${CLI_PACKAGE} dist-tags.latest`,
    });
  }

  if (!tarball) return;

  const tarballPath = isAbsolute(tarball) ? tarball : resolve(process.cwd(), tarball);
  if (!existsSync(tarballPath) || !statSync(tarballPath).isFile()) {
    results.push({
      status: 'FAIL',
      check: 'npm tarball shasum',
      detail: `tarball not found: ${tarballPath}`,
    });
    return;
  }

  let registrySha;
  try {
    registrySha = npm(['view', `${CLI_PACKAGE}@${version}`, 'dist.shasum']).toLowerCase();
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message).toString().trim();
    results.push({
      status: 'FAIL',
      check: 'npm tarball shasum',
      detail: detail || `could not read ${CLI_PACKAGE}@${version} dist.shasum`,
    });
    return;
  }

  const localSha = sha1File(tarballPath).toLowerCase();
  if (localSha === registrySha) {
    results.push({
      status: 'PASS',
      check: 'npm tarball shasum',
      detail: `${registrySha} matches ${tarballPath}`,
    });
  } else {
    results.push({
      status: 'FAIL',
      check: 'npm tarball shasum',
      detail: `registry ${registrySha} != local ${localSha} (${tarballPath})`,
    });
  }
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/release-preflight.mjs
  node scripts/release-preflight.mjs --post [--tarball <path>]

  npm run release:preflight
  npm run release:postcheck -- --tarball <path>
`);
}

function printReport(title, results, color) {
  const width = Math.max(...results.map((row) => row.check.length), 10);
  process.stdout.write(`\n${colorize(color, BOLD, title)}\n\n`);
  for (const row of results) {
    const statusColor = row.status === 'PASS' ? GREEN : row.status === 'FAIL' ? RED : YELLOW;
    const label = colorize(color, statusColor + BOLD, row.status.padEnd(4));
    const check = row.check.padEnd(width);
    process.stdout.write(`${label}  ${check}  ${row.detail.split('\n')[0]}\n`);
    const extra = row.detail.split('\n').slice(1);
    const indent = ' '.repeat(6 + width + 2);
    for (const line of extra) process.stdout.write(`${indent}${line.trimStart()}\n`);
  }

  const failed = results.filter((row) => row.status === 'FAIL').length;
  const warned = results.filter((row) => row.status === 'WARN').length;
  process.stdout.write('\n');
  if (failed) {
    process.stdout.write(
      colorize(color, RED + BOLD, `Result: ${failed} failed, ${warned} warning(s). Do not release until every FAIL is fixed.\n\n`),
    );
    return 1;
  }
  if (warned) {
    process.stdout.write(colorize(color, YELLOW + BOLD, `Result: all checks passed, ${warned} warning(s).\n\n`));
    return 0;
  }
  process.stdout.write(colorize(color, GREEN + BOLD, `Result: all ${results.length} checks passed.\n\n`));
  return 0;
}

export function run(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }

  const pkg = readJson('package.json');
  const version = pkg.version;
  if (!parseSemver(version)) {
    throw new Error(`Invalid version in package.json: ${version}`);
  }
  const previous = previousReleaseVersion(localTags(), version);
  const color = Boolean(process.stdout.isTTY);
  const results = [];

  if (args.post) {
    checkOriginTagPresent(results, version);
    checkGithubRelease(results, version);
    checkNpmPost(results, version, args.tarball);
    return printReport(`Design Mode release postcheck — ${version}`, results, color);
  }

  checkIdentity(results);
  checkVersions(results, version);
  checkLeftovers(results, previous);
  checkTagAvailable(results, version);
  checkNpmPreflight(results, previous);
  checkWorkingTree(results);
  return printReport(
    `Design Mode release preflight — ${version}${previous ? ` (previous ${previous})` : ''}`,
    results,
    color,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = run(process.argv);
  } catch (err) {
    process.stderr.write(`${err.message || err}\n`);
    process.exitCode = 1;
  }
}
