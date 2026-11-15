import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function releaseRef(inputsTag, callerRef) {
  return inputsTag || callerRef;
}

const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const caller = readFileSync(new URL('../.github/workflows/release-tag.yml', import.meta.url), 'utf8');

test('a called release uses the tag input and a tag push uses the push ref', () => {
  assert.equal(releaseRef('v3.2.2', 'refs/heads/main'), 'v3.2.2');
  assert.equal(releaseRef('', 'refs/tags/v3.2.2'), 'refs/tags/v3.2.2');
  assert.equal(release.includes('github.event_name'), false);
  const checkouts = [...release.matchAll(/uses: actions\/checkout@v7\n(?:[^\n]*\n){0,2}[^\n]*ref: (\$\{\{[^}]+\}\})/g)];
  assert.equal(checkouts.length, 4);
  for (const match of checkouts) {
    assert.equal(match[1], '${{ inputs.tag || github.ref }}');
  }
  assert.equal(release.includes('tag_name: ${{ inputs.tag || github.ref_name }}'), true);
  assert.equal(release.includes('target_commitish: ${{ inputs.tag || github.sha }}'), true);
  assert.equal(release.includes('RELEASE_TAG: ${{ inputs.tag || github.ref_name }}'), true);
});

test('the caller and the release workflow do not share a concurrency group', () => {
  assert.equal(caller.includes('group: design-mode-release\n'), true);
  assert.equal(release.includes('group: design-mode-release\n'), false);
  assert.equal(
    release.includes('group: design-mode-publish-${{ inputs.tag || github.ref_name }}'),
    true,
  );
});
