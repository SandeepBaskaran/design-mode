import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  amoVersionStatus,
  changelogHasSection,
  chromeVersionFromUpdateXml,
  compareSemver,
  DEFAULT_NPM_TIMEOUT_MS,
  findVersionHits,
  githubRepoFromRemote,
  judgeStoreJob,
  npmPackumentUrl,
  npmRetryDelayMs,
  NPM_TIMEOUT_ENV,
  packumentShasum,
  parseArgs,
  parseGitGrep,
  parseSemver,
  pollNpmPackument,
  previousReleaseVersion,
  resolveNpmTimeoutMs,
  resultLinesForJob,
  selectReleaseRun,
  sha1File,
  storeRowsFromRun,
  versionTokenRegex,
  websiteChangelogNewestVersion,
  workflowStepOutputs,
  CHROME_STORE_JOB,
  FIREFOX_STORE_JOB,
  LEFTOVER_IGNORED_FILES,
} from './release-preflight.mjs';

test('previousReleaseVersion picks the newest tag strictly older than the target', () => {
  assert.equal(previousReleaseVersion(['v3.2.0', 'v3.1.0', 'v3.0.2', 'v2.3.1'], '3.2.0'), '3.1.0');
  assert.equal(previousReleaseVersion(['v3.1.0', 'v3.0.2'], '3.2.0'), '3.1.0');
  assert.equal(previousReleaseVersion(['v3.2.0'], '3.2.0'), null);
  assert.equal(previousReleaseVersion(['v3.2.0-rc.1', 'not-a-tag', 'v3.1.0'], '3.2.0'), '3.1.0');
});

test('parseSemver and compareSemver do not roll over at 9', () => {
  assert.deepEqual(parseSemver('v1.10.0').parts, [1, 10, 0]);
  assert.ok(compareSemver(parseSemver('1.10.0'), parseSemver('1.9.0')) > 0);
  assert.equal(parseSemver('3.2.0-rc.1'), null);
});

test('version token ignores superstrings and finds genuine leftovers', () => {
  const text = [
    'ignore 13.1.0 and 3.1.00 and Keep a Changelog 1.1.0',
    'current: 3.1.0',
    'version="3.1.0"',
  ].join('\n');
  const hits = findVersionHits(text, '3.1.0');
  assert.deepEqual(hits.map((hit) => hit.line), [2, 3]);
  assert.equal(versionTokenRegex('3.1.0').test('13.1.0'), false);
});

test('changelog heading and website newest-entry helpers', () => {
  const md = '# Changelog\n\n## [Unreleased]\n\n## [3.2.0] — 2026-11-07\n\n- item\n';
  assert.equal(changelogHasSection(md, '3.2.0'), true);
  assert.equal(changelogHasSection(md, '3.1.0'), false);
  assert.equal(
    websiteChangelogNewestVersion('export const releases = [\n  {\n    version: "3.2.0",\n'),
    '3.2.0',
  );
});

test('parseGitGrep plus the documented ignore list drops fixture hits', () => {
  const output = [
    'packages/extension/src/content/cloud-readiness.test.ts:61:  c.send(\'event: hello\\ndata: {"version":"3.1.0"}\\n\\n\');',
    'README.md:10: still on 3.1.0',
  ].join('\n');
  const hits = parseGitGrep(output).filter((hit) => !LEFTOVER_IGNORED_FILES.has(hit.file));
  assert.deepEqual(hits, [{ file: 'README.md', line: 10, text: ' still on 3.1.0' }]);
});

