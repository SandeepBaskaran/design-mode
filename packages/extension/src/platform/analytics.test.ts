import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createAnalytics, isAnalyticsSender, commandOutcome, persistAnalyticsDisabled, boundedEvent, consentMatches, distributionHint, nativeConsentAllowed, parseAnalyticsConfig, styleAnalytics, styleAnalyticsList, pageSchemeFromUrl, changeCountBucket, classifyErrorCode } from './analytics.ts';

const config = parseAnalyticsConfig({ host: 'https://analytics.invalid', key: 'phc_local_test_only' })!;
const consent = { ...config, version: 2, enabled: true };
const event = { feature: 'import', outcome: 'attempt' };
const base = { readConsent: async () => consent, permissions: async () => ({}), firefox: false, manifest: { version: '3.0.0' } };

test('exact panel identity permits docked, Firefox sidebar and tab-backed popout; rejects web/content senders', () => {
  for (const protocol of ['chrome-extension:', 'moz-extension:']) {
    const runtime = { id: 'extension-id', getURL: (path: string) => protocol + '//extension-host/' + path };
    const valid = { id: runtime.id, url: runtime.getURL('sidepanel/index.html'), origin: protocol + '//extension-host' };
    for (const suffix of ['', '?popout=1&tabId=7', '#fragment']) {
      assert.equal(isAnalyticsSender({ ...valid, url: valid.url + suffix }, runtime), true);
      const tabSender = { ...valid, url: valid.url + suffix, tab: { id: 7 } };
      assert.equal(isAnalyticsSender(tabSender, runtime), true);
    }
    for (const sender of [
      { ...valid, id: 'other' }, { ...valid, url: 'https://example.com/' },
      { ...valid, url: valid.url + '/extra' }, { ...valid, url: valid.url.replace('index', 'other') },
      { ...valid, url: valid.url.replace('extension-host', 'foreign-host') },
      { ...valid, origin: 'https://example.com' }, { ...valid, origin: 'null' },
      { ...valid, url: 'not a URL' }, { id: valid.id },
    ]) assert.equal(isAnalyticsSender(sender, runtime), false);
  }
});

test('command acknowledgements never assert completion, even for empty or no-op responses', () => {
  for (const response of [{}, { ok: true }, { skipped: true }, { changed: false }]) {
    assert.deepEqual(commandOutcome(response), { outcome: 'command_acknowledged' });
  }
  for (const response of [undefined, null, { ok: false }, { error: 'private detail' }]) {
    assert.equal(commandOutcome(response).outcome, 'failure');
  }
  assert.equal(boundedEvent({ feature: 'undo', outcome: 'success' }), null);
});

test('failed remove AND fallback cannot prevent restart using old consent; storage read failure still fails closed', async () => {
  let stored: unknown = consent;
  const storage = { remove: async () => { throw Error('remove'); }, set: async () => { throw Error('set'); } };
  await assert.rejects(persistAnalyticsDisabled(storage));
  let sends = 0;
  const deps = { ...base, readConsent: async () => stored, fetch: async () => { sends++; return new Response(); } };
  const original = createAnalytics(config, deps); original.stop(); await original.capture(event);
  assert.equal(sends, 0);
  await createAnalytics(config, deps).capture(event);
  assert.equal(sends, 1);
  stored = { enabled: false, version: 2 };
  await createAnalytics(config, deps).capture(event);
  assert.equal(sends, 2);
});

test('config is absent by default and rejects unsafe/incomplete endpoints', () => {
  for (const value of [undefined, {}, { key: config.key }, { ...config, key: '' }, { ...config, host: 'http://127.0.0.1' }, { ...config, host: 'https://user:pass@example.org' }, { ...config, host: 'https://example.org/path' }, { ...config, host: 'https://example.org?x=1' }]) assert.equal(parseAnalyticsConfig(value), null);
  assert.equal(consentMatches(true, config), false);
  assert.equal(consentMatches(consent, { ...config, host: 'https://other.invalid' }), false);
});

