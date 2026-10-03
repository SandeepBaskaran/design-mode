import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalytics, environmentProperties, messageFeatures } from './analytics.ts';

const config = { host: 'https://analytics.invalid', key: 'phc_local_test_only' };
const names: Record<string, string> = {
  inspect: 'dm_inspect', style: 'dm_style_edit', text: 'dm_text_edit', dom: 'dm_dom_edit',
  comment: 'dm_comment_update', import: 'dm_changes_import', export: 'dm_changes_export',
  screenshot: 'dm_screenshot', undo: 'dm_undo', redo: 'dm_redo', send_to_agent: 'dm_send_to_agent',
  feedback_stop: 'dm_feedback_stop', mcp_state: 'dm_mcp_state',
};
for (const firefox of [false, true]) {
  test(`${firefox ? 'Firefox' : 'Chrome'}: semantic names, bounded payload, consent upgrade and revoke`, async () => {
    let consent: unknown;
    let permissions = ['technicalAndInteraction', 'locationInfo'];
    const received: any[] = [];
    let reads = 0;
    const deps = {
      firefox, manifest: { version: '3.0.0' }, readConsent: async () => consent,
      permissions: async () => ({ data_collection: permissions }),
      environment: () => { reads++; return { language: 'en-IN', timeZone: 'Asia/Kolkata', brands: [{ brand: 'Google Chrome', version: 'private' }] }; },
      fetch: async (_: unknown, init?: RequestInit) => { received.push(JSON.parse(init!.body as string)); return new Response(); },
    };
    const analytics = createAnalytics(config, deps);
    const input = { feature: 'style', outcome: 'attempt', language: 'private', timezone: 'private', url: 'private', userAgent: 'private' };
    await analytics.capture(input);
    consent = { ...config, enabled: true, version: 1 };
    await analytics.capture(input);
    assert.equal(received.length, 0); assert.equal(reads, 0);
    consent = { ...config, enabled: true, version: 2 };
    for (const feature of Object.keys(names)) {
      await analytics.capture({ ...input, feature });
      assert.equal(received.at(-1).event, names[feature]);
    }
    for (const feature of Object.values(messageFeatures)) assert.ok(names[feature]);
    for (const outcome of ['command_acknowledged', 'clipboard_completed', 'download_initiated', 'failure']) {
      await analytics.capture({ feature: 'screenshot', outcome });
      assert.equal(received.at(-1).properties.outcome, outcome);
    }
    const p = received[0].properties;
    assert.equal(p.browser, firefox ? 'firefox' : 'chrome');
    assert.equal(p.browser_vendor, firefox ? 'Mozilla' : 'Google');
    assert.equal(p.language, 'en-IN'); assert.match(p.timezone, /^Asia\/(Kolkata|Calcutta)$/);
    assert.equal(p.schema_version, 2);
    assert.deepEqual(Object.keys(p).sort(), ['$geoip_disable', '$process_person_profile', 'browser', 'browser_vendor', 'distribution', 'feature', 'language', 'outcome', 'schema_version', 'surface', 'timezone', 'version'].sort());
    assert.equal(JSON.stringify(received).includes('private'), false);
    const count = received.length;
    if (firefox) {
      permissions = ['technicalAndInteraction'];
      await analytics.capture(input); assert.equal(received.length, count);
    }
    analytics.stop(); consent = undefined;
    await analytics.capture(input);
    await createAnalytics(config, deps).capture(input);
    assert.equal(received.length, count);
  });
}

test('browser signals are coarse, optional metadata is validated and bounded', () => {
  assert.equal(environmentProperties(false, {}).browser, 'unknown');
  assert.equal(environmentProperties(false, { brands: [{ brand: 'Chromium' }, { brand: 'Brave' }] }).browser, 'chromium');
  assert.equal(environmentProperties(true, { brands: [{ brand: 'Google Chrome' }] }).browser_vendor, 'Mozilla');
  for (const language of ['x-private', 'en-x-private', 'https://private.invalid', 'a'.repeat(100), 123, 'en-INVALIDTAG']) {
    assert.equal(environmentProperties(false, { language }).language, undefined);
  }
  for (const timeZone of ['https://private.invalid', 'Asia/private', '+05:30', 'x'.repeat(100), 123]) {
    assert.equal(environmentProperties(false, { timeZone }).timezone, undefined);
  }
});
