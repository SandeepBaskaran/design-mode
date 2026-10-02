import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createCommentStore } from '../background/comment-store';
import { createSessionStore } from '../background/session-store';
import { isAnalyticsSender } from './analytics';

const compiled = ts.transpileModule(readFileSync(new URL('../background/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  let listener: (message: any, sender: any, respond: (value: any) => void) => boolean;
  const event = { addListener() {} };
  const updates: Array<{ tabId: number; url: string }> = [];
  const forwards: Array<{ tabId: number; message: any }> = [];
  const tabs = new Map<number, { url?: string; pendingUrl?: string }>([
    [7, { url: 'https://example.test/current' }],
    [8, { url: 'https://other.test/current' }],
  ]);
  const records: Record<string, unknown> = {};
  const storage = {
    get: async () => structuredClone(records),
    set: async (items: Record<string, unknown>) => { Object.assign(records, structuredClone(items)); },
    remove: async (keys: string | string[]) => { for (const key of [keys].flat()) delete records[key]; },
  };
  const browser = {
    permissions: { onRemoved: event },
    runtime: { getManifest: () => ({}), id: 'test-extension', getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      onInstalled: event, onConnect: event,
      onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    storage: { onChanged: event, local: storage, session: storage },
    action: { onClicked: event }, commands: { onCommand: event },
    windows: { onRemoved: event, onBoundsChanged: event },
    tabs: {
      onRemoved: event, onUpdated: event,
      get: async (id: number) => { if (!tabs.has(id)) throw new Error('Missing tab'); return tabs.get(id); },
      update: async (tabId: number, options: { url: string }) => { updates.push({ tabId, ...options }); },
      sendMessage: async (tabId: number, message: any) => {
        forwards.push({ tabId, message });
        return { routeGroups: [{ routeKey: 'https://example.test/a', url: 'https://example.test/a' }] };
      },
    },
  };
  vm.runInNewContext(compiled, {
    browser, chrome: browser, URL, console: { log() {} }, exports: {},
    require: (path: string) => {
      if (path === './user-styles') return { replaceUserStyles: async () => {} };
      if (path.endsWith('/analytics-config')) return { analyticsConfig: {} };
      if (path.endsWith('/analytics')) return { isAnalyticsSender, createAnalytics: () => ({ start() {}, stop() {}, refresh() {}, track() {} }) };
      if (path === './comment-store') return { createCommentStore };
      if (path === './session-store') return { createSessionStore };
      if (path.endsWith('/polyfill') || path.endsWith('/page-component-context')) return {};
      if (path.endsWith('/target')) return { IS_FIREFOX: false };
      if (path.endsWith('/panel')) return { setActionOpensPanel() {} };
      if (path.endsWith('/launch-surface')) return {
        DEFAULT_LAUNCH_SURFACE: 'side-panel', LAUNCH_SURFACE_KEY: 'dm-launch-surface', parseLaunchSurface: () => 'side-panel',
      };
      throw new Error(`Unexpected import: ${path}`);
    },
  });
  const sender = { id: browser.runtime.id, url: browser.runtime.getURL('sidepanel/index.html') };
  const send = (message: any, source = sender, keepsChannelOpen = true) => {
    let respond!: (value: any) => void;
    const response = new Promise<any>(resolve => { respond = resolve; });
    assert.equal(listener(message, source, respond), keepsChannelOpen);
    return response;
  };
  return { send, tabs, updates, forwards, sender, records };
}

test('session persistence handler authenticates content senders and acknowledges the real background writer', async () => {
  const h = harness();
  const operation = { action: 'write', payload: {
    'dm_session:https://example.test/current': { styleChanges: [], textChanges: [], domChanges: [], siteGeneration: null, routeGeneration: null },
  } };
  const contentSender = { id: h.sender.id, tab: { id: 7 }, url: 'https://example.test/current' };
  assert.equal((await h.send({ type: 'DM_SESSION_STORE', operation }, contentSender)).ok, true);
  assert.deepEqual(h.records['dm_session:https://example.test/current'], operation.payload['dm_session:https://example.test/current']);
  assert.equal((await h.send({ type: 'DM_SESSION_STORE', operation })).ok, false);
  assert.equal((await h.send({ type: 'DM_SESSION_STORE', operation }, { ...contentSender, id: 'foreign' }, false)).ok, false);
  assert.equal((await h.send({ type: 'DM_SESSION_STORE', operation }, { ...contentSender, url: 'https://other.test/current' })).ok, false);
});

test('site and legacy forwards preserve flat fields, responses and target tabs', async () => {
  const h = harness();
  for (const type of ['GET_CHANGES', 'GET_SITE_CHANGES', 'CLEAR_SITE_CHANGES', 'CLEAR_CHANGES']) {
    const response = await h.send({ type: `SP_${type}`, targetTabId: 7 });
    assert.equal(response.routeGroups[0].routeKey, 'https://example.test/a');
    assert.equal(h.forwards.at(-1)?.tabId, 7);
    assert.equal(h.forwards.at(-1)?.message.type, type);
  }
  await h.send({ type: 'SP_CLEAR_ROUTE_CHANGES', targetTabId: 8, routeKey: 'https://other.test/a?x=1' });
  assert.equal(h.forwards.at(-1)?.tabId, 8);
  assert.equal(h.forwards.at(-1)?.message.routeKey, 'https://other.test/a?x=1');
  const count = h.forwards.length;
  assert.equal((await h.send({ type: 'SP_CLEAR_ROUTE_CHANGES', routeKey: null })).ok, false);
  assert.equal(h.forwards.length, count);
});

test('open route checks trusted current tab and preserves query and hash', async () => {
  const h = harness();
  const response = await h.send({ type: 'SP_OPEN_ROUTE', targetTabId: 7, url: 'https://example.test/a?x=1#section' });
  assert.equal(response.ok, true);
  assert.deepEqual(h.updates, [{ tabId: 7, url: 'https://example.test/a?x=1#section' }]);
});

test('open route rejects foreign origins, schemes, credentials and malformed URLs', async () => {
  const h = harness();
  for (const url of ['https://other.test/a', 'https://sub.example.test/a', 'http://example.test/a',
    'https://example.test:444/a', 'https://example.test.attacker.test/a', 'javascript:alert(1)',
    'data:text/html,test', 'file:///test', 'https://user:pass@example.test/a', '/relative', null]) {
    const response = await h.send({ type: 'SP_OPEN_ROUTE', targetTabId: 7, url, origin: 'https://other.test' });
    assert.equal(response.ok, false, String(url));
    assert.equal(typeof response.error, 'string');
  }
  assert.equal(h.updates.length, 0);
});

test('open route rejects page senders, unavailable tabs and opaque current origins', async () => {
  const h = harness();
  const message = { type: 'SP_OPEN_ROUTE', targetTabId: 7, url: 'https://example.test/a' };
  for (const sender of [{ ...h.sender, url: 'https://example.test' }, { ...h.sender, id: 'other-extension' }]) {
    assert.equal((await h.send(message, sender, false)).ok, false);
  }
  for (const targetTabId of [undefined, -1, 1.5, 99]) {
    assert.equal((await h.send({ ...message, targetTabId }, h.sender, targetTabId === undefined || targetTabId === 99)).ok, false);
  }
  for (const url of [undefined, 'file:///test', 'about:blank']) {
    h.tabs.set(7, { url });
    assert.equal((await h.send(message)).ok, false);
  }
  h.tabs.set(7, { url: 'https://example.test/a', pendingUrl: 'https://other.test' });
  assert.equal((await h.send(message)).ok, false);
  assert.equal(h.updates.length, 0);
});

test('concurrent navigation requests keep their own target tabs', async () => {
  const h = harness();
  const results = await Promise.all([
    h.send({ type: 'SP_OPEN_ROUTE', targetTabId: 7, url: 'https://example.test/a' }),
    h.send({ type: 'SP_OPEN_ROUTE', targetTabId: 8, url: 'https://other.test/b' }),
  ]);
  assert.equal(results.every(result => result.ok), true);
  assert.deepEqual(h.updates, [{ tabId: 7, url: 'https://example.test/a' }, { tabId: 8, url: 'https://other.test/b' }]);
});
