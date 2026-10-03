import test from 'node:test';
import assert from 'node:assert/strict';
import { createInspectorBrowser } from '../inspector/bridge-client';
import { installInspectorBridge } from '../inspector/bridge-background';
import { eventChannel, INSPECTOR_PORT, MAX_PAYLOAD } from '../inspector/bridge-protocol';
import { createInspectorOperation } from '../sidepanel/inspector-operation';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function fixture(senderOverride: any = {}) {
  let active = { id: 1, windowId: 10, url: 'https://example.test/' };
  const sent: any[] = [], dispatched: any[] = [], bindings: any[] = [], ports: any[] = [];
  const values: Record<string, any> = {};
  let dispatchReply = (msg: any, reply: any) => reply({ target: msg.targetTabId });
  let setValue = async (value: any) => { Object.assign(values, value); };
  const api: any = {
    runtime: { id: 'self', getURL: (p: string) => `safari-web-extension://self/${p}`, onConnect: eventChannel(), onMessage: eventChannel() },
    tabs: { query: async () => [active], sendMessage: async (id: number, msg: any) => { sent.push({ id, ...msg }); return { enabled: true, selectedElement: { id: 'dm-1' } }; }, onActivated: eventChannel(), onUpdated: eventChannel(), onRemoved: eventChannel() },
    windows: { onFocusChanged: eventChannel() },
    storage: { local: { get: async (keys: any) => Object.fromEntries((Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys)).map((key: string) => [key, values[key]])), set: (value: any) => setValue(value), remove: async (keys: string[]) => { for (const key of keys) delete values[key]; } }, onChanged: eventChannel() },
  };
  api.storage.session = api.storage.local;
  api.storage.sync = api.storage.local;
  installInspectorBridge(api, { inject: async () => {}, bind: (port, tab) => bindings.push(tab), dispatch: (msg, sender, reply) => { dispatched.push(msg); dispatchReply(msg, reply); return true; } });
  const native: any = { runtime: { id: 'self', getURL: api.runtime.getURL, connect: ({ name }: any) => {
    assert.equal(name, INSPECTOR_PORT);
    const a: any = { onMessage: eventChannel(), onDisconnect: eventChannel() };
    const b: any = { name, sender: { id: 'self', url: api.runtime.getURL('sidepanel/index.html'), ...senderOverride }, onMessage: eventChannel(), onDisconnect: eventChannel() };
    let closed = false;
    a.postMessage = (msg: any) => { if (closed) throw new Error('disconnected'); queueMicrotask(() => b.onMessage.emit(msg)); };
    b.postMessage = (msg: any) => { if (!closed) queueMicrotask(() => a.onMessage.emit(msg)); };
    a.disconnect = b.disconnect = () => { if (!closed) { closed = true; a.onDisconnect.emit(); b.onDisconnect.emit(); } };
    ports.push(a);
    queueMicrotask(() => api.runtime.onConnect.emit(b));
    return a;
  } } };
  const facade = createInspectorBrowser(native);
  const panel = facade.runtime.connect({ name: 'sidepanel' });
  const events: any[] = [];
  panel.onMessage.addListener(msg => events.push(msg));
  return { api, facade, panel, events, sent, dispatched, bindings, ports, values,
    switchTab() { active = { ...active, id: 2 }; api.tabs.onActivated.emit({ tabId: 2 }); },
    setReply(fn: typeof dispatchReply) { dispatchReply = fn; },
    setWrite(fn: typeof setValue) { setValue = fn; },
  };
}

test('oversized screenshot replies reject promptly instead of silently timing out', async () => {
  const f = fixture(); await tick();
  f.setReply((_msg, reply) => reply({ dataUrl: 'data:image/png;base64,' + 'A'.repeat(MAX_PAYLOAD) }));
  const result = f.facade.runtime.sendMessage({ type: 'SP_SCREENSHOT', target: 'viewport' });
  const rejected = assert.rejects(result, /Inspector response too large/);
  await tick(); await tick();
  f.panel.disconnect();
  await rejected;
});

test('file and privileged pages remain ineligible without demonstrated injection permission', async () => {
  for (const url of ['file:///fixture.html', 'safari://settings', 'about:blank']) {
    const f = fixture(); await tick();
    f.api.tabs.query = async () => [{ id: 1, windowId: 10, url }];
    f.api.windows.onFocusChanged.emit(10); await tick();
    await assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_INSPECT_PAGE' }), /HTTP\(S\)/);
    assert.equal(f.dispatched.length, 0);
    assert.equal(f.events.filter(event => event.type === 'INIT_STATE').at(-1).tabId, null);
    f.panel.disconnect();
  }
});

