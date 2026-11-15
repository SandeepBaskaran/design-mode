import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  assert.equal(decision.createTag, true);
  assert.equal(decision.tag, 'v3.2.3');
});

test('an existing tag with no GitHub Release is finished only by a manual run', () => {
  const pushed = decideRelease({
    eventName: 'push',
    refType: 'branch',
    refName: 'main',
    version: '3.2.2',
    previousVersion: '3.2.2',
    tags: ['v3.2.1', 'v3.2.2'],
    githubReleaseExists: false,
  });
  assert.equal(pushed.release, false);
  assert.equal(pushed.createTag, false);
  assert.equal(pushed.error, false);
  assert.equal(pushed.summary, 'v3.2.2 exists without a release; run Release manually to finish it.');

  const manual = decideRelease({
    eventName: 'workflow_dispatch',
    refType: 'branch',
    refName: 'main',
    version: '3.2.2',
    previousVersion: null,
    tags: ['v3.2.1', 'v3.2.2'],
    githubReleaseExists: false,
  });
  assert.equal(manual.release, true);
  assert.equal(manual.createTag, false);
  assert.equal(manual.tag, 'v3.2.2');
  assert.match(manual.summary, /does not retag/);
});

test('a tag that already has a GitHub Release is a no-op', () => {
  for (const eventName of ['push', 'workflow_dispatch']) {
    const decision = decideRelease({
      eventName,
      refType: 'branch',
      refName: 'main',
      version: '3.2.1',
      previousVersion: '3.2.0',
      tags,
      githubReleaseExists: true,
    });
    assert.equal(decision.release, false);
    assert.equal(decision.createTag, false);
    assert.match(decision.summary, /already has a GitHub Release/);
  }
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
  assert.equal(decision.createTag, true);
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
  assert.equal(decision.createTag, false);
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
  assert.equal(release.includes("if: steps.decide.outputs.createTag == 'true'"), true);
  assert.equal((release.match(/ref: \$\{\{ needs\.prepare\.outputs\.tag \}\}/g) || []).length, 1);
  assert.equal((release.match(/ref: \$\{\{ needs\.release\.outputs\.tag \}\}/g) || []).length, 3);
  assert.equal(release.includes('tag_name: ${{ needs.prepare.outputs.tag }}'), true);
  assert.equal(release.includes('target_commitish: ${{ needs.prepare.outputs.tag }}'), true);
  assert.equal(ci.includes('name: extension-pr-${{ github.event.pull_request.number }}'), true);
  assert.equal(ci.includes("if: github.event_name == 'pull_request'"), true);
});

test('every run step that calls gh sets GH_TOKEN', () => {
  const directory = new URL('../.github/workflows/', import.meta.url);
  let calls = 0;
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.yml')) continue;
    const lines = readFileSync(new URL(name, directory), 'utf8').split('\n');
    const steps = [];
    let current = null;
    for (const line of lines) {
      if (line.startsWith('      - ')) {
        if (current) steps.push(current.join('\n'));
        current = [line];
      } else if (current) current.push(line);
    }
    if (current) steps.push(current.join('\n'));
    for (const step of steps) {
      const run = step.includes('\n        run:');
      const callsGh = /\bgh [\w-]/.test(step) || step.includes("execFileSync('gh'");
      if (!run || !callsGh) continue;
      calls += 1;
      assert.equal(step.includes('GH_TOKEN:'), true, `${name} calls gh without GH_TOKEN`);
    }
  }
  assert.equal(calls >= 3, true);
});
