#!/usr/bin/env node
// Fast release preflight (before `npm run verify`) and post-release check
// (after the release workflow's npm and store jobs, or a manual fallback publish).
// Postcheck confirms the origin tag, the GitHub Release, the npm registry,
// and that the Chrome and Firefox jobs for this tag submitted the version.
// The registry read is a cache-bypassed packument fetch, retried for a few
// minutes, because `npm view` can keep a stale latest tag. Store judgment
// uses each job's printed result lines; the workflow source echoed into
// the log also contains the word "skipped" and is not a result.
// No extra dependencies.
//
//   npm run release:preflight
//   npm run release:postcheck -- --tarball /path/to/designmode-app-cli-<version>.tgz
//   DM_RELEASE_POSTCHECK_NPM_TIMEOUT_MS=0 npm run release:postcheck
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
export const DEFAULT_NPM_TIMEOUT_MS = 180_000;
export const NPM_TIMEOUT_ENV = 'DM_RELEASE_POSTCHECK_NPM_TIMEOUT_MS';
export const NPM_BACKOFF_BASE_MS = 5_000;
export const NPM_BACKOFF_CAP_MS = 60_000;
export const CHROME_EXTENSION_ID = 'ighgobegfcmjagombgnfhgioflinojih';
export const AMO_ADDON_SLUG = 'design-mode-add-on';
export const CHROME_STORE_JOB = 'Chrome Web Store';
export const FIREFOX_STORE_JOB = 'Firefox Add-ons';

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

function parseNonNegativeInteger(value, flag) {
  if (value == null || value === '' || String(value).startsWith('--') || !/^\d+$/.test(String(value))) {
    throw new Error(`\`${flag}\` requires a non-negative integer number of milliseconds`);
  }
  return Number(value);
}

export function parseArgs(argv) {
  const args = { post: false, tarball: null, help: false, npmTimeoutMs: null };
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
    } else if (arg === '--npm-timeout-ms') {
      args.npmTimeoutMs = parseNonNegativeInteger(rest[++i], '--npm-timeout-ms');
    } else if (arg.startsWith('--npm-timeout-ms=')) {
      args.npmTimeoutMs = parseNonNegativeInteger(arg.slice('--npm-timeout-ms='.length), '--npm-timeout-ms');
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.tarball && !args.post) {
    throw new Error('`--tarball` is only valid with `--post`');
  }
  if (args.npmTimeoutMs != null && !args.post) {
    throw new Error('`--npm-timeout-ms` is only valid with `--post`');
  }
  return args;
}

