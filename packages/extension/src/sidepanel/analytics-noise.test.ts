import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ANALYTICS_SCHEMA_VERSION, boundedEvent, changeCountBucket, commandOutcome, messageFeatures, pageSchemeFromUrl, styleAnalytics, styleAnalyticsList, thrownFailure } from '../platform/analytics.ts';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const content = readFileSync(new URL('../content/index.ts', import.meta.url), 'utf8');
const run = (code: string, context: any) => runInNewContext(transformSync(code, { loader: 'ts' }).code, context);
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function sender(response: unknown = { ok: true }) {
  const events: any[] = [];
  let now = 5_000_000;
  const sendSource = source.slice(source.indexOf('async function send('), source.indexOf('// file:// URLs have an empty hostname'));
  const context: any = {
    messageFeatures, styleAnalytics, styleAnalyticsList, commandOutcome, thrownFailure, changeCountBucket, pageSchemeFromUrl, Object, Map,
    mcpMode: 'cloud', siteChangeCount: () => 0, boundPageUrl: 'https://example.com/', myTabId: 1, IS_SAFARI: false,
    beginInspectorOperation: () => ({ assertCurrent() {}, wait: (p: Promise<any>) => p, isCurrent: () => true }),
    trackFeature: (e: unknown) => events.push(e), resolveTokenScopeKind: () => 'root', Date: { now: () => now },
    browser: { runtime: { sendMessage: async () => response } },
  };
  run(sendSource + '\nglobalThis.send = send;', context);
  return { events, context, advance: (ms: number) => { now += ms; } };
}

describe('schema 6 retains schema-5 event counting', () => {
  it('is schema 6 and the removed events are gone from the allowlist and the sources', () => {
    assert.equal(ANALYTICS_SCHEMA_VERSION, 6);
    for (const feature of ['theme', 'import', 'feedback_stop']) assert.equal(boundedEvent({ feature, outcome: 'state' }), null, feature);
    for (const type of ['SP_IMPORT_CHANGES', 'SP_STOP_FEEDBACK_SESSION']) assert.equal(Object.hasOwn(messageFeatures, type), false, type);
    assert.doesNotMatch(source, /feature: 'theme'/);
  });

  it('a command reports one outcome, never a separate attempt', async () => {
    const h = sender();
    for (const msg of [{ type: 'SP_UNDO' }, { type: 'SP_REDO' }, { type: 'SP_SET_INSPECT', on: true }, { type: 'SP_SEND_TO_AGENT' }, { type: 'SP_GET_COMPUTED_CSS' }, { type: 'SP_SET_TEXT', text: 'x' }, { type: 'SP_DOM_ACTION', action: 'delete', elementId: 'e' }]) await h.context.send(msg);
    assert.deepEqual(plain(h.events).map((e: any) => [e.feature, e.outcome]), [
      ['undo', 'command_acknowledged'], ['redo', 'command_acknowledged'], ['inspect', 'command_acknowledged'], ['send_to_agent', 'command_acknowledged'],
      ['computed_css', 'command_acknowledged'], ['text', 'command_acknowledged'], ['dom', 'command_acknowledged'],
    ]);
  });

  it('a screenshot command reports only a failure; its result is reported by the clipboard or download event', async () => {
    const ok = sender({ dataUrl: 'data:' });
    await ok.context.send({ type: 'SP_SCREENSHOT', target: 'element' });
    assert.deepEqual(ok.events, []);
    const failed = sender({ ok: false, error: 'No element' });
    await failed.context.send({ type: 'SP_SCREENSHOT', target: 'element' });
    assert.deepEqual(plain(failed.events).map((e: any) => [e.feature, e.outcome, e.error_code]), [['screenshot', 'failure', 'empty_selection']]);
  });

  it('a drag sends one style event per property and outcome, then reports again after the gesture ends', async () => {
    const h = sender();
    for (let i = 0; i < 40; i++) { await h.context.send({ type: 'SP_APPLY_STYLE', property: 'font-size', value: i + 'px' }); h.advance(16); }
    await h.context.send({ type: 'SP_APPLY_STYLE', property: 'opacity', value: '0.5' });
    assert.deepEqual(plain(h.events).map((e: any) => e.prop), ['font-size', 'opacity']);
    h.advance(2500);
    await h.context.send({ type: 'SP_APPLY_STYLE', property: 'font-size', value: '20px' });
    assert.equal(h.events.length, 3);
    assert.ok(h.events.every((e: any) => e.outcome === 'command_acknowledged' && e.category));
  });

  it('a failing property is not hidden by earlier successes of the same property', async () => {
    const ok = sender();
    await ok.context.send({ type: 'SP_APPLY_STYLE', property: 'width', value: '1px' });
    const failing = { ...ok, events: ok.events };
    ok.context.browser.runtime.sendMessage = async () => ({ ok: false, error: 'No element selected' });
    await ok.context.send({ type: 'SP_APPLY_STYLE', property: 'width', value: '2px' });
    assert.deepEqual(plain(failing.events).map((e: any) => [e.outcome, e.error_code]), [['command_acknowledged', undefined], ['failure', 'empty_selection']]);
  });
});

