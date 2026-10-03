import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createInspectorBrowser } from '../inspector/bridge-client.ts';
import { eventChannel } from '../inspector/bridge-protocol.ts';
import { createInspectorOperation, InspectorOperationCancelled } from './inspector-operation.ts';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['send', 'applyStyle', 'applyStylesBatch', 'applyFillColorProperty', 'dispatchFillLayers']);
const declarations: string[] = [];
parsed.forEachChild(node => {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text || '')) declarations.push(node.getText(parsed));
});
assert.equal(declarations.length, names.size);
const picker = source.slice(source.indexOf('type ColorDrag ='), source.indexOf('function applyTextShadowFromFields'));
const production = ts.transpileModule(declarations.join('\n') + '\n' + picker, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function fixture(prop = '__fill_color__0', kind: 'sv' | 'hue' = 'sv') {
  const listeners: Record<string, (e: any) => void> = {};
  const errors: string[] = [];
  const requests: any[] = [];
  const pending: Promise<any>[] = [];
  const history: any[] = [];
  let inflight = 0, peak = 0;
  let epoch = 0;
  const port: any = { onMessage: eventChannel(), onDisconnect: eventChannel(), disconnect() {},
    postMessage(request: any) {
      requests.push(request.args);
      peak = Math.max(peak, ++inflight);
      // Deliberately slow Inspector/content round trip: page paint + style
      // serialization + transport. Pointer input continues at 120 Hz.
      const work = sleep(180).then(() => {
        if (request.args.type === 'SP_APPLY_STYLES' || request.args.type === 'SP_APPLY_STYLE') history.push(request.args);
        inflight--;
        port.onMessage.emit({ kind: 'reply', id: request.id, value: {} });
      });
      pending.push(work);
    },
  };
  const browser = createInspectorBrowser({ runtime: { connect: () => port, id: 'test', getURL: (p: string) => p } } as any);
  const operation = () => createInspectorOperation(() => epoch, true);
  const state: any = {
    Error, InspectorOperationCancelled, browser, IS_SAFARI: true, myTabId: 1, inspectorError: '', messageFeatures: {},
    trackFeature() {}, commandOutcome: () => ({}), beginInspectorOperation: operation,
    runInspectorAction: (p: Promise<any>) => { const result = p.catch(e => { errors.push(e.message); }); pending.push(result); return result; },
    showCaptureToast: (_kind: string, error: string) => errors.push(error),
    info: { id: 'hero', computedStyles: {} }, colorFormat: 'hex',
    root: { querySelector: () => ({ dataset: { dmColorH: '0' } }) },
    window: { addEventListener: (name: string, fn: any) => { listeners[name] = fn; }, getComputedStyle: () => ({ backgroundColor: 'rgb(255, 0, 0)' }) },
    parseColorRgb: () => [255, 0, 0], rgbToHsv: () => [0, 1, 1],
    hsvToRgb: (h: number, s: number, v: number) => [Math.round(s * 255), Math.round(v * 255), Math.round(h / 360 * 255)],
    rgbToHexStr: (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''),
    cornerRadiusLinked: false, borderWidthLinked: false,
    getFillLayers: () => [{ kind: 'solid', raw: '#000000' }],
    splitColorOpacity: () => ({ opacity: 100 }), combineColorOpacity: (v: string) => v,
    fillLayersByElement: new Map(),
    serializeFillLayers: (layers: any[]) => ({ backgroundColor: layers[0].raw, backgroundImage: 'none', backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: '0% 0%', backgroundBlendMode: 'normal' }),
    withHiddenEffects: (changes: any) => changes,
    render() {}, styleChanges: [], textChanges: [], domChanges: [],
  };
  vm.createContext(state);
  vm.runInContext(production, state);
  const el = { dataset: { dmColorSv: prop, dmColorHue: prop }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const event = (x: number) => ({ clientX: x, clientY: 20, target: { closest: (selector: string) => selector === `[data-dm-color-${kind}]` ? el : null } });
  return { state, errors, requests, history, listeners, event, getPeak: () => peak, switchTarget: () => { epoch++; state.info = { id: 'other', computedStyles: {} }; },
    async settle() { for (let i = 0; i < 12; i++) { await Promise.all(pending); await sleep(20); if (!inflight) return; } throw new Error('drag did not settle'); },
  };
}

it('120 Hz custom fill picker drag bounds live RPCs and retains pointerup value', async t => {
  const f = fixture();
  f.listeners.pointerdown(f.event(0));
  for (let i = 1; i <= 120; i++) { await sleep(8); f.listeners.pointermove(f.event(i % 95)); }
  f.listeners.pointerup(f.event(99));
  await f.settle();
  assert.deepEqual(f.errors, [], 'no overflow or fatal reconnect during a sustained drag');
  assert.equal(f.state.inspectorError, '');
  assert.ok(f.getPeak() <= 1, `one acknowledged colour transaction at a time; peak=${f.getPeak()}`);
  const last = f.history.at(-1);
  const color = last?.changes?.find((c: any) => c.property === 'backgroundColor')?.value ?? last?.value;
  assert.equal(color, '#fccc00', 'pointer release, not an earlier movement, is committed');
  assert.ok(f.history.length >= 2, 'live updates are not deferred until release');
  assert.ok(f.history.every(r => r.type === 'SP_APPLY_STYLES' && r.changes.length === 6), 'fill remains one content-owned undo transaction, not six detached writes');
  t.diagnostic(`122 pointer events; ${f.history.length} acknowledged colour batches; peak RPCs ${f.getPeak()}; final ${color}`);

  // Execute the real content-side batch handler for the emitted transactions.
  // CSSOM/painting is stubbed, but history construction is production code.
  const content = readFileSync(new URL('../content/index.ts', import.meta.url), 'utf8');
  const branch = content.slice(content.indexOf("    case 'APPLY_STYLES': {"), content.indexOf("    case 'APPLY_PARENT_STYLE': {"));
  const historyState: any = {
    undoStack: [], redoStack: [{}], Date, Math,
    getSelectedElementId: () => 'hero', isMultiSelectActive: () => true,
    getMultiSelectIds: () => ['hero', 'peer'], getElementById: (id: string) => ({ id }),
    authoredTokenValueFor: () => undefined,
    window: { getComputedStyle: () => ({ getPropertyValue: () => 'original' }) },
    computeCompanions: () => [], requestAnimationFrame() {},
    getChangesPayload: async () => ({}), whenUserStylesPainted: async () => {}, buildElementInfo: () => ({}),
  };
  const changes = new Map<string, any>();
  historyState.getStyleChanges = () => [...changes.values()];
  historyState.applyWithCompanions = (elementId: string, property: string, newValue: string) => {
    const entry = { id: elementId + property, elementId, property, newValue };
    changes.set(entry.id, entry); return entry;
  };
  vm.createContext(historyState);
  vm.runInContext(ts.transpileModule(`function dispatch(msg, sendResponse) { switch (msg.type) { ${branch} } }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, historyState);
  for (const request of f.history) await new Promise(resolve => historyState.dispatch({ ...request, type: 'APPLY_STYLES' }, resolve));
  assert.equal(historyState.undoStack.length, f.history.length);
  assert.equal(historyState.redoStack.length, 0);
  for (const elementId of ['hero', 'peer']) {
    const entries = historyState.undoStack.map((g: any) => g.entries.find((e: any) => e.elementId === elementId && e.property === 'backgroundColor'));
    assert.equal(entries[0].oldValue, 'original');
    for (let i = 1; i < entries.length; i++) assert.equal(entries[i].oldValue, entries[i - 1].newValue, 'undo chain has no dropped committed colour');
    assert.equal(entries.at(-1).newValue, color);
  }
});

it('queued colour never moves to a newly selected target', async () => {
  const f = fixture();
  f.listeners.pointerdown(f.event(10));
  f.listeners.pointermove(f.event(80));
  f.switchTarget();
  f.listeners.pointerup(f.event(90));
  await f.settle();
  assert.equal(f.requests.length, 1);
});

it('hue drag on a direct CSS colour also coalesces through the real dispatcher', async () => {
  const f = fixture('color', 'hue');
  f.listeners.pointerdown(f.event(0));
  for (let i = 1; i <= 60; i++) { await sleep(8); f.listeners.pointermove(f.event(i)); }
  f.listeners.pointerup(f.event(100));
  await f.settle();
  assert.deepEqual(f.errors, []);
  assert.equal(f.getPeak(), 1);
  assert.equal(f.history.at(-1).value, '#ffffff');
});

it('a second drag cannot overwrite the first drag release', async () => {
  const f = fixture();
  f.listeners.pointerdown(f.event(0));
  f.listeners.pointerup(f.event(100));
  f.listeners.pointerdown(f.event(10));
  f.listeners.pointerup(f.event(50));
  await f.settle();
  const colours = f.history.map(r => r.changes.find((c: any) => c.property === 'backgroundColor').value);
  assert.deepEqual(colours, ['#00cc00', '#ffcc00', '#80cc00']);
  assert.equal(f.getPeak(), 1);
});

it('pointer cancellation drains its last valid movement without inventing a release coordinate', async () => {
  const f = fixture();
  f.listeners.pointerdown(f.event(0));
  f.listeners.pointermove(f.event(50));
  f.listeners.pointercancel(f.event(99));
  await f.settle();
  assert.equal(f.history.at(-1).changes[0].value, '#80cc00');
});

it('temporary Inspector backpressure does not invalidate the healthy connection', async () => {
  const f = fixture();
  f.state.browser.runtime.sendMessage = async () => { throw new Error('Too many Inspector requests'); };
  await assert.rejects(f.state.send({ type: 'SP_GET_STATE' }), /Too many Inspector requests/);
  assert.equal(f.state.inspectorError, '');
});
