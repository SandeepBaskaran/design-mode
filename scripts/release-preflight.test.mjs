import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  changelogHasSection,
  compareSemver,
  findVersionHits,
  parseArgs,
  parseGitGrep,
  parseSemver,
  previousReleaseVersion,
  sha1File,
  versionTokenRegex,
  websiteChangelogNewestVersion,
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
  });
  assert.equal(parseArgs(['node', 'script', '--tarball=/tmp/a.tgz', '--post']).tarball, '/tmp/a.tgz');
  assert.throws(() => parseArgs(['node', 'script', '--tarball', '/tmp/a.tgz']), /only valid with `--post`/);
  assert.throws(() => parseArgs(['node', 'script', '--nope']), /Unknown argument/);
});