test('sha1File matches a known digest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-preflight-'));
  const file = join(dir, 'sample.bin');
  try {
    writeFileSync(file, 'design-mode');
    assert.equal(sha1File(file), 'b62789dd399d5a01ddcd6d9266618792bb90de98');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseArgs accepts postcheck tarball flags and rejects a tarball without --post', () => {
  assert.deepEqual(parseArgs(['node', 'script', '--post', '--tarball', '/tmp/a.tgz']), {
    post: true,
    tarball: '/tmp/a.tgz',
    help: false,
    npmTimeoutMs: null,
  });
  assert.equal(parseArgs(['node', 'script', '--tarball=/tmp/a.tgz', '--post']).tarball, '/tmp/a.tgz');
  assert.equal(parseArgs(['node', 'script', '--post', '--npm-timeout-ms', '0']).npmTimeoutMs, 0);
  assert.equal(parseArgs(['node', 'script', '--post', '--npm-timeout-ms=15000']).npmTimeoutMs, 15000);
  assert.throws(() => parseArgs(['node', 'script', '--tarball', '/tmp/a.tgz']), /only valid with `--post`/);
  assert.throws(() => parseArgs(['node', 'script', '--npm-timeout-ms', '10']), /only valid with `--post`/);
  assert.throws(() => parseArgs(['node', 'script', '--post', '--npm-timeout-ms', '-1']), /non-negative integer/);
  assert.throws(() => parseArgs(['node', 'script', '--nope']), /Unknown argument/);
});

test('npm timeout flag overrides the env var and the default is three minutes', () => {
  assert.equal(DEFAULT_NPM_TIMEOUT_MS, 180_000);
  assert.equal(resolveNpmTimeoutMs({ npmTimeoutMs: null }, {}), 180_000);
  assert.equal(resolveNpmTimeoutMs({ npmTimeoutMs: null }, { [NPM_TIMEOUT_ENV]: '0' }), 0);
  assert.equal(resolveNpmTimeoutMs({ npmTimeoutMs: 2500 }, { [NPM_TIMEOUT_ENV]: '0' }), 2500);
  assert.throws(() => resolveNpmTimeoutMs({ npmTimeoutMs: null }, { [NPM_TIMEOUT_ENV]: '3s' }), /non-negative integer/);
});

