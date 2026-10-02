import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyticsBuildEnv } from './analytics-build-config.mjs';

const cache = resolve(dirname(fileURLToPath(import.meta.url)), '.cache');
const host = 'https://analytics.example.invalid';
const token = 'phc_fakefixture12345';
const valid = `DM_POSTHOG_HOST=${host}\nDM_POSTHOG_KEY=${token}\n`;
function fixture(t, source) {
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(resolve(cache, 'analytics-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  if (source !== undefined) writeFileSync(resolve(directory, '.env.analytics.local'), source);
  return directory;
}

test('reads only the exact file and allowlisted variables, without mutation or expansion', t => {
  const directory = fixture(t, `# public build config\nDM_POSTHOG_HOST="${host}"\nDM_POSTHOG_KEY='${token}'\nDM_DISTRIBUTION=fork\n`);
  writeFileSync(resolve(directory, '.env'), 'DM_POSTHOG_HOST=https://wrong.invalid\nNODE_OPTIONS=bad');
  writeFileSync(resolve(directory, '.env.local'), 'DM_POSTHOG_KEY=bad');
  const env = { PATH: '/fixture' };
  assert.deepEqual(analyticsBuildEnv(directory, env), { ...env, DM_POSTHOG_HOST: host, DM_POSTHOG_KEY: token, DM_DISTRIBUTION: 'fork' });
  assert.deepEqual(env, { PATH: '/fixture' });
});

test('explicit environment wins, including an empty invalid value', t => {
  const directory = fixture(t, valid + 'DM_DISTRIBUTION=fork\n');
  const env = { DM_POSTHOG_HOST: 'https://override.example.invalid', DM_POSTHOG_KEY: 'phc_override12345', DM_DISTRIBUTION: 'published_hint' };
  assert.deepEqual(analyticsBuildEnv(directory, env), env);
  assert.throws(() => analyticsBuildEnv(directory, { DM_POSTHOG_KEY: '' }), /Invalid DM_POSTHOG_KEY/);
});

test('missing file fails even with environment configuration', t => {
  assert.throws(() => analyticsBuildEnv(fixture(t), { DM_POSTHOG_HOST: host, DM_POSTHOG_KEY: token }), /Cannot read packages\/extension\/\.env.analytics.local/);
});

test('optional distribution defaults to unknown', t => {
  assert.equal(analyticsBuildEnv(fixture(t, valid), {}).DM_DISTRIBUTION, 'unknown');
});

test('malformed config and invalid effective values fail without disclosing values', t => {
  for (const source of [
    `${valid}NODE_OPTIONS=private-fixture-marker`,
    `${valid}DM_POSTHOG_KEY=private-fixture-marker`,
    'private-fixture-marker',
    'DM_POSTHOG_HOST="private-fixture-marker',
    `DM_POSTHOG_HOST=http://private-fixture-marker\nDM_POSTHOG_KEY=${token}`,
    `DM_POSTHOG_HOST=https://user:private-fixture-marker@example.invalid\nDM_POSTHOG_KEY=${token}`,
    `DM_POSTHOG_HOST=${host}/private-fixture-marker\nDM_POSTHOG_KEY=${token}`,
    `DM_POSTHOG_HOST=${host}?private-fixture-marker\nDM_POSTHOG_KEY=${token}`,
    `DM_POSTHOG_HOST=${host}#private-fixture-marker\nDM_POSTHOG_KEY=${token}`,
    `DM_POSTHOG_HOST=${host}\nDM_POSTHOG_KEY=private-fixture-marker`,
    `${valid}DM_DISTRIBUTION=private-fixture-marker`,
    `DM_POSTHOG_HOST=${host}\nDM_POSTHOG_KEY=\${private-fixture-marker}`,
    '',
  ]) {
    assert.throws(() => analyticsBuildEnv(fixture(t, source), {}), error => {
      assert.doesNotMatch(String(error), /private-fixture-marker|phc_fakefixture12345/);
      return true;
    });
  }
});
