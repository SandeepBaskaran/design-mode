import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { decideRelease } from './release-decision.mjs';

const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const tags = ['v3.2.0', 'v3.2.1'];

test('a push that does not change the version publishes nothing', () => {
  const decision = decideRelease({
    eventName: 'push',
    refType: 'branch',
    refName: 'main',
    version: '3.2.2',
    previousVersion: '3.2.2',
    tags,
  });
  assert.equal(decision.release, false);
  assert.equal(decision.error, false);
  assert.match(decision.summary, /unchanged/);
  assert.match(decision.summary, /Nothing was tagged or published/);
});

test('a version bump newer than the latest tag is a release', () => {
  const decision = decideRelease({
    eventName: 'push',
    refType: 'branch',
    refName: 'main',
    version: '3.2.3',
    previousVersion: '3.2.2',
    tags,
  });
  assert.equal(decision.release, true);
  assert.equal(decision.tag, 'v3.2.3');
});

test('an existing tag on this commit is left untouched', () => {
  const existing = decideRelease({
    eventName: 'push',
    refType: 'branch',
    refName: 'main',
    version: '3.2.1',
    previousVersion: '3.2.0',
    tags,
    headSha: 'abc111',
    tagCommits: { 'v3.2.1': 'abc111' },
  });
  assert.equal(existing.release, false);
  assert.equal(existing.error, false);
  assert.match(existing.summary, /already points at abc111/);

  const older = decideRelease({
    eventName: 'workflow_dispatch',
    refType: 'branch',
    refName: 'main',
    version: '3.2.0',
    previousVersion: null,
    tags: ['v3.2.1'],
    headSha: 'abc111',
    tagCommits: {},
  });
  assert.equal(older.release, false);
  assert.match(older.summary, /not newer/);
});

test('a tag that points at another commit fails and is not moved', () => {
  const decision = decideRelease({
    eventName: 'workflow_dispatch',
    refType: 'branch',
    refName: 'main',
    version: '3.2.2',
    previousVersion: null,
    tags: ['v3.2.1', 'v3.2.2'],
    headSha: 'abc111',
    tagCommits: { 'v3.2.2': 'def222' },
  });
  assert.equal(decision.release, false);
  assert.equal(decision.error, true);
  assert.match(decision.summary, /def222/);
  assert.match(decision.summary, /abc111/);
  assert.match(decision.summary, /does not retag/);
});

test('a manual run can publish a version that an earlier push left untagged', () => {
  const decision = decideRelease({
    eventName: 'workflow_dispatch',
    refType: 'branch',
    refName: 'main',
    version: '3.2.2',
    previousVersion: null,
    tags,
  });
  assert.equal(decision.release, true);
  assert.equal(decision.tag, 'v3.2.2');
});

test('a hand-pushed tag is published by that same run', () => {
  const decision = decideRelease({
    eventName: 'push',
    refType: 'tag',
    refName: 'v3.2.3',
    version: '',
    previousVersion: null,
    tags,
  });
  assert.equal(decision.release, true);
  assert.equal(decision.tag, 'v3.2.3');
});

test('the release workflow tags from main and publishes in the same run', () => {
  assert.equal(existsSync(new URL('../.github/workflows/release-tag.yml', import.meta.url)), false);
  assert.equal(existsSync(new URL('../.github/workflows/pr-extension.yml', import.meta.url)), false);
  assert.equal(release.includes('workflow_call'), false);
  assert.equal(release.includes('inputs.tag'), false);
  assert.equal(release.includes('branches: [main]'), true);
  assert.equal(release.includes("tags: ['v*.*.*']"), true);
  assert.equal(release.includes('workflow_dispatch:'), true);
  assert.equal(release.includes('group: design-mode-release\n'), true);
  assert.equal(release.includes('git push origin "refs/tags/${tag}"'), true);
  assert.equal(release.includes('--force'), false);
  assert.equal(release.includes('tag -f'), false);
  assert.equal(release.includes('tag -d'), false);
  assert.equal(release.includes(':refs/tags'), false);
  assert.equal((release.match(/ref: \$\{\{ needs\.prepare\.outputs\.tag \}\}/g) || []).length, 1);
  assert.equal((release.match(/ref: \$\{\{ needs\.release\.outputs\.tag \}\}/g) || []).length, 3);
  assert.equal(release.includes('tag_name: ${{ needs.prepare.outputs.tag }}'), true);
  assert.equal(release.includes('target_commitish: ${{ needs.prepare.outputs.tag }}'), true);
  assert.equal(ci.includes('name: extension-pr-${{ github.event.pull_request.number }}'), true);
  assert.equal(ci.includes("if: github.event_name == 'pull_request'"), true);
});