test('runtime-only facade initializes full state and binds dispatcher, not caller tab', async () => {
  const f = fixture(); await tick();
  assert.equal((f.facade as any).tabs, undefined);
  assert.equal(f.events.at(-1).selectedElement.id, 'dm-1');
  assert.equal(f.events.at(-1).tabId, 1);
  assert.deepEqual(await f.facade.runtime.sendMessage({ type: 'SP_APPLY_STYLE', targetTabId: 999 }), { target: 1 });
  assert.equal(f.dispatched[0].targetTabId, 1);
  f.panel.disconnect(); assert.equal(f.bindings.at(-1), null);
});

test('focus and activation notifications preserve an unchanged active target', async () => {
  const f = fixture(); await tick();
  const initialEvents = f.events.length;
  for (const notify of [
    () => f.api.windows.onFocusChanged.emit(-1),
    () => f.api.windows.onFocusChanged.emit(10),
    () => f.api.tabs.onActivated.emit({ tabId: 1, windowId: 10 }),
    () => f.api.tabs.onActivated.emit({ tabId: 99, windowId: 20 }),
  ]) {
    notify(); await tick();
    assert.equal(f.events.length, initialEvents);
    assert.deepEqual(await f.facade.runtime.sendMessage({ type: 'SP_APPLY_STYLE' }), { target: 1 });
  }
  f.panel.disconnect();
});

test('same-page picks preserve the editor epoch and complete their UI operation', async () => {
  const f = fixture(); await tick();
  let epoch = 0;
  f.panel.onMessage.addListener(msg => { if (msg.type === 'INIT_STATE' && msg.targetChanged) epoch++; });
  for (const type of ['SP_INSPECT_PAGE', 'SP_SET_INSPECT', 'SP_ACTIVATE']) {
    const operation = createInspectorOperation(() => epoch, true);
    assert.deepEqual(await operation.wait(f.facade.runtime.sendMessage({ type, on: true })), { target: 1 });
  }
  assert.equal(epoch, 0);
  assert.equal(f.sent.filter(msg => msg.type === 'ACTIVATE_DESIGN_MODE').length, 1);
  f.panel.disconnect();
});

test('closing a retained Inspector releases its bound page and reopening rebinds', async () => {
  const f = fixture(); await tick();
  await f.facade.runtime.sendMessage({ type: 'SP_PANEL_CLOSING' });
  assert.equal(f.bindings.at(-1), null);
  assert.equal(f.events.at(-1).tabId, null);
  await assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_APPLY_STYLE' }), /target changed/);
  assert.equal(f.dispatched.length, 0);
  await f.facade.runtime.sendMessage({ type: 'SP_ACTIVATE' });
  assert.equal(f.bindings.at(-1), 1);
  assert.equal(f.events.at(-1).tabId, 1);
  f.panel.disconnect();
});

test('closing during binding prevents a late successful bind from restoring inspection', async () => {
  const f = fixture(); await tick(); f.switchTab(); await tick();
  let finish!: (value: any) => void;
  f.api.tabs.sendMessage = () => new Promise(resolve => { finish = resolve; });
  const rejected = assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_ACTIVATE' }), /target changed/);
  await tick();
  await f.facade.runtime.sendMessage({ type: 'SP_PANEL_CLOSING' });
  const eventCount = f.events.length;
  finish({ enabled: true }); await rejected; await tick();
  assert.equal(f.bindings.at(-1), null);
  assert.equal(f.events.length, eventCount);
  assert.equal(f.events.at(-1).tabId, null);
  f.panel.disconnect();
});

test('unauthorized peers cannot read storage or dispatch', async () => {
  for (const sender of [{ id: 'other' }, { tab: { id: 1 } }, { url: 'https://evil.test/sidepanel/index.html' }, { url: 'safari-web-extension://self/sidepanel/index.html?tab=1' }]) {
    const f = fixture(sender); await tick();
    await assert.rejects(f.facade.storage.local.get('dm-theme'));
    assert.equal(f.dispatched.length, 0); assert.equal(f.sent.length, 0);
    f.panel.disconnect();
  }
});

test('allowlists reject generic SP, floating surfaces and private storage', async () => {
  const f = fixture(); await tick();
  for (const type of ['SP_EVIL', 'SP_POP_OUT', 'SP_TRANSITION_BEGIN']) await assert.rejects(f.facade.runtime.sendMessage({ type }));
  await assert.rejects(f.facade.storage.local.get('dm-private'));
  assert.equal(f.dispatched.length, 0);
  f.panel.disconnect();
});

