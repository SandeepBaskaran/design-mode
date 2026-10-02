import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createCommentStore } from '../background/comment-store';
import { createSessionStore } from '../background/session-store';
import { routeIdentity, sameRoute, RouteSessionStore, sessionStorageKey } from './route-storage';

function functions(file: string, names: string[]) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return names.map(name => {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node, name);
    return node.getText(ast).replace(/^export /, '');
  }).join('\n');
}
const a = 'https://example.test/a', b = 'https://example.test/b', other = 'https://other.test/a';
const comment = (id: string, pageUrl: string) => ({ id, pageUrl, elementId: id, selector: 'p', text: id, timestamp: 1, updatedAt: 1 });
function fixture(interrupt?: 'comments' | 'session' | 'clear' | 'other-clear' | 'edit', rejectSession = false) {
  const original = [comment('old-a', a), comment('old-b', b), comment('other', other)];
  const oldSession = { styleChanges: [{ elementId: 'old-a' }], textChanges: [], domChanges: [] };
  const originalB = { styleChanges: [{ elementId: 'old-b' }], textChanges: [], domChanges: [] };
  const records: Record<string, any> = {
    'dm-comments': structuredClone(original),
    [sessionStorageKey(a)]: structuredClone(oldSession),
    [sessionStorageKey(b)]: structuredClone(originalB),
  };
  const storage = {
    get: async () => structuredClone(records),
    set: async (value: any) => { Object.assign(records, structuredClone(value)); },
    remove: async (keys: string | string[]) => { for (const key of [keys].flat()) delete records[key]; },
  };
  const writeSession = createSessionStore(storage);
  const routeStore = new RouteSessionStore(() => storage, 100, op => writeSession(op, a));
  const otherStore = new RouteSessionStore(() => storage, 100, op => writeSession(op, a));
  const commentStorage = {
    get: async () => Object.fromEntries(Object.entries(await storage.get()).filter(([key]) => key === 'dm-comments' || key === 'dm-comment-owners')),
    set: (items: Record<string, unknown>) => storage.set(items),
  };
  const store = createCommentStore(commentStorage, storage);
  const writes: string[] = [];
  let interrupted = false, generation = 0;
  let rendered: any[] = [];
  const interruptOnce = async (phase: string) => {
    if (interrupted || !interrupt || (phase !== interrupt && !(phase === 'session' && ['clear', 'other-clear', 'edit'].includes(interrupt)))) return;
    interrupted = true;
    if (interrupt !== 'other-clear') generation++;
    if (interrupt === 'clear' || interrupt === 'other-clear') {
      await (interrupt === 'clear' ? routeStore : otherStore).clearRoute(a);
      await store({ action: 'clear-route', href: a }, a);
    } else if (interrupt === 'edit') {
      routeStore.schedule(a, { styleChanges: [{ elementId: 'new-a' }] as any, textChanges: [], domChanges: [] });
      await routeStore.flush();
      await store({ action: 'replace-route', href: a, comments: [comment('new-a', a)] }, a);
    } else context.location.href = b;
  };
  const context: any = vm.createContext({
    structuredClone, routeIdentity, sameRoute,
    location: { href: a }, window: {}, importInProgress: false, pendingRouteReplay: null,
    dmIsActiveInstance: () => true, canEditRoute: () => true,
    getActiveRouteUrl: () => context.location.href, getRouteGeneration: () => generation,
    validateImportPayload: (value: any) => value,
    getStyleChanges: () => context.location.href === a ? oldSession.styleChanges : originalB.styleChanges,
    getTextChanges: () => [], getDomChanges: () => [], getTokenEdits: () => [], undoStack: [], redoStack: [],
    getPageComments: async () => records['dm-comments'].filter((c: any) => sameRoute(c.pageUrl, context.location.href)),
    requestComments: async (op: any) => { writes.push(op.href); const saved = await store(op, a); if (op.action === 'replace-route') await interruptOnce('comments'); return saved; },
    activeRouteUrl: a, routeStore,
    captureImportDomRollback: () => () => {}, captureCommentPinsRollback: () => () => {},
    captureTrackerRollback: () => () => {}, captureTokenRollback: () => () => {},
    setOverridesEnabled() {}, restoreOriginalPreview() {}, revertAllPageMutations() {}, clearAllChanges() {},
    applyChangesPayload() {}, clearAllTokenEdits() {}, clearAllLayoutGuides() {}, requestStopFeedback() {},
    renderPageComments: (comments: any[]) => { rendered = comments; }, buildChangesPayload: (comments: any[]) => ({ comments }),
  });
  context.window.location = context.location;
  vm.runInContext(ts.transpile(functions('./index.ts', ['handleContentMessage']) + '\n' + functions('./comments.ts', ['persistPageComments', 'getPageComments']) + '\n' + functions('./change-tracker.ts', ['persistImportedSession']), { target: ts.ScriptTarget.ES2022 }), context);
  const persist = context.persistImportedSession;
  context.persistImportedSession = async (...args: any[]) => {
    writes.push(args[1]);
    await persist(...args);
    await interruptOnce('session');
    if (rejectSession && interrupted) { rejectSession = false; throw Error('session write failed'); }
  };
  const sessions = { get: (href: string) => {
    const saved = records[sessionStorageKey(href)];
    return saved && { styleChanges: saved.styleChanges, textChanges: saved.textChanges, domChanges: saved.domChanges };
  } };
  return { context, records, storage, routeStore, store, original, oldSession, originalB, sessions, writes, all: () => records['dm-comments'], rendered: () => rendered,
    run: () => new Promise<any>(resolve => context.handleContentMessage({ type: 'IMPORT_CHANGES', payload: { styleChanges: [], textChanges: [], domChanges: [], comments: [comment('imported', other)] } }, {}, resolve)),
  };
}