describe('dm_mcp_state debounce', () => {
  const slice = source.slice(source.indexOf('const MCP_STATE_STABLE_MS'), source.indexOf('function resolveTokenScopeKind'));
  function mcp() {
    const events: any[] = [];
    const timers: Array<{ at: number; fn: () => void; id: number }> = [];
    let now = 0; let next = 1;
    const context: any = {
      mcpMode: 'cloud', mcpState: 'offline', trackFeature: (e: unknown) => events.push(e),
      setTimeout: (fn: () => void, ms: number) => { const id = next++; timers.push({ at: now + ms, fn, id }); return id; },
      clearTimeout: (id: number) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    };
    run(slice + '\nglobalThis.track = trackMcpState;', context);
    const advance = (ms: number) => { now += ms; for (const t of timers.filter(t => t.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn(); } };
    return { events, context, advance };
  }
  it('reports a state only after it held for 5 seconds, and nothing for a flap that returns', () => {
    const m = mcp();
    m.context.track(); m.advance(4000); assert.equal(m.events.length, 0);
    m.advance(1000); assert.deepEqual(plain(m.events), [{ feature: 'mcp_state', outcome: 'state', mode: 'cloud', state: 'offline' }]);
    // offline -> running -> offline within 5 s: back to the reported state, so nothing is sent.
    m.context.mcpState = 'running'; m.context.track(); m.advance(2000);
    m.context.mcpState = 'offline'; m.context.track(); m.advance(10_000);
    assert.equal(m.events.length, 1);
    // A change that holds is sent once, however often render() calls track.
    m.context.mcpState = 'connected';
    for (let i = 0; i < 20; i++) { m.context.track(); m.advance(100); }
    m.advance(5000);
    assert.deepEqual(plain(m.events).map((e: any) => e.state), ['offline', 'connected']);
  });
});

describe('dm_changes_export reports the clipboard result', () => {
  const slice = source.slice(source.indexOf('function trackCssExport('), source.indexOf('void loadShortcuts()'));
  function exporter(over: Record<string, any> = {}) {
    const events: any[] = []; const toasts: string[] = []; let shortcut: (() => Promise<void>) | undefined; const sent: any[] = [];
    const context: any = {
      trackFeature: (e: unknown) => events.push(e), changeCountBucket, pageSchemeFromUrl, siteChangeCount: () => 3, boundPageUrl: 'http://localhost:3000/',
      IS_SAFARI: false, showCaptureToast: (_k: string, t: string) => toasts.push(t), writeInspectorTextClipboard: async () => true,
      beginInspectorOperation: () => ({ assertCurrent() {}, wait: (p: Promise<any>) => p, isCurrent: () => true }),
      registerShortcut: (_name: string, fn: () => Promise<void>) => { shortcut = fn; },
      send: async (m: any) => { sent.push(m); return { output: '.a{color:red}' }; },
      navigator: { clipboard: { writeText: async () => {} } }, ...over,
    };
    run(slice + '\nglobalThis.cssExport = trackCssExport;', context);
    return { events, toasts, sent, context, press: () => shortcut!() };
  }
  it('panel shortcut: a silent SP_EXPORT, then one clipboard_completed with format css', async () => {
    const e = exporter();
    await e.press();
    assert.equal(e.sent[0].silentAnalytics, true);
    assert.deepEqual(plain(e.events), [{ feature: 'export', format: 'css', outcome: 'clipboard_completed', change_count_bucket: '2-5', page_scheme: 'localhost' }]);
    assert.equal(boundedEvent(e.events[0])?.format, 'css');
  });
  it('a refused clipboard is clipboard_failed with a reason and code; a failed export is unavailable', async () => {
    const denied = exporter({ navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
    await denied.press();
    assert.deepEqual(plain(denied.events).map((e: any) => [e.outcome, e.reason, e.error_code]), [['clipboard_failed', 'rejected', 'clipboard_denied']]);
    assert.deepEqual(denied.toasts, ['Could not copy CSS']);
    const broken = exporter({ send: async () => ({}) });
    await broken.press();
    assert.deepEqual(plain(broken.events).map((e: any) => [e.outcome, e.error_code]), [['clipboard_failed', 'unavailable']]);
  });
  it('the page-side shortcut reports its clipboard result to the panel, which sends the event', () => {
    assert.match(content, /registerShortcut\('export-css'[\s\S]{0,400}notifyPanel\('CSS_EXPORT_RESULT', \{ ok \}\)/);
    assert.match(source, /msg\.type === 'CSS_EXPORT_RESULT'\) \{\s+if \(pipPinned && !isPip\) return;\s+trackCssExport\(!!msg\.ok\);/);
  });
});
