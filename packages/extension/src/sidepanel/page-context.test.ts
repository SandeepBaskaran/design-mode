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
  const state = vm.createContext({ myTabId: 7, boundPageUrl: 'https://page.test/a?q=1#one',
    pageNavigating: false, pageUnavailable: false,
    styleChanges: [], textChanges: [], domChanges: [], comments: [], tokenChanges: [], componentContexts: {},
    render() {}, browser: { runtime: { onMessage: { addListener: (fn: any) => { handler = fn; } } } },
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
  let finish: (comments: unknown[]) => void = () => {};
  const location = { href: 'https://page.test/a' };
  const context = vm.createContext({ location, getPageComments: () => new Promise(resolve => { finish = resolve; }),
    buildChangesPayload: (comments: unknown[]) => ({ comments, styleChanges: [], textChanges: [], domChanges: [] }),
  });
  vm.runInContext(ts.transpile(fn.getText(ast), { target: ts.ScriptTarget.ES2022 }), context);
  const pending = context.getChangesPayload();
  location.href = 'https://page.test/b';
  finish([{ text: 'Only page A', elementId: '' }]);
  await assert.rejects(pending, /Page changed/);
});