test('allowlist strips page content, URLs, selectors, tokens and raw errors', () => {
  assert.deepEqual(boundedEvent({ ...event, url: 'https://private.invalid', selector: '#secret', text: 'secret', comment: 'secret', token: 'secret', screenshot: 'secret', error: 'secret', reason: 'secret', mode: 'secret', state: 'secret', action: 'secret', kind: 'secret', scope: 'secret', target: 'secret', media: 'secret', resolved: 'secret' }), event);
  assert.deepEqual(boundedEvent({ feature: 'computed_css', outcome: 'attempt', action: 'open' }), { feature: 'computed_css', outcome: 'attempt', action: 'open' });
  assert.deepEqual(boundedEvent({ feature: 'computed_css', outcome: 'clipboard_completed', action: 'copy' }), { feature: 'computed_css', outcome: 'clipboard_completed', action: 'copy' });
  assert.deepEqual(boundedEvent({ feature: 'annotate', outcome: 'attempt', kind: 'region' }), { feature: 'annotate', outcome: 'attempt', kind: 'region' });
  assert.deepEqual(boundedEvent({ feature: 'token_edit', outcome: 'command_acknowledged', scope: 'theme' }), { feature: 'token_edit', outcome: 'command_acknowledged', scope: 'theme' });
  assert.deepEqual(boundedEvent({ feature: 'theme', outcome: 'state', state: 'system', resolved: 'dark' }), { feature: 'theme', outcome: 'state', state: 'system', resolved: 'dark' });
  assert.deepEqual(boundedEvent({ feature: 'help', outcome: 'attempt', target: 'shortcuts' }), { feature: 'help', outcome: 'attempt', target: 'shortcuts' });
  assert.deepEqual(boundedEvent({ feature: 'matching_layers', outcome: 'state', state: 'on' }), { feature: 'matching_layers', outcome: 'state', state: 'on' });
  assert.deepEqual(boundedEvent({ feature: 'media', outcome: 'download_initiated', action: 'download', media: 'svg' }), { feature: 'media', outcome: 'download_initiated', action: 'download', media: 'svg' });
  assert.deepEqual(boundedEvent({ feature: 'style', outcome: 'attempt', prop: 'font-size', category: 'typography', value: '#secret', selector: '#private' }), { feature: 'style', outcome: 'attempt', prop: 'font-size', category: 'typography' });
  assert.deepEqual(boundedEvent({ feature: 'dom', outcome: 'attempt', action: 'duplicate', category: 'dom' }), { feature: 'dom', outcome: 'attempt', action: 'duplicate', category: 'dom' });
  assert.deepEqual(boundedEvent({ feature: 'text', outcome: 'attempt', action: 'html', category: 'text', html: '<b>secret</b>' }), { feature: 'text', outcome: 'attempt', action: 'html', category: 'text' });
  assert.deepEqual(boundedEvent({ feature: 'export', outcome: 'attempt', format: 'markdown', change_count_bucket: '2-5', page_scheme: 'https' }), { feature: 'export', outcome: 'attempt', format: 'markdown', change_count_bucket: '2-5', page_scheme: 'https' });
  assert.deepEqual(boundedEvent({ feature: 'inspect', outcome: 'failure', error_code: 'restricted_url', page_scheme: 'chrome_internal', url: 'chrome://settings' }), { feature: 'inspect', outcome: 'failure', error_code: 'restricted_url', page_scheme: 'chrome_internal' });
  assert.equal(boundedEvent({ feature: 'style', outcome: 'attempt', prop: 'not-a-prop', category: 'secret' })?.prop, undefined);
  assert.equal(boundedEvent({ feature: 'secret', outcome: 'attempt' }), null);
  assert.equal(boundedEvent({ feature: 'import', outcome: 'secret' }), null);
  assert.deepEqual(styleAnalytics('fontSize'), { prop: 'font-size', category: 'typography' });
  assert.deepEqual(styleAnalytics('backgroundColor'), { prop: 'background-color', category: 'color' });
  assert.deepEqual(styleAnalytics('aspectRatio'), { prop: 'aspect-ratio', category: 'sizing' });
  assert.deepEqual(styleAnalytics('flexGrow'), { prop: 'flex-grow', category: 'layout' });
  assert.deepEqual(styleAnalytics('clipPath'), { prop: 'clip-path', category: 'effects' });
  assert.deepEqual(styleAnalytics('gridTemplateAreas'), { prop: 'grid-template-areas', category: 'layout' });
  assert.deepEqual(styleAnalyticsList([
    { property: 'paddingTop', value: '8px' },
    { property: 'paddingRight', value: '8px' },
    { property: 'paddingTop', value: '9px' },
    { property: '--private', value: 'secret' },
  ]), [
    { prop: 'padding-top', category: 'spacing' },
    { prop: 'padding-right', category: 'spacing' },
  ]);
  assert.equal(pageSchemeFromUrl('https://example.com/path?q=1'), 'https');
  assert.equal(pageSchemeFromUrl('http://localhost:3000/app'), 'localhost');
  assert.equal(pageSchemeFromUrl('file:///Users/private/page.html'), 'file');
  assert.equal(pageSchemeFromUrl('chrome://extensions'), 'chrome_internal');
  assert.equal(changeCountBucket(0), '0');
  assert.equal(changeCountBucket(4), '2-5');
  assert.equal(changeCountBucket(21), '20+');
  assert.equal(classifyErrorCode({ error: 'Could not establish connection. Receiving end does not exist.' }), 'no_content_script');
  assert.equal(classifyErrorCode({ error: 'https://private.example/secret-path timed out' }), 'agent_timeout');
  assert.equal(classifyErrorCode(undefined), 'unavailable');
});

