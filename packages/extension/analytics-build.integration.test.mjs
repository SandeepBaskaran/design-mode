import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));

test('real builds isolate local config, validate failures, preserve environment precedence and never log tokens', t => {
  const cache = resolve(source, '.cache');
  mkdirSync(cache, { recursive: true });
  const fixture = mkdtempSync(resolve(cache, 'analytics-build-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const directory = resolve(fixture, 'packages/extension');
  mkdirSync(directory, { recursive: true });
  for (const path of ['src', 'public', 'build.mjs', 'vite.config.ts', 'analytics-build-config.mjs']) {
    cpSync(resolve(source, path), resolve(directory, path), { recursive: true });
  }
  cpSync(resolve(source, '../shared/src'), resolve(fixture, 'packages/shared/src'), { recursive: true });
  const env = { ...process.env };
  for (const key of ['DM_POSTHOG_HOST', 'DM_POSTHOG_KEY', 'DM_DISTRIBUTION']) delete env[key];
  const token = 'phc_fakeintegration12345';
  const override = 'phc_fakeoverride12345';
  function build(args = [], extra = {}, status = 0) {
    const result = spawnSync(process.execPath, ['build.mjs', ...args], { cwd: directory, env: { ...env, ...extra }, encoding: 'utf8' });
    const output = String(result.stdout) + String(result.stderr);
    assert.equal(output.includes(token) || output.includes(override) || output.includes('private-config-marker'), false, 'build output must not reveal values');
    assert.equal(result.status, status, 'build exit status');
    return output;
  }
  const bundle = () => readFileSync(resolve(directory, 'dist/background.js'), 'utf8');
  assert.match(build(['--analytics'], {}, 1), /Cannot read/);
  const config = resolve(directory, '.env.analytics.local');
  writeFileSync(config, 'private-config-marker');
  assert.match(build(['--analytics'], {}, 1), /Invalid analytics configuration/);
  build();
  assert.equal(bundle().includes(token), false);
  writeFileSync(config, `DM_POSTHOG_HOST=https://analytics.example.invalid\nDM_POSTHOG_KEY=${token}\nDM_DISTRIBUTION=fork\n`);
  build(['--analytics']);
  assert.ok(bundle().includes(token));
  build(['--analytics'], { DM_POSTHOG_KEY: override });
  assert.ok(bundle().includes(override));
  assert.equal(bundle().includes(token), false);
  assert.match(build(['--analytics'], { DM_POSTHOG_KEY: '' }, 1), /Invalid DM_POSTHOG_KEY/);
  build();
  assert.equal(bundle().includes(token) || bundle().includes(override), false);
  build([], { DM_POSTHOG_HOST: 'https://analytics.example.invalid', DM_POSTHOG_KEY: override });
  assert.ok(bundle().includes(override), 'ordinary builds preserve existing explicit environment support');
});
