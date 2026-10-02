import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const trackerSource = readFileSync(new URL('./change-tracker.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function fn(name: string) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, name);
  return node.getText(ast);
}
const saved = () => ({
  styleChanges: [{ elementId: 'style', selector: '.styled', property: 'color', oldValue: 'red', newValue: 'blue', state: ':hover', breakpoint: 'mobile', viewportWidth: 390, timestamp: 1 }],
  textChanges: [{ elementId: 'text', selector: '.text', oldText: 'before', newText: 'after', isHtml: true, breakpoint: 'tablet', viewportWidth: 768, timestamp: 2 }],
  domChanges: [{ elementId: 'deleted', selector: '.deleted', action: 'delete', outerHTML: '<p>old</p>', timestamp: 3 }],
});
function harness() {
  let active = 'https://example.com/a';
  let generation = 0;
  let records = saved();
  let nodes = new Map<string, any[]>(['.styled', '.text', '.deleted'].map(s => [s, [{ getAttribute: () => null }]]));
  let mutation = () => {};
  let timeout = () => {};
  let disconnected = false;
  let applied = 0;
  let editable = () => true;
  const context: any = {
    structuredClone,
    setRouteEditGuard: (guard: () => boolean) => { editable = guard; },
    canEditRoute: () => editable(),
    disableInspect() {}, disableMultiSelect() {}, disableShortcuts() {}, teardownMeasureGuides() {}, cancelRegionDraw() {},
    location: { href: 'https://example.com/b' }, window: {}, on: false,
    document: { documentElement: {}, querySelectorAll: (s: string) => s === '*' ? [...nodes.values()].flat() : nodes.get(s) || [] },
    routeIdentity: (url: string) => ({ url, routeKey: new URL(url).pathname }),
    getActiveRouteUrl: () => active, getRouteGeneration: () => generation,
    switchActiveRoute: () => { if (active === context.location.href) return false; active = context.location.href; generation++; return true; },
    loadSession: async () => records,
    getStoredSiteRouteGroups: async () => [{ url: active, styleChanges: [], textChanges: [], domChanges: [], comments: [] }],
    dmIsActiveInstance: () => true,
    MutationObserver: class { constructor(cb: () => void) { mutation = cb; } observe() {} disconnect() { disconnected = true; } },
    setTimeout: (cb: () => void) => { timeout = cb; return 1; }, clearTimeout() {},
    hideCommentPins() {}, clearSelectionToHover() {}, clearAllTokenEdits() {}, clearAllLayoutGuides() {},
    undoStack: [], redoStack: [], notifyPanel() {}, restoreCommentPins: async () => {},
    applyChangesPayload: (payload: any) => { applied++; assert.equal(payload, records); },
    getChangeComponentContexts: () => { if (!applied) throw new Error('Must not inspect outgoing DOM'); return {}; },
    getTokenEdits: () => [],
    buildChangesPayload: () => ({ ...records, refreshed: true }),
    importInProgress: false,
    validateImportPayload: (payload: unknown) => payload,
    getStyleChanges: () => [], getTextChanges: () => [], getDomChanges: () => [],
    getPageComments: async () => [], persistPageComments: async (comments: unknown[]) => comments,
    persistImportedSession: async () => {},
    captureImportDomRollback: () => () => {}, captureCommentPinsRollback: () => () => {},
    captureTrackerRollback: () => () => {}, captureTokenRollback: () => () => {},
    setOverridesEnabled() {}, restoreOriginalPreview() {}, renderPageComments() {}, requestStopFeedback() {},
  };
  const code = source.slice(source.indexOf('let routeTransition:'), source.indexOf('function checkRouteNavigation()')) + '\n' + fn('getChangesPayload') + '\n' + fn('renderStoredRouteMarkdown');
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return {
    context, get applied() { return applied; }, get disconnected() { return disconnected; },
    mutate: () => mutation(), expire: () => timeout(),
    replace: () => { nodes = new Map([...nodes].map(([s]) => [s, [{ getAttribute: () => null }]])); },
    retainOldId: () => { const old = nodes.get('.text')![0]; old.getAttribute = () => 'text'; nodes.set('[data-dm-id]', [old]); },
    clearGeneration: () => generation++,
  };
}

test('GET_CHANGES changes identity and exposes saved records without replaying outgoing text/delete/style', async () => {
  const h = harness();
  const payload = await h.context.getChangesPayload();
  assert.equal(payload.url, 'https://example.com/b');
  assert.equal(payload.textChanges[0].newText, 'after');
  assert.equal(payload.domChanges[0].action, 'delete');
  assert.equal(payload.styleChanges[0].newValue, 'blue');
  assert.equal(h.applied, 0);
  h.mutate();
  assert.equal(h.applied, 0);
});

test('asynchronously replacing the target tree replays once, without a timing assumption', async () => {
  const h = harness();
  await h.context.ensureActiveRoute();
  for (let i = 0; i < 5; i++) { h.mutate(); await Promise.resolve(); }
  assert.equal(h.applied, 0);
  h.replace(); h.mutate();
  assert.equal(h.applied, 1);
  assert.equal(h.disconnected, true);
  h.mutate();
  assert.equal(h.applied, 1);
});

test('no-mutation timeout abandons replay and retains saved data for GET_CHANGES', async () => {
  const h = harness();
  await h.context.ensureActiveRoute();
  h.expire();
  assert.equal(h.disconnected, true);
  h.replace(); h.mutate();
  assert.equal(h.applied, 0);
  assert.equal((await h.context.getChangesPayload()).textChanges.length, 1);
});

test('navigation and clear generations invalidate pending replay', async () => {
  for (const invalidate of [(h: ReturnType<typeof harness>) => { h.context.location.href = 'https://example.com/c'; }, (h: ReturnType<typeof harness>) => h.clearGeneration()]) {
    const h = harness();
    await h.context.ensureActiveRoute();
    invalidate(h); h.replace(); h.mutate();
    assert.equal(h.applied, 0);
    assert.equal(h.disconnected, true);
  }
});

test('an outgoing id-based target blocks replay even when selector targets are new', async () => {
  const h = harness();
  h.retainOldId();
  await h.context.ensureActiveRoute();
  const oldId = h.context.document.querySelectorAll('[data-dm-id]');
  h.replace();
  const query = h.context.document.querySelectorAll;
  h.context.document.querySelectorAll = (s: string) => s === '[data-dm-id]' ? oldId : query(s);
  h.mutate();
  assert.equal(h.applied, 0);
});

test('replacement before storage resolves is checked against the original outgoing nodes', async () => {
  const h = harness();
  let resolve!: (value: ReturnType<typeof saved>) => void;
  h.context.loadSession = () => new Promise(r => { resolve = r; });
  const ready = h.context.ensureActiveRoute();
  h.replace(); h.mutate();
  assert.equal(h.applied, 0);
  let replayed = false;
  h.context.applyChangesPayload = () => { replayed = true; };
  h.context.getChangeComponentContexts = () => ({});
  resolve(saved());
  await ready;
  assert.equal(replayed, true);
});

test('site import preserves the active DOM for inactive-only envelopes and applies active payloads', async () => {
  for (const activePayload of [null, { ...saved(), comments: [] }]) {
    const h = harness();
    let reverts = 0;
    let applies = 0;
    const storage: Record<string, unknown> = {};
    h.context.routeStore = new (await import('./route-storage')).RouteSessionStore(() => ({
      get: async () => structuredClone(storage),
      set: async items => { Object.assign(storage, structuredClone(items)); },
      remove: async keys => { for (const key of [keys].flat()) delete storage[key]; },
    }));
    h.context.persistImportedSession = async (payload: any, _href: string, ownership: any, rollback: boolean) => {
      await h.context.routeStore.writeOwned(ownership, payload, rollback);
    };
    h.context.importSiteChanges = async (_payload: unknown, url: string, deps: any) => {
      assert.equal(url, 'https://example.com/a');
      deps.assertCurrent();
      return { activePayload };
    };
    h.context.replaceRouteComments = async (_url: string, _comments: unknown, guard: () => void) => guard();
    h.context.revertAllPageMutations = () => reverts++;
    h.context.clearAllChanges = () => {};
    h.context.applyChangesPayload = () => applies++;
    h.context.getChangesPayload = async () => ({ refreshed: true });
    vm.runInContext(ts.transpileModule(fn('handleContentMessage'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, h.context);
    h.context.location.href = 'https://example.com/a';
    const result: any = await new Promise(resolve => h.context.handleContentMessage({ type: 'IMPORT_CHANGES', payload: { version: 2, routeGroups: [] } }, null, resolve));
    assert.equal(result.ok, true);
    assert.equal(result.refreshed, true);
    assert.equal(reverts, activePayload ? 1 : 0);
    assert.equal(applies, activePayload ? 1 : 0);
    assert.equal(h.context.importInProgress, false);
  }
});

test('route changes during asynchronous site import abort before active DOM mutation', async () => {
  const h = harness();
  h.context.routeStore = {};
  h.context.replaceRouteComments = async () => {};
  h.context.importSiteChanges = async () => { h.context.location.href = 'https://example.com/c'; return { activePayload: saved() }; };
  h.context.revertAllPageMutations = () => { throw new Error('Unexpected mutation'); };
  vm.runInContext(ts.transpileModule(fn('handleContentMessage'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, h.context);
  h.context.location.href = 'https://example.com/a';
  const result: any = await new Promise(resolve => h.context.handleContentMessage({ type: 'IMPORT_CHANGES', payload: { version: 2 } }, null, resolve));
  assert.equal(result.ok, false);
  assert.match(result.error, /Page route changed during import/);
  assert.equal(h.context.importInProgress, false);
});

test('pending routes reject panel and cloud edits before any DOM access', async () => {
  const h = harness();
  await h.context.ensureActiveRoute();
  vm.runInContext(ts.transpileModule(fn('handleContentMessage') + '\n' + fn('dispatchCloudMessage'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, h.context);
  h.context.getSelectedElementId = () => { throw new Error('Read outgoing selection'); };
  for (const type of ['APPLY_STYLE', 'UNDO', 'REDO', 'ADD_COMMENT', 'SELECT_ELEMENT', 'IMPORT_CHANGES']) {
    let response: any;
    h.context.handleContentMessage({ type }, null, (r: any) => { response = r; });
    assert.equal(response.ok, false);
    assert.match(response.error, /Route rendering/);
  }
  let cloud: any;
  h.context.sendRelayResponse = (_id: string, response: any) => { cloud = response; };
  h.context.dispatchCloudMessage({ type: 'CLOUD_APPLY_CHANGES', requestId: 'synthetic', payload: {} });
  assert.equal(cloud.ok, false);
  h.replace(); h.mutate();
  assert.equal(h.context.canEditRoute(), true);
});

test('agent reports retain destination records before DOM replay', async () => {
  const trackerAst = ts.createSourceFile('change-tracker.ts', trackerSource, ts.ScriptTarget.Latest, true);
  const reportFunction = trackerAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'getSiteChangeReport');
  assert.ok(reportFunction);
  const records = saved();
  const context = vm.createContext({
    exports: {}, activeRouteLoaded: false,
    getSiteRouteGroups: async () => [{ ...records, url: 'https://example.com/b', routeKey: 'https://example.com/b', comments: [] }],
    getChangeReport: () => ({ styleChanges: [], textChanges: [], domChanges: [] }),
    kebab: (s: string) => s,
  });
  vm.runInContext(ts.transpileModule(reportFunction.getText(trackerAst), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const report = await (context as any).exports.getSiteChangeReport();
  assert.equal(report.textChanges[0].newText, 'after');
  assert.equal(report.domChanges[0].action, 'delete');
  assert.equal(report.styleChanges[0].routeKey, 'https://example.com/b');
});

test('inactive markdown preserves both move endpoints, responsive metadata and every stored field without DOM lookup', () => {
  const h = harness();
  h.context.document.querySelectorAll = () => { throw new Error('Inactive export queried current DOM'); };
  const data = saved();
  const group = { url: 'https://example.com/inactive', ...data,
    domChanges: [{ elementId: 'moved', selector: '.card', action: 'move', origin: { parentSelector: '.from', parentId: 'parent-a', index: 2 }, destination: { parentSelector: '.to', parentId: 'parent-b', index: 4 }, breakpoint: 'mobile', viewportWidth: 375, timestamp: 4 }],
    comments: [{ selector: '.card', text: 'Keep ``` this', resolved: true, region: { x: 1, y: 2, w: 3, h: 4 } }],
  };
  const markdown = h.context.renderStoredRouteMarkdown(group);
  assert.match(markdown, /from \.from\[2\] → \.to\[4\]/);
  assert.match(markdown, /mobile · 375px/);
  assert.match(markdown, /tablet · 768px/);
  assert.match(markdown, /red → blue \(:hover\)/);
  const json = markdown.split('````json\n')[1].split('\n````')[0];
  assert.deepEqual(JSON.parse(json), { styleChanges: group.styleChanges, textChanges: group.textChanges, domChanges: group.domChanges, comments: group.comments });
});
