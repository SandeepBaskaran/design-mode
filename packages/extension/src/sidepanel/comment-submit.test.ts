import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
const submit = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'submitComment');
assert.ok(submit);
const javascript = ts.transpile(submit.getText(ast), { target: ts.ScriptTarget.ES2022 });

function composer(response: Record<string, unknown>, extra = {}) {
  const sent: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const context = vm.createContext({
    commentText: 'keep my draft', commentMode: true, commentSubmitting: false,
    editingCommentId: null, regionCommentPending: false,
    send: async (message: Record<string, unknown>) => { sent.push(message); return response; },
    showCaptureToast: (_kind: string, text: string) => errors.push(text),
    refreshChanges: async () => {}, ...extra,
  });
  vm.runInContext(javascript, context);
  return { context, sent, errors, submit: () => vm.runInContext('submitComment()', context) };
}

it('retains draft and region on storage failure so submission can be retried', async () => {
  const c = composer({ error: 'Quota exceeded' }, { regionCommentPending: true });
  await c.submit();
  assert.equal(c.context.commentText, 'keep my draft');
  assert.equal(c.context.commentMode, true);
  assert.equal(c.context.regionCommentPending, true);
  assert.equal(c.context.commentSubmitting, false);
  assert.deepEqual(c.errors, ['Quota exceeded']);
});

it('retains edited comment on disconnected transport instead of delete-and-recreate', async () => {
  const c = composer({}, { editingCommentId: 'existing' });
  await c.submit();
  assert.equal(c.context.editingCommentId, 'existing');
  assert.equal(c.context.commentText, 'keep my draft');
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].type, 'SP_UPDATE_COMMENT');
  assert.equal(c.sent[0].commentId, 'existing');
  assert.equal(c.errors.length, 1);
});

it('clears the composer only after acknowledgement and blocks concurrent duplicate submits', async () => {
  let acknowledge!: (value: unknown) => void;
  const c = composer({}, { send: () => new Promise(resolve => { acknowledge = resolve; }) });
  const first = c.submit();
  await c.submit();
  assert.equal(c.context.commentSubmitting, true);
  assert.equal(c.context.commentText, 'keep my draft');
  acknowledge({ comment: { id: 'saved' } });
  await first;
  assert.equal(c.context.commentMode, false);
  assert.equal(c.context.commentText, '');
  assert.equal(c.context.commentSubmitting, false);
});