test('Chrome, native Firefox denial/grant, Firefox 121 fallback', () => {
  assert.equal(nativeConsentAllowed(false, {}), true);
  assert.equal(nativeConsentAllowed(true, {}), true);
  assert.equal(nativeConsentAllowed(true, { data_collection: [] }), false);
  assert.equal(nativeConsentAllowed(true, { data_collection: ['technicalAndInteraction', 'locationInfo'] }), true);
});

test('distribution is explicitly only a hint; no ID or management permission', () => {
  assert.equal(distributionHint(config, {}), 'unknown');
  assert.equal(distributionHint(config, { update_url: 'https://clients2.google.com/service/update2/crx' }), 'published_hint');
  assert.equal(distributionHint({ ...config, distribution: 'fork' }, {}), 'fork');
  const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '121.0');
  assert.equal(manifest.browser_specific_settings.gecko.data_collection_permissions.required[0], 'locationInfo');
  assert.ok(manifest.background.scripts && manifest.background.service_worker && manifest.sidebar_action && manifest.side_panel);
  assert.equal(manifest.permissions.includes('management'), false);
});

test('no-egress: absent config and Firefox data-permission denial', async () => {
  let sends = 0;
  const fetch = async () => { sends++; throw new Error('Network forbidden'); };
  for (const analytics of [
    createAnalytics(null, { ...base, fetch }),
    createAnalytics(config, { ...base, fetch, firefox: true, permissions: async () => ({ data_collection: [] }) }),
  ]) await analytics.capture(event);
  assert.equal(sends, 0);
});

test('configured transport reaches ONLY a loopback mock; opt-out clears pending work; IDs are per event', async () => {
  const received: any[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received.push({ path: req.url, body: JSON.parse(body) });
    res.end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  const requests: RequestInit[] = [];
  const localFetch: typeof fetch = (url, init) => {
    assert.equal(url, 'https://analytics.invalid/i/v0/e/');
    requests.push(init!);
    return fetch('http://127.0.0.1:' + address.port + '/i/v0/e/', init);
  };
  try {
    const store: Record<string, unknown> = {};
    const storage = {
      get: async (key: string) => ({ [key]: store[key] }),
      set: async (value: Record<string, unknown>) => { Object.assign(store, value); },
    };
    const analytics = createAnalytics(config, { ...base, storage, fetch: localFetch });
    await analytics.capture(event); await analytics.capture({ feature: 'send_to_agent', outcome: 'failure', reason: 'offline' });
    analytics.stop(); await analytics.capture(event);
    assert.equal(received.length, 2);
    assert.equal(received[0].body.distinct_id, received[1].body.distinct_id);
    assert.equal(received[0].body.distinct_id, store['dm-analytics-distinct-id']);
    assert.equal(received[0].body.properties.$process_person_profile, true);
    assert.equal(received[0].body.properties.$geoip_disable, false);
    assert.equal(received[0].body.properties.surface, 'extension');
    assert.equal(requests[0].credentials, 'omit');
    assert.equal(requests[0].redirect, 'error');
    assert.equal(requests[0].referrerPolicy, 'no-referrer');
    const restartedWithStore = createAnalytics(config, { ...base, storage, fetch: localFetch });
    await restartedWithStore.capture(event);
    assert.equal(received.length, 3);
    assert.equal(received[2].body.distinct_id, received[0].body.distinct_id);
    const pending = createAnalytics(config, { ...base, fetch: localFetch });
    const task = pending.capture(event); pending.stop(); await task;
    assert.equal(received.length, 3);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('abort in-flight request, no retries, bounded volume, worker restart rereads consent', async () => {
  let signal: AbortSignal | undefined;
  const analytics = createAnalytics(config, { ...base, fetch: async (_, init) => {
    signal = init!.signal as AbortSignal;
    return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('abort'))));
  } });
  const task = analytics.capture(event);
  await new Promise(r => setImmediate(r)); analytics.stop(); await task;
  assert.equal(signal?.aborted, true);
  let sends = 0;
  const limited = createAnalytics(config, { ...base, fetch: async () => { sends++; throw new Error('offline'); } });
  for (let i = 0; i < 100; i++) await limited.capture(event);
  assert.equal(sends, 60);
  const restarted = createAnalytics(config, { ...base, fetch: async () => { sends++; return new Response(); } });
  await restarted.capture(event); assert.equal(sends, 61);
});