test('npm retry delays back off and never sleep past the remaining budget', () => {
  assert.equal(npmRetryDelayMs(1, 180_000), 5_000);
  assert.equal(npmRetryDelayMs(2, 180_000), 10_000);
  assert.equal(npmRetryDelayMs(3, 180_000), 20_000);
  assert.equal(npmRetryDelayMs(4, 180_000), 40_000);
  assert.equal(npmRetryDelayMs(5, 180_000), 60_000);
  assert.equal(npmRetryDelayMs(8, 180_000), 60_000);
  assert.equal(npmRetryDelayMs(2, 3_000), 3_000);
  assert.equal(npmRetryDelayMs(1, 0), 0);
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

test('pollNpmPackument bypasses cache and reports the attempt that saw the new latest', async () => {
  let nowMs = 1_000;
  const sleeps = [];
  const calls = [];
  const result = await pollNpmPackument({
    version: '3.2.1',
    timeoutMs: 180_000,
    now: () => nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowMs += ms;
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const latest = nowMs < 16_000 ? '3.2.0' : '3.2.1';
      return jsonResponse({
        'dist-tags': { latest },
        versions: { '3.2.1': { dist: { shasum: 'ABC' } } },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.latest, '3.2.1');
  assert.deepEqual(sleeps, [5_000, 10_000]);
  assert.equal(packumentShasum(result.packument, '3.2.1'), 'abc');
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /^https:\/\/registry\.npmjs\.org\/@designmode-app%2fcli\?cachebust=/);
  assert.equal(calls[0].options.headers['cache-control'], 'no-cache');
  assert.equal(npmPackumentUrl(1).includes('cachebust=1'), true);
});

test('pollNpmPackument stops at the timeout without sleeping in tests', async () => {
  let nowMs = 0;
  const sleeps = [];
  const result = await pollNpmPackument({
    version: '3.2.1',
    timeoutMs: 12_000,
    now: () => nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowMs += ms;
    },
    fetchImpl: async () => jsonResponse({ 'dist-tags': { latest: '3.2.0' }, versions: {} }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.latest, '3.2.0');
  assert.equal(result.attempts, 3);
  assert.deepEqual(sleeps, [5_000, 7_000]);
  assert.equal(result.waitedMs, 12_000);
});

test('pollNpmPackument makes one attempt when the budget is zero', async () => {
  let fetches = 0;
  const result = await pollNpmPackument({
    version: '3.2.1',
    timeoutMs: 0,
    now: () => 0,
    sleep: async () => {
      throw new Error('sleep should not run');
    },
    fetchImpl: async () => {
      fetches += 1;
      throw new Error('offline');
    },
  });
  assert.equal(fetches, 1);
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.lastError.message, 'offline');
});

const STORE_LOG = [
  'Chrome Web Store\tRequire Chrome Web Store secrets\t\uFEFF2026-11-14T06:27:49.0354698Z ##[group]Run missing=()',
  'Chrome Web Store\tRequire Chrome Web Store secrets\t2026-11-14T06:27:49.0359124Z \u001b[36;1mecho "Chrome Web Store publish skipped: these secrets are not set on the release environment or the repository: ${missing[*]}."\u001b[0m',
  'Chrome Web Store\tRequire Chrome Web Store secrets\t2026-11-14T06:27:49.0387893Z ##[endgroup]',
  'Chrome Web Store\tRequire Chrome Web Store secrets\t2026-11-14T06:27:49.0485270Z Chrome Web Store credentials are configured.',
  'Chrome Web Store\tUpload and submit to the Chrome Web Store\t\uFEFF2026-11-14T06:27:51.1808606Z ##[group]Run node scripts/publish-chrome-web-store.mjs store/design-mode-extension.zip',
  'Chrome Web Store\tUpload and submit to the Chrome Web Store\t2026-11-14T06:27:51.1836945Z ##[endgroup]',
  'Chrome Web Store\tUpload and submit to the Chrome Web Store\t2026-11-14T06:27:56.8349437Z Submitted ighgobegfcmjagombgnfhgioflinojih crxVersion=3.2.1 to the Chrome Web Store for review (HTTP 200).',
  'Firefox Add-ons\tRequire AMO secrets\t\uFEFF2026-11-14T06:27:50.0381685Z ##[group]Run missing=()',
  'Firefox Add-ons\tRequire AMO secrets\t2026-11-14T06:27:50.0385380Z \u001b[36;1mecho "Firefox AMO publish skipped: these secrets are not set on the release environment or the repository: ${missing[*]}."\u001b[0m',
  'Firefox Add-ons\tRequire AMO secrets\t2026-11-14T06:27:50.2641045Z ##[endgroup]',
  'Firefox Add-ons\tRequire AMO secrets\t2026-11-14T06:27:50.2753889Z AMO JWT credentials are configured.',
  'Firefox Add-ons\tSubmit the add-on and source to AMO\t\uFEFF2026-11-14T06:28:10.8287739Z ##[group]Run unzip -q store/design-mode-addon.zip -d amo-source',
  'Firefox Add-ons\tSubmit the add-on and source to AMO\t2026-11-14T06:28:10.8292806Z \u001b[36;1m# for a reviewer to sign the xpi. Waiting for approval skipped\u001b[0m',
  'Firefox Add-ons\tSubmit the add-on and source to AMO\t2026-11-14T06:28:10.8326193Z ##[endgroup]',
  'Firefox Add-ons\tSubmit the add-on and source to AMO\t2026-11-14T06:28:22.7317944Z Waiting for approval and download of signed XPI skipped. When approved the signed XPI file can be downloaded from https://addons.mozilla.org/en-US/developers/addon/design-mode-add-on/versions/6707227',
].join('\n');

test('workflow result lines ignore script source, including a skipped echo and a BOM', () => {
  const steps = workflowStepOutputs(STORE_LOG);
  assert.deepEqual(resultLinesForJob(steps, CHROME_STORE_JOB), [
    'Chrome Web Store credentials are configured.',
    'Submitted ighgobegfcmjagombgnfhgioflinojih crxVersion=3.2.1 to the Chrome Web Store for review (HTTP 200).',
  ]);
  assert.deepEqual(resultLinesForJob(steps, FIREFOX_STORE_JOB), [
    'AMO JWT credentials are configured.',
    'Waiting for approval and download of signed XPI skipped. When approved the signed XPI file can be downloaded from https://addons.mozilla.org/en-US/developers/addon/design-mode-add-on/versions/6707227',
  ]);
  const joined = resultLinesForJob(steps, FIREFOX_STORE_JOB).join('\n');
  assert.equal(joined.includes('echo "'), false);
  assert.equal(joined.includes('publish skipped'), false);
});

test('store jobs pass on the acceptance lines and fail a real secret skip', () => {
  const jobs = [
    { name: CHROME_STORE_JOB, status: 'completed', conclusion: 'success' },
    { name: FIREFOX_STORE_JOB, status: 'completed', conclusion: 'success' },
  ];
  const rows = storeRowsFromRun({
    jobs,
    log: STORE_LOG,
    version: '3.2.1',
    runUrl: 'https://github.com/SandeepBaskaran/design-mode/actions/runs/43566220644',
  });
  assert.equal(rows[0].status, 'PASS');
  assert.match(rows[0].detail, /crxVersion=3\.2\.1/);
  assert.equal(rows[1].status, 'PASS');
  assert.match(rows[1].detail, /Waiting for approval and download of signed XPI skipped/);
  assert.match(rows[1].detail, /runs\/43566220644/);

  const skipped = judgeStoreJob({
    jobName: FIREFOX_STORE_JOB,
    status: 'completed',
    conclusion: 'success',
    version: '3.2.1',
    resultLines: [
      'Firefox AMO publish skipped: these secrets are not set on the release environment or the repository: AMO_JWT_ISSUER.',
    ],
  });
  assert.equal(skipped.status, 'FAIL');
  assert.match(skipped.detail, /without submitting/);

  const wrongVersion = judgeStoreJob({
    jobName: CHROME_STORE_JOB,
    status: 'completed',
    conclusion: 'success',
    version: '3.2.1',
    resultLines: [
      'Submitted ighgobegfcmjagombgnfhgioflinojih crxVersion=3.2.0 to the Chrome Web Store for review (HTTP 200).',
    ],
  });
  assert.equal(wrongVersion.status, 'FAIL');
  assert.match(wrongVersion.detail, /crxVersion=3\.2\.0, expected 3\.2\.1/);

  const failedJob = judgeStoreJob({
    jobName: CHROME_STORE_JOB,
    status: 'completed',
    conclusion: 'failure',
    version: '3.2.1',
    resultLines: [
      'Submitted ighgobegfcmjagombgnfhgioflinojih crxVersion=3.2.1 to the Chrome Web Store for review (HTTP 200).',
    ],
  });
  assert.equal(failedJob.status, 'FAIL');
  assert.match(failedJob.detail, /conclusion is failure/);
});

test('release run selection and public listing parsers', () => {
  const chosen = selectReleaseRun([
    { headBranch: 'v3.2.1', event: 'push', createdAt: '2026-11-14T06:24:58Z', databaseId: 2 },
    { headBranch: 'v3.2.1', event: 'push', createdAt: '2026-11-14T01:00:00Z', databaseId: 1 },
    { headBranch: 'v3.2.0', event: 'push', createdAt: '2026-11-14T07:00:00Z', databaseId: 3 },
    { headBranch: 'v3.2.1', event: 'workflow_dispatch', createdAt: '2026-11-14T08:00:00Z', databaseId: 4 },
  ], '3.2.1');
  assert.equal(chosen.databaseId, 2);
  assert.equal(
    githubRepoFromRemote('https://x-access-token:secret@github.com/SandeepBaskaran/design-mode.git'),
    'SandeepBaskaran/design-mode',
  );
  assert.equal(githubRepoFromRemote('git@github.com:SandeepBaskaran/design-mode.git'), 'SandeepBaskaran/design-mode');
  assert.equal(githubRepoFromRemote('https://example.com/not-github'), null);
  assert.equal(
    chromeVersionFromUpdateXml('<updatecheck status="ok" version="3.2.0"/>'),
    '3.2.0',
  );
  assert.equal(amoVersionStatus({ results: [{ version: '3.2.1', file: { status: 'public' } }] }, '3.2.1'), 'public');
  assert.equal(amoVersionStatus({ results: [], next: 'https://addons.mozilla.org/next' }, '3.2.1'), undefined);
  assert.equal(amoVersionStatus({ results: [{ version: '3.2.0', file: { status: 'public' } }] }, '3.2.1'), null);
});