test('tab and navigation changes invalidate mutations; explicit pick rebinds', async () => {
  const f = fixture(); await tick(); f.switchTab(); await tick();
  assert.equal(f.events.at(-1).tabId, null);
  await assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_SET_TEXT', text: 'old' }));
  assert.equal(f.dispatched.length, 0);
  assert.deepEqual(await f.facade.runtime.sendMessage({ type: 'SP_SET_INSPECT', on: true }), { target: 2 });
  f.api.tabs.onUpdated.emit(2, { status: 'loading' }); await tick();
  await assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_UNDO' }));
  f.panel.disconnect();
});

test('in-flight responses are rejected after target changes and disconnect', async () => {
  const f = fixture(); await tick(); let respond: any;
  f.setReply((_msg, reply) => { respond = reply; });
  const result = f.facade.runtime.sendMessage({ type: 'SP_GET_STATE' });
  const rejected = assert.rejects(result); await tick(); f.switchTab(); respond({ stale: true }); await rejected;
  await f.facade.storage.local.set({ 'dm-theme': 'dark' });
  f.setReply((_msg, reply) => { respond = reply; });
  const next = f.facade.runtime.sendMessage({ type: 'SP_INSPECT_PAGE' });
  const disconnected = assert.rejects(next); await tick(); f.ports.at(-1).disconnect(); respond({}); await disconnected;
  f.panel.disconnect();
});

test('storage writes precede reconfigure; tokens are never broadcast', async () => {
  const f = fixture(); await tick(); let finish: any;
  f.setWrite(value => new Promise(resolve => { finish = () => { Object.assign(f.values, value); resolve(); }; }));
  const write = f.facade.storage.local.set({ 'dm-mcp-cloud-token': 'secret' });
  const reload = f.facade.runtime.sendMessage({ type: 'SP_RECONFIGURE_TRANSPORT' });
  await tick(); assert.equal(f.dispatched.length, 0); finish(); await write; await reload;
  const changes: any[] = []; f.facade.storage.onChanged.addListener((change: any) => changes.push(change));
  f.api.storage.onChanged.emit({ 'dm-mcp-cloud-token': { newValue: 'secret' }, 'dm-shortcuts': { newValue: {} } }, 'local');
  await tick(); assert.deepEqual(Object.keys(changes[0]), ['dm-shortcuts']);
  f.panel.disconnect();
});

test('a stale request failure cannot replace a successfully rebound target', async () => {
  const f = fixture(); await tick();
  let finishOld!: (value: any) => void;
  f.setReply((_msg, reply) => { finishOld = reply; });
  const old = f.facade.runtime.sendMessage({ type: 'SP_GET_STATE' });
  const rejected = assert.rejects(old);
  await tick(); f.switchTab(); await tick();
  f.setReply((msg, reply) => reply({ target: msg.targetTabId }));
  await f.facade.runtime.sendMessage({ type: 'SP_SET_INSPECT', on: true });
  assert.equal(f.events.at(-1).type, 'INIT_STATE');
  assert.equal(f.events.at(-1).tabId, 2);
  const eventCount = f.events.length;
  finishOld({ stale: true }); await rejected; await tick();
  assert.equal(f.events.length, eventCount);
  assert.equal(f.events.at(-1).tabId, 2);
  f.panel.disconnect();
});

test('repick reports current bind failures instead of remaining in connecting state', async () => {
  const f = fixture(); await tick(); f.switchTab(); await tick();
  f.api.tabs.sendMessage = async () => { throw new Error('Host access denied'); };
  await assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_SET_INSPECT', on: true }), /Host access denied/);
  await tick();
  assert.equal(f.events.at(-1).type, 'INSPECTOR_ERROR');
  assert.equal(f.events.at(-1).error, 'Host access denied');
  f.panel.disconnect();
});

test('superseded bind failures cannot overwrite the new target state', async () => {
  const f = fixture(); await tick(); f.switchTab(); await tick();
  let rejectBind!: (error: Error) => void;
  f.api.tabs.sendMessage = () => new Promise((_resolve, reject) => { rejectBind = reject; });
  const rejected = assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_SET_INSPECT', on: true }), /Host access denied/);
  await tick(); f.api.tabs.onUpdated.emit(2, { status: 'loading' }); await tick();
  const eventCount = f.events.length;
  rejectBind(new Error('Host access denied')); await rejected; await tick();
  assert.equal(f.events.length, eventCount);
  assert.equal(f.events.at(-1).type, 'INIT_STATE');
  f.panel.disconnect();
});

test('repick reports dispatch failures after a successful bind', async () => {
  const f = fixture(); await tick(); f.switchTab(); await tick();
  f.setReply(() => { throw new Error('Inspect failed'); });
  await assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_SET_INSPECT', on: true }), /Inspect failed/);
  await tick();
  assert.equal(f.events.at(-1).type, 'INSPECTOR_ERROR');
  assert.equal(f.events.at(-1).error, 'Inspect failed');
  f.panel.disconnect();
});

