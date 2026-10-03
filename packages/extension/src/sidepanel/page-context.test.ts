import { runInspectorAction } from './inspector-operation';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

it('Changes ignores old URLs, child frames, other tabs and navigating documents', () => {
  const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
  const statement = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)
    && n.expression.expression.getText(ast) === 'browser.runtime.onMessage.addListener');
  assert.ok(statement);
  let handler: any;
  const state = vm.createContext({ runInspectorAction, myTabId: 7, boundPageUrl: 'https://page.test/a?q=1#one',
    pageNavigating: false, pageUnavailable: false, changesRequest: 0, routeEditingBlocked: false,
    resetChangesRoute: (url: string) => { assert.equal(url, 'https://page.test/a?q=1#one'); },
    styleChanges: [], textChanges: [], domChanges: [], comments: [], tokenChanges: [], componentContexts: {},
    refreshChanges: async () => {}, render() {}, browser: { runtime: { onMessage: { addListener: (fn: any) => { handler = fn; } } } },
  });
  vm.runInContext(ts.transpile(statement.getText(ast), { target: ts.ScriptTarget.ES2022 }), state);
  const message = { type: 'CHANGES_UPDATE', comments: [{ text: 'stale' }] };
  const sender = { tab: { id: 7 }, frameId: 0, url: state.boundPageUrl };
  for (const candidate of [
    { ...sender, url: 'https://page.test/b' }, { ...sender, url: 'https://page.test/a?q=2#one' },
    { ...sender, url: 'https://page.test/a?q=1#two' }, { ...sender, frameId: 4 }, { ...sender, tab: { id: 8 } },
  ]) { handler(message, candidate); assert.equal(state.comments.length, 0); }
  state.pageNavigating = true; handler(message, sender); assert.equal(state.comments.length, 0);
  state.pageNavigating = false; state.pageUnavailable = true; handler(message, sender); assert.equal(state.comments.length, 0);
  state.pageUnavailable = false; handler(message, sender); assert.equal(state.comments[0].text, 'stale');
  handler({ type: 'CHANGES_UPDATE', comments: [] }, sender); assert.equal(state.comments.length, 0);
});

it('content cannot label a delayed old-page comment read as the new URL', async () => {
  const source = readFileSync(new URL('../content/index.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('content.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'getChangesPayload');
  assert.ok(fn);
  const reads: Array<{ url: string; finish: (groups: unknown[]) => void }> = [];
  const location = { href: 'https://page.test/a' };
  let active = location.href;
  let generation = 0;
  const context = vm.createContext({
    location, pendingRouteReplay: null,
    ensureActiveRoute: async () => { if (active !== location.href) { active = location.href; generation++; } },
    getActiveRouteUrl: () => active, getRouteGeneration: () => generation,
    routeIdentity: (url: string) => ({ url, routeKey: url }), canEditRoute: () => true,
    getSiteRouteGroups: () => new Promise(finish => { reads.push({ url: active, finish }); }),
    buildChangesPayload: (comments: unknown[]) => ({ comments, styleChanges: [], textChanges: [], domChanges: [] }),
    getChangeComponentContexts: () => ({}), getTokenEdits: () => [],
  });
  vm.runInContext(ts.transpile(fn.getText(ast), { target: ts.ScriptTarget.ES2022 }), context);
  const pending = context.getChangesPayload();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads[0].url, 'https://page.test/a');
  location.href = 'https://page.test/b';
  reads[0].finish([{ comments: [{ text: 'Only page A', elementId: '' }], styleChanges: [], textChanges: [], domChanges: [] }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads.length, 2);
  assert.equal(reads[1].url, 'https://page.test/b');
  reads[1].finish([{ comments: [{ text: 'Only page B', elementId: '' }], styleChanges: [], textChanges: [], domChanges: [] }]);
  const payload = await pending;
  assert.equal(payload.url, 'https://page.test/b');
  assert.deepEqual(payload.comments.map((comment: any) => comment.text), ['Only page B']);
});