export function resolveNpmTimeoutMs(args, env = process.env) {
  if (args.npmTimeoutMs != null) return args.npmTimeoutMs;
  const raw = env[NPM_TIMEOUT_ENV];
  if (raw == null || raw === '') return DEFAULT_NPM_TIMEOUT_MS;
  return parseNonNegativeInteger(raw, NPM_TIMEOUT_ENV);
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
      detail: `npm whoami failed (${detail || 'not signed in'}). Local login is only needed for the manual npm publish fallback: npm login --auth-type=web`,
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

export function npmPackumentUrl(cacheBust) {
  const name = CLI_PACKAGE.replace('/', '%2f');
  return `https://registry.npmjs.org/${name}?cachebust=${cacheBust}`;
}

export function npmRetryDelayMs(failedAttempts, remainingMs) {
  if (remainingMs <= 0 || failedAttempts < 1) return 0;
  const exp = Math.min(NPM_BACKOFF_BASE_MS * 2 ** (failedAttempts - 1), NPM_BACKOFF_CAP_MS);
  return Math.min(exp, remainingMs);
}

export async function fetchNpmPackument(fetchImpl, cacheBust) {
  const response = await fetchImpl(npmPackumentUrl(cacheBust), {
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`registry HTTP ${response.status} for ${CLI_PACKAGE}`);
  }
  const body = await response.json();
  const latest = body?.['dist-tags']?.latest;
  if (typeof latest !== 'string' || !latest) {
    throw new Error(`registry packument for ${CLI_PACKAGE} has no dist-tags.latest`);
  }
  return body;
}

export function packumentShasum(packument, version) {
  const sha = packument?.versions?.[version]?.dist?.shasum;
  return typeof sha === 'string' && sha ? sha.toLowerCase() : null;
}

function formatWait(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

export async function pollNpmPackument({ version, timeoutMs, fetchImpl, sleep, now = Date.now }) {
  const start = now();
  const deadline = start + timeoutMs;
  let attempts = 0;
  let latest = null;
  let packument = null;
  let lastError = null;
  while (true) {
    attempts += 1;
    try {
      packument = await fetchNpmPackument(fetchImpl, now());
      latest = packument['dist-tags'].latest;
      lastError = null;
      if (latest === version) {
        return { ok: true, attempts, latest, packument, lastError: null, waitedMs: now() - start };
      }
    } catch (err) {
      packument = null;
      lastError = err;
    }
    const delay = npmRetryDelayMs(attempts, deadline - now());
    if (delay <= 0) {
      return { ok: false, attempts, latest, packument, lastError, waitedMs: now() - start };
    }
    await sleep(delay);
  }
}

const ANSI_RE = /\u001b\[[0-9;]*m/g;
const LOG_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/;
const CHROME_SUBMITTED_RE = /^Submitted (\S+) crxVersion=(\S+) to the Chrome Web Store for review \(HTTP (\d+)\)\.$/;
const CHROME_SKIPPED_RE = /^Chrome Web Store publish skipped:/;
const FIREFOX_ACCEPTED_RE = /^(?:Waiting for approval and download of signed XPI skipped\.|Signed xpi downloaded:)/;
const FIREFOX_SKIPPED_RE = /^Firefox AMO publish skipped:/;

export function workflowStepOutputs(logText) {
  const steps = new Map();
  for (const raw of String(logText).split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!line) continue;
    const tab1 = line.indexOf('\t');
    const tab2 = tab1 === -1 ? -1 : line.indexOf('\t', tab1 + 1);
    if (tab2 === -1) continue;
    const job = line.slice(0, tab1);
    const step = line.slice(tab1 + 1, tab2);
    const message = line.slice(tab2 + 1).replace(/^\uFEFF/, '').replace(LOG_TS_RE, '').replace(ANSI_RE, '').trim();
    if (!message) continue;
    let entry = steps.get(`${job}\0${step}`);
    if (!entry) {
      entry = { job, step, inScript: false, resultLines: [] };
      steps.set(`${job}\0${step}`, entry);
    }
    if (message.startsWith('##[group]Run')) {
      entry.inScript = true;
      continue;
    }
    if (message.startsWith('##[endgroup]')) {
      entry.inScript = false;
      continue;
    }
    if (entry.inScript) continue;
    entry.resultLines.push(message);
  }
  return [...steps.values()];
}

export function resultLinesForJob(steps, jobName) {
  return steps.filter((step) => step.job === jobName).flatMap((step) => step.resultLines);
}

export function judgeStoreJob({ jobName, status, conclusion, resultLines, version }) {
  if (!status) {
    return { status: 'FAIL', detail: `${jobName} job was not in the release run` };
  }
  if (status !== 'completed') {
    return { status: 'FAIL', detail: `${jobName} job status is ${status}` };
  }
  if (conclusion !== 'success') {
    return { status: 'FAIL', detail: `${jobName} job conclusion is ${conclusion || 'unset'}` };
  }
  if (jobName === CHROME_STORE_JOB) {
    const submitted = resultLines.map((line) => line.match(CHROME_SUBMITTED_RE)).find(Boolean);
    if (submitted) {
      const [, id, crxVersion, http] = submitted;
      if (crxVersion !== version) {
        return {
          status: 'FAIL',
          detail: `submitted crxVersion=${crxVersion}, expected ${version} (${id}, HTTP ${http})`,
        };
      }
      return { status: 'PASS', detail: `Submitted ${id} crxVersion=${crxVersion} (HTTP ${http})` };
    }
    const skipped = resultLines.find((line) => CHROME_SKIPPED_RE.test(line));
    if (skipped) return { status: 'FAIL', detail: `job succeeded without submitting: ${skipped}` };
    return {
      status: 'FAIL',
      detail: 'job succeeded but its result lines did not include the Chrome Web Store submit line',
    };
  }
  const accepted = resultLines.find((line) => FIREFOX_ACCEPTED_RE.test(line));
  if (accepted) return { status: 'PASS', detail: accepted };
  const skipped = resultLines.find((line) => FIREFOX_SKIPPED_RE.test(line));
  if (skipped) return { status: 'FAIL', detail: `job succeeded without submitting: ${skipped}` };
  return {
    status: 'FAIL',
    detail: 'job succeeded but its result lines did not include the AMO upload acceptance line',
  };
}

export function storeCheckName(jobName) {
  return jobName === CHROME_STORE_JOB ? 'Chrome Web Store submission' : 'Firefox AMO submission';
}

export function storeRowsFromRun({ jobs, log, version, runUrl }) {
  const steps = workflowStepOutputs(log);
  return [CHROME_STORE_JOB, FIREFOX_STORE_JOB].map((jobName) => {
    const job = (jobs ?? []).find((item) => item.name === jobName);
    const judged = judgeStoreJob({
      jobName,
      status: job?.status ?? null,
      conclusion: job?.conclusion ?? null,
      resultLines: resultLinesForJob(steps, jobName),
      version,
    });
    return {
      status: judged.status,
      check: storeCheckName(jobName),
      detail: `${judged.detail} (${runUrl})`,
    };
  });
}

export function githubRepoFromRemote(url) {
  const cleaned = String(url).replace(/\.git\s*$/, '').trim();
  const match = cleaned.match(/github\.com[:/]([^/\s]+)\/([^/\s]+)$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

export function selectReleaseRun(runs, version) {
  const tag = `v${version}`;
  return (runs ?? [])
    .filter((run) => run.headBranch === tag && run.event === 'push')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
}

export function chromeUpdateUrl() {
  const x = `id=${CHROME_EXTENSION_ID}&uc`;
  return `https://update.googleapis.com/service/update2/crx?response=updatecheck&acceptformat=crx3&prodversion=131.0&x=${encodeURIComponent(x)}`;
}

export function amoVersionsUrl() {
  return `https://addons.mozilla.org/api/v5/addons/addon/${AMO_ADDON_SLUG}/versions/?page_size=50`;
}

export function chromeVersionFromUpdateXml(xml) {
  const match = String(xml).match(/\bversion="(\d+\.\d+\.\d+)"/);
  return match ? match[1] : null;
}

export function amoVersionStatus(payload, version) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const hit = results.find((row) => row.version === version);
  if (!hit) return payload?.next ? undefined : null;
  return hit.file?.status ?? 'listed';
}

function attemptNote(polled) {
  const base = `attempt ${polled.attempts}`;
  return polled.attempts === 1 ? base : `${base} over ${formatWait(polled.waitedMs)}`;
}

async function checkNpmPost(results, version, tarball, io) {
  const polled = await pollNpmPackument({
    version,
    timeoutMs: io.timeoutMs,
    fetchImpl: io.fetch,
    sleep: io.sleep,
    now: io.now,
  });
  const note = attemptNote(polled);
  if (polled.ok) {
    results.push({
      status: 'PASS',
      check: 'npm dist-tags.latest',
      detail: `${CLI_PACKAGE}@${polled.latest} (${note})`,
    });
  } else if (polled.latest) {
    const extra = polled.lastError ? `; last registry error: ${polled.lastError.message}` : '';
    results.push({
      status: 'FAIL',
      check: 'npm dist-tags.latest',
      detail: `registry latest is ${polled.latest}, expected ${version} after ${note}${extra}`,
    });
  } else {
    results.push({
      status: 'FAIL',
      check: 'npm dist-tags.latest',
      detail: `could not read ${CLI_PACKAGE} dist-tags.latest after ${note}: ${polled.lastError?.message || 'unknown error'}`,
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

  const registrySha = polled.packument ? packumentShasum(polled.packument, version) : null;
  if (!registrySha) {
    results.push({
      status: 'FAIL',
      check: 'npm tarball shasum',
      detail: `${CLI_PACKAGE}@${version} dist.shasum was not in the packument after ${note}`,
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

function warnStoreQueries(results, detail) {
  for (const jobName of [CHROME_STORE_JOB, FIREFOX_STORE_JOB]) {
    results.push({ status: 'WARN', check: storeCheckName(jobName), detail });
  }
}

function failStoreQueries(results, detail) {
  for (const jobName of [CHROME_STORE_JOB, FIREFOX_STORE_JOB]) {
    results.push({ status: 'FAIL', check: storeCheckName(jobName), detail });
  }
}

function ghInvocationError(err) {
  return `${err.stderr || ''}\n${err.stdout || ''}\n${err.message || ''}`;
}

function isGhAuthError(err) {
  return /not logged|authentication|gh auth login|HTTP 40[13]|unauthorized/i.test(ghInvocationError(err));
}

function ghErrorLine(err) {
  return ghInvocationError(err).trim().split('\n').find(Boolean) || 'gh failed';
}

function runGh(execFile, args) {
  return execFile('gh', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function checkPublicListings(results, version, fetchImpl) {
  try {
    const response = await fetchImpl(chromeUpdateUrl(), {
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const live = chromeVersionFromUpdateXml(await response.text());
    if (!live) throw new Error('response had no version attribute');
    if (live === version) {
      results.push({ status: 'PASS', check: 'Chrome public listing', detail: `updatecheck version ${live}` });
    } else {
      results.push({
        status: 'WARN',
        check: 'Chrome public listing',
        detail: `updatecheck still serves ${live}; ${version} can be in review. This does not decide the submission check.`,
      });
    }
  } catch (err) {
    results.push({
      status: 'WARN',
      check: 'Chrome public listing',
      detail: `could not read the public update check: ${err.message}`,
    });
  }

  try {
    const response = await fetchImpl(amoVersionsUrl(), {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const listing = amoVersionStatus(await response.json(), version);
    if (listing === undefined) {
      results.push({
        status: 'WARN',
        check: 'Firefox public listing',
        detail: `AMO public versions API did not include ${version} on the first page.`,
      });
    } else if (listing == null) {
      results.push({
        status: 'WARN',
        check: 'Firefox public listing',
        detail: `AMO public versions API does not list ${version} yet. Review can still be pending.`,
      });
    } else if (listing === 'public') {
      results.push({
        status: 'PASS',
        check: 'Firefox public listing',
        detail: `${version} is public on addons.mozilla.org`,
      });
    } else {
      results.push({
        status: 'WARN',
        check: 'Firefox public listing',
        detail: `${version} is ${listing} on the public versions API, not public yet.`,
      });
    }
  } catch (err) {
    results.push({
      status: 'WARN',
      check: 'Firefox public listing',
      detail: `could not read the AMO public versions API: ${err.message}`,
    });
  }
}

async function checkStoreSubmissions(results, version, io) {
  const exists = io.commandExists;
  const execFile = io.execFile;
  if (!exists('gh')) {
    warnStoreQueries(results, 'gh is not installed; store submission logs were not read');
    await checkPublicListings(results, version, io.fetch);
    return;
  }

  try {
    execFile('gh', ['auth', 'status'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: NETWORK_TIMEOUT_MS,
    });
  } catch (err) {
    warnStoreQueries(
      results,
      `gh is not authenticated (${ghErrorLine(err)}); store submission logs were not read`,
    );
    await checkPublicListings(results, version, io.fetch);
    return;
  }

  const repo = io.repo ?? githubRepoFromRemote(git(['remote', 'get-url', 'origin']));
  if (!repo) {
    failStoreQueries(results, 'origin is not a github.com owner/repo remote');
    await checkPublicListings(results, version, io.fetch);
    return;
  }

  try {
    const listed = JSON.parse(runGh(execFile, [
      'run', 'list',
      '--repo', repo,
      '--workflow', 'release.yml',
      '--limit', '30',
      '--json', 'databaseId,headBranch,event,conclusion,status,url,createdAt',
    ]));
    const run = selectReleaseRun(listed, version);
    if (!run) {
      failStoreQueries(results, `no release.yml push run for v${version} on ${repo}`);
    } else {
      const viewed = JSON.parse(runGh(execFile, [
        'run', 'view', String(run.databaseId),
        '--repo', repo,
        '--json', 'jobs,url',
      ]));
      const log = runGh(execFile, [
        'run', 'view', String(run.databaseId),
        '--repo', repo,
        '--log',
      ]);
      const runUrl = viewed.url || run.url;
      results.push(...storeRowsFromRun({
        jobs: viewed.jobs,
        log,
        version,
        runUrl,
      }));
    }
  } catch (err) {
    if (isGhAuthError(err)) {
      warnStoreQueries(results, `gh is not authenticated (${ghErrorLine(err)})`);
    } else {
      failStoreQueries(results, ghErrorLine(err));
    }
  }

  await checkPublicListings(results, version, io.fetch);
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/release-preflight.mjs
  node scripts/release-preflight.mjs --post [--tarball <path>] [--npm-timeout-ms <ms>]

  npm run release:preflight
  npm run release:postcheck -- --tarball <path>

  ${NPM_TIMEOUT_ENV} sets the npm retry budget in milliseconds when
  --npm-timeout-ms is omitted (default ${DEFAULT_NPM_TIMEOUT_MS}).
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

export async function run(argv = process.argv, io = {}) {
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
    const fetchImpl = io.fetch ?? ((...fetchArgs) => globalThis.fetch(...fetchArgs));
    const sleep = io.sleep ?? ((ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)));
    const now = io.now ?? Date.now;
    checkOriginTagPresent(results, version);
    checkGithubRelease(results, version);
    await checkNpmPost(results, version, args.tarball, {
      fetch: fetchImpl,
      sleep,
      now,
      timeoutMs: resolveNpmTimeoutMs(args, io.env ?? process.env),
    });
    await checkStoreSubmissions(results, version, {
      fetch: fetchImpl,
      execFile: io.execFile ?? execFileSync,
      commandExists: io.commandExists ?? commandExists,
      repo: io.repo,
    });
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
    process.exitCode = await run(process.argv);
  } catch (err) {
    process.stderr.write(`${err.message || err}\n`);
    process.exitCode = 1;
  }
}