test('navigation completion refreshes state; disconnected peers reconnect without replay', async () => {
  const f = fixture(); await tick();
  f.api.tabs.onUpdated.emit(1, { status: 'loading' });
  f.api.tabs.onUpdated.emit(1, { status: 'complete' }); await tick();
  assert.equal(f.events.at(-1).tabId, 1); assert.equal(f.events.at(-1).enabled, true);
  f.ports.at(-1).disconnect(); await tick();
  assert.equal(f.events.at(-1).type, 'INSPECTOR_ERROR');
  assert.deepEqual(await f.facade.runtime.sendMessage({ type: 'SP_SET_INSPECT', on: true }), { target: 1 });
  assert.equal(f.ports.length, 2); assert.equal(f.dispatched.length, 1);
  f.panel.disconnect();
});

test('events trust sender tab, not forged payload tab, and drop stale navigation', async () => {
  const f = fixture(); await tick(); const events: any[] = [];
  f.facade.runtime.onMessage.addListener(msg => events.push(msg));
  f.api.runtime.onMessage.emit({ type: 'ELEMENT_SELECTED', _dmTab: 1 }, { tab: { id: 9 } });
  f.api.runtime.onMessage.emit({ type: 'ELEMENT_SELECTED', _dmTab: 9 }, { tab: { id: 1 }, url: 'https://example.test/' });
  await tick(); assert.equal(events.length, 1); assert.equal(events[0]._dmTab, 1);
  f.api.tabs.onUpdated.emit(1, { status: 'loading' });
  f.api.runtime.onMessage.emit({ type: 'ELEMENT_SELECTED' }, { tab: { id: 1 } });
  await tick(); assert.equal(events.length, 1); f.panel.disconnect();
});


test('incoming route/comment operations remain target-bound; analytics and preset storage are narrowly allowlisted', async () => {
  const f = fixture(); await tick();
  for (const type of ['SP_UPDATE_COMMENT', 'SP_CLEAR_ROUTE_CHANGES', 'SP_CLEAR_SITE_CHANGES', 'SP_OPEN_ROUTE']) {
    assert.deepEqual(await f.facade.runtime.sendMessage({ type, targetTabId: 999 }), { target: 1 });
  }
  await f.facade.storage.sync.set({ dm_custom_presets: [{ id: 'fixture', styles: { color: 'red' } }] });
  assert.equal((await f.facade.storage.sync.get('dm_custom_presets')).dm_custom_presets[0].id, 'fixture');
  await assert.rejects(f.facade.storage.sync.get('dm-mcp-cloud-token'));
  await assert.rejects(f.facade.storage.local.get('dm_custom_presets'));
  const events: any[] = [];
  f.facade.storage.onChanged.addListener((changes, area) => events.push({ changes, area }));
  f.api.storage.onChanged.emit({ 'dm-analytics-consent-v1': { newValue: { enabled: false } }, 'dm-mcp-cloud-token': { newValue: 'must-not-forward' } }, 'local');
  await tick();
  assert.deepEqual(Object.keys(events[0].changes), ['dm-analytics-consent-v1']);
  f.switchTab(); await tick();
  await assert.rejects(f.facade.runtime.sendMessage({ type: 'SP_UPDATE_COMMENT' }));
  await f.facade.runtime.sendMessage({ type: 'DM_ANALYTICS_STOP' });
  assert.equal(f.dispatched.at(-1).type, 'DM_ANALYTICS_STOP');
  assert.equal(f.dispatched.at(-1).targetTabId, undefined);
  f.panel.disconnect();
});

test('new content error events are forwarded only from the selected main frame', async () => {
  const f = fixture(); await tick();
  const messages: any[] = [];
  f.facade.runtime.onMessage.addListener(message => messages.push(message));
  for (const type of ['COMMENT_ERROR', 'STYLE_OVERRIDE_ERROR']) {
    for (const sender of [{tab: {id: 2}}, {tab: {id: 1}, frameId: 2}, {tab: {id: 1}, url: 'https://other.test/'}]) {
      f.api.runtime.onMessage.emit({type, error: 'untrusted'}, sender);
    }
    f.api.runtime.onMessage.emit({type, error: 'expected'}, {tab: {id: 1}, frameId: 0, url: 'https://example.test/'});
  }
  await tick();
  assert.deepEqual(messages.map(message => message.type), ['COMMENT_ERROR', 'STYLE_OVERRIDE_ERROR']);
  assert.ok(messages.every(message => message.error === 'expected'));
  f.panel.disconnect();
});
