import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';

function fixture(firefox: boolean, native: boolean, configured = true, grant = true) {
  const bundle = buildSync({ entryPoints: [new URL('./analytics-setting.ts', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'browser', define: {
    __DM_ANALYTICS__: JSON.stringify(configured ? { host: 'https://analytics.invalid', key: 'phc_local_test_only' } : null),
  } }).outputFiles[0].text;
  const stored: Record<string, unknown> = {};
  const requests: unknown[] = [];
  const messages: unknown[] = [];
  const listeners: Record<string, Function[]> = { changed: [], removed: [], added: [] };
  let nativeGranted = false;
  const api = { sidebarAction: firefox ? {} : undefined,
    runtime: { sendMessage: async (message: unknown) => { messages.push(message); return { ok: true }; } },
    storage: { local: { get: async () => stored, set: async (value: object) => Object.assign(stored, value), remove: async (key: string) => { delete stored[key]; } }, onChanged: { addListener: (fn: Function) => listeners.changed.push(fn) } },
    permissions: { getAll: async () => native ? { data_collection: nativeGranted ? ['technicalAndInteraction', 'locationInfo'] : [] } : {}, request: (value: unknown) => { requests.push(value); nativeGranted = grant; return Promise.resolve(grant); }, onRemoved: { addListener: (fn: Function) => listeners.removed.push(fn) }, onAdded: { addListener: (fn: Function) => listeners.added.push(fn) } },
  };
  const context = { module: { exports: {} as any }, browser: api, navigator: { userAgent: firefox ? 'Firefox' : 'Chrome' }, URL, console };
  runInNewContext(bundle, context);
  return { setting: context.module.exports, stored, requests, messages, api };
}

for (const [name, firefox, native] of [['Chrome', false, false], ['Firefox 121 custom fallback', true, false], ['Firefox native', true, true]] as const) {
  test(name + ': requires deliberate UI consent, immediate native request, off clears consent', async () => {
    const f = fixture(firefox, native);
    await f.setting.refreshAnalyticsSetting();
    assert.match(f.setting.renderAnalyticsSetting(), /aria-checked="false"/);
    assert.deepEqual(f.stored, {});
    const enabling = f.setting.toggleAnalytics();
    assert.equal(f.requests.length, native ? 1 : 0);
    await enabling;
    assert.equal((f.stored['dm-analytics-consent-v1'] as any).enabled, true);
    assert.equal((f.stored['dm-analytics-consent-v1'] as any).version, 2);
    if (native) assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0])), { data_collection: ['technicalAndInteraction', 'locationInfo'] });
    assert.match(f.setting.renderAnalyticsSetting(), /browser name\/vendor.*language and timezone/);
    assert.match(f.setting.renderAnalyticsSetting(), /aria-checked="true"/);
    await f.setting.toggleAnalytics();
    assert.deepEqual(f.stored, {});
    assert.equal((f.messages[0] as any).type, 'DM_ANALYTICS_STOP');
  });
}

test('failed durable opt-out does not falsely show persisted consent as off', async () => {
  const f = fixture(false, false);
  await f.setting.refreshAnalyticsSetting(); await f.setting.toggleAnalytics();
  f.api.storage.local.remove = async () => { throw new Error('storage unavailable'); };
  f.api.storage.local.set = async () => { throw new Error('storage unavailable'); };
  await f.setting.toggleAnalytics();
  assert.match(f.setting.renderAnalyticsSetting(), /aria-checked="true"/);
  assert.match(f.setting.renderAnalyticsSetting(), /Could not save opt-out.*resume after a background restart/);
  assert.equal((f.messages[0] as any).type, 'DM_ANALYTICS_STOP');
});

test('remove failure writes a durable disabled record, also safe after worker restart', async () => {
  const f = fixture(false, false);
  await f.setting.refreshAnalyticsSetting(); await f.setting.toggleAnalytics();
  f.api.storage.local.remove = async () => { throw new Error('remove failed'); };
  await f.setting.toggleAnalytics();
  assert.equal((f.stored['dm-analytics-consent-v1'] as any).enabled, false);
  assert.match(f.setting.renderAnalyticsSetting(), /aria-checked="false"/);
  const { createAnalytics, parseAnalyticsConfig } = await import('../platform/analytics.ts');
  let sends = 0;
  const restarted = createAnalytics(parseAnalyticsConfig({ host: 'https://analytics.invalid', key: 'phc_local_test_only' }), {
    readConsent: async () => f.stored['dm-analytics-consent-v1'], permissions: async () => ({}), firefox: false,
    manifest: { version: '2.3.1' }, fetch: async () => { sends++; return new Response(); },
  });
  await restarted.capture({ feature: 'inspect', outcome: 'attempt' });
  assert.equal(sends, 0);
});

test('unavailable storage warns that saved state is unknown', async () => {
  const f = fixture(false, false);
  f.api.storage.local.get = async () => { throw new Error('unavailable'); };
  await f.setting.refreshAnalyticsSetting();
  assert.match(f.setting.renderAnalyticsSetting(), /Saved state is unknown/);
  assert.match(f.setting.renderAnalyticsSetting(), /disabled/);
});

test('failed opt-out with unreadable storage can be retried without opting back in', async () => {
  const f = fixture(false, false);
  await f.setting.refreshAnalyticsSetting(); await f.setting.toggleAnalytics();
  const remove = f.api.storage.local.remove;
  const set = f.api.storage.local.set;
  const get = f.api.storage.local.get;
  f.api.storage.local.remove = async () => { throw Error('unavailable'); };
  f.api.storage.local.set = async () => { throw Error('unavailable'); };
  f.api.storage.local.get = async () => { throw Error('unavailable'); };
  await f.setting.toggleAnalytics();
  assert.match(f.setting.renderAnalyticsSetting(), /Opt-out not saved — retry/);
  assert.doesNotMatch(f.setting.renderAnalyticsSetting(), / disabled/);
  f.api.storage.local.remove = remove; f.api.storage.local.set = set; f.api.storage.local.get = get;
  await f.setting.toggleAnalytics();
  assert.deepEqual(f.stored, {});
  assert.match(f.setting.renderAnalyticsSetting(), /Off — I agree to enable/);
});

test('native denial never stores consent; unconfigured build cannot enable', async () => {
  const denied = fixture(true, true, true, false);
  await denied.setting.refreshAnalyticsSetting(); await denied.setting.toggleAnalytics();
  assert.deepEqual(denied.stored, {});
  assert.match(denied.setting.renderAnalyticsSetting(), /Permission declined/);
  const dormant = fixture(false, false, false);
  await dormant.setting.refreshAnalyticsSetting(); await dormant.setting.toggleAnalytics();
  assert.deepEqual(dormant.stored, {});
  assert.match(dormant.setting.renderAnalyticsSetting(), /disabled/);
  assert.match(dormant.setting.renderAnalyticsSetting(), /Nothing is sent/);
});