for (const action of ['clear', 'other-clear', 'edit'] as const) {
  it(`completed ${action} during session acknowledgement is not resurrected by compensation`, async () => {
    const f = fixture(action);
    const result = await f.run();
    assert.equal(result.ok, false);
    assert.deepEqual(f.all().filter((c: any) => c.pageUrl === a).map((c: any) => c.id), action === 'edit' ? ['new-a'] : []);
    assert.deepEqual(f.sessions.get(a)?.styleChanges.map((c: any) => c.elementId) ?? [], action === 'edit' ? ['new-a'] : []);
    assert.deepEqual(f.sessions.get(b), f.originalB);
  });
}

it('successful import returns and renders only captured-route comments, preserving other routes and origins', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.comments.map((c: any) => c.id), ['imported']);
  assert.deepEqual(f.rendered().map(c => c.pageUrl), [a]);
  assert.deepEqual(f.all().filter(c => c.pageUrl !== a), f.original.filter(c => c.pageUrl !== a));
});

for (const stage of ['comments', 'session'] as const) {
  for (const reject of stage === 'session' ? [false, true] : [false]) {
    it(`navigation during ${stage} acknowledgement${reject ? ' rejection' : ''} restores A without touching B`, async () => {
      const f = fixture(stage, reject);
      const result = await f.run();
      assert.equal(result.ok, false);
      assert.match(result.error, /Page route changed|session write failed/);
      assert.deepEqual(f.all().sort((x, y) => x.id.localeCompare(y.id)), f.original.sort((x, y) => x.id.localeCompare(y.id)));
      assert.deepEqual(f.sessions.get(a), f.oldSession);
      assert.deepEqual(f.sessions.get(b), f.originalB);
      assert.ok(f.writes.every(href => href === a));
      assert.deepEqual(f.rendered(), []);
    });
  }
}

for (const target of ['comments', 'session'] as const) {
  for (const committed of [false, true]) {
    it(`${target} ${committed ? 'acknowledgement' : 'write'} failure compensates only the owned import`, async () => {
      const f = fixture();
      const set = f.storage.set;
      let once = true;
      f.storage.set = async value => {
        const affected = target === 'comments' ? value['dm-comments'] : value[sessionStorageKey(a)];
        if (once && affected) {
          once = false;
          if (committed) await set(value);
          throw Error(`${target} failed`);
        }
        await set(value);
      };
      const result = await f.run();
      assert.equal(result.ok, false);
      assert.match(result.error, new RegExp(`${target} failed`));
      assert.deepEqual(f.all().toSorted((x: any, y: any) => x.id.localeCompare(y.id)), f.original.toSorted((x, y) => x.id.localeCompare(y.id)));
      assert.deepEqual(f.sessions.get(a), f.oldSession);
      assert.deepEqual(f.sessions.get(b), f.originalB);
      assert.deepEqual(f.rendered(), []);
    });
  }
}

it('a synchronous DOM failure cannot leave its debounced empty session behind compensation', async () => {
  const f = fixture();
  f.context.clearAllChanges = () => f.routeStore.schedule(a, { styleChanges: [], textChanges: [], domChanges: [] });
  f.context.applyChangesPayload = () => { throw Error('DOM failed'); };
  const result = await f.run();
  assert.equal(result.ok, false);
  assert.match(result.error, /DOM failed/);
  await f.routeStore.flush();
  assert.deepEqual(f.sessions.get(a), f.oldSession);
  assert.deepEqual(f.all().toSorted((x: any, y: any) => x.id.localeCompare(y.id)), f.original.toSorted((x, y) => x.id.localeCompare(y.id)));
});

it('renderer never restamps or prepares foreign route/origin anchors', () => {
  let prepared: any[] = [];
  const incoming = [comment('a', a), comment('b', b), comment('other', other)];
  const context = vm.createContext({ window: { location: { href: a } }, routeIdentity, sameRoute,
    pinGeneration: 0, activeComments: new Map(), pinElements: new Map(), regionBoxes: new Map(), pinsActive: false,
    prepareCommentAnchors: (comments: any[]) => { prepared = comments; },
  });
  vm.runInContext(ts.transpile(functions('./comments.ts', ['renderPageComments']), { target: ts.ScriptTarget.ES2022 }), context);
  context.renderPageComments(incoming);
  assert.deepEqual(prepared, [incoming[0]]);
  assert.deepEqual(incoming.map(c => c.pageUrl), [a, b, other]);
});
