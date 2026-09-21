import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createCommentStore, COMMENT_PAGE_ERROR, COMMENT_STORE_ERROR } from '../background/comment-store.ts';

const source = readFileSync(new URL('../background/index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
const listener = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)
  && n.expression.expression.getText(ast) === 'browser.runtime.onMessage.addListener');
assert.ok(listener);
const code = ts.transpile(listener.getText(ast), { target: ts.ScriptTarget.ES2022 });

it('background handler exposes page-local recovery and preserves damaged data on clear', async () => {
  const pageUrl = 'https://example.test/a';
  const damaged = { id: 'old', pageUrl, text: null };
  let data: unknown[] = [damaged];
  let fail = false;
  const commentStore = createCommentStore({
    get: async () => { if (fail) throw Error('private storage detail'); return { 'dm-comments': structuredClone(data) }; },
    set: async (values: any) => { data = structuredClone(values['dm-comments']); },
  } as any);
  let handler: any;
  const context = vm.createContext({
    Error, COMMENT_PAGE_ERROR, COMMENT_STORE_ERROR, commentStore, currentTargetTab: null,
    browser: { runtime: { id: 'extension', onMessage: { addListener: (fn: any) => { handler = fn; } } } },
  });
  vm.runInContext(code, context);
  const request = (operation: any, url = pageUrl) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('background did not acknowledge')), 500);
    handler({ type: 'COMMENT_STORE', pageUrl: url, operation }, { id: 'extension', tab: { id: 1 } }, (reply: any) => {
      clearTimeout(timer); resolve(reply);
    });
  });
  assert.equal((await request({ kind: 'read' })).error, COMMENT_PAGE_ERROR);
  assert.equal((await request({ kind: 'read' }, 'https://example.test/b')).ok, true);
  fail = true;
  assert.equal((await request({ kind: 'replacePage', comments: [] })).error, COMMENT_STORE_ERROR);
  assert.deepEqual(data, [damaged]);
  fail = false;
  assert.equal((await request({ kind: 'replacePage', comments: [] })).ok, true);
  assert.equal((await request({ kind: 'read' })).ok, true);
  assert.deepEqual(data, [{ quarantinedPageUrl: pageUrl, record: damaged }]);
});
