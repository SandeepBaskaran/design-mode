import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
let branch: ts.IfStatement | undefined;
function visit(n: ts.Node) {
  if (ts.isIfStatement(n) && n.expression.getText(ast) === 'importChangesInput && importChangesInput.files?.[0]') branch = n;
  ts.forEachChild(n, visit);
}
visit(ast);
assert.ok(branch);
const code = ts.transpile(`async function importFile() { ${branch.getText(ast)} }`, { target: ts.ScriptTarget.ES2022 });
function fixture(parsed: unknown, ok = true, size = 100) {
  const sent: any[] = [], toasts: any[] = [];
  let read = false;
  const context = vm.createContext({
    importChangesInput: { files: [{ size }], value: 'file' },
    FileReader: class { onload: any; readAsText() { read = true; this.onload({ target: { result: JSON.stringify(parsed) } }); } },
    styleChanges: ['old'], textChanges: ['old'], domChanges: ['old'], comments: ['old'], tokenChanges: ['old-token'],
    editedTokens: new Map([['old', true]]), batchAppliedChanges: new Set(['old']), changesSelected: new Set(['old']),
    componentContexts: { old: true }, render: () => {},
    send: async (message: any) => {
      sent.push(message);
      return ok ? { ok: true, styleChanges: [], textChanges: [], domChanges: [], comments: [], tokenChanges: [] } : { ok: false, error: 'Rejected' };
    },
    showCaptureToast: (...args: any[]) => toasts.push(args),
  });
  vm.runInContext(code, context);
  return { context, sent, toasts, read: () => read, run: async () => { await context.importFile(); await new Promise(resolve => setImmediate(resolve)); } };
}
const valid = { version: 1, kind: 'design-mode-changes', styleChanges: [], textChanges: [], domChanges: [], comments: [] };
it('file import rejects oversize files before FileReader allocation', async () => {
  const f = fixture(valid, true, 5 * 1024 * 1024 + 1); await f.run();
  assert.equal(f.read(), false); assert.equal(f.sent.length, 0); assert.equal(f.context.tokenChanges[0], 'old-token');
});
it('file import never converts malformed arrays to destructive empty replacements', async () => {
  const f = fixture({ ...valid, styleChanges: null, textChanges: 'bad' }, false); await f.run();
  assert.equal(f.sent[0].payload.styleChanges, null); assert.equal(f.sent[0].payload.textChanges, 'bad');
  assert.equal(f.context.styleChanges[0], 'old');
});
it('failed file import retains token caches, selections and tracked work', async () => {
  const f = fixture(valid, false); await f.run();
  assert.equal(f.context.tokenChanges[0], 'old-token'); assert.equal(f.context.editedTokens.size, 1);
  assert.equal(f.context.batchAppliedChanges.size, 1); assert.equal(f.context.changesSelected.size, 1);
});
it('successful file replacement clears obsolete panel token caches and selections', async () => {
  const f = fixture(valid); await f.run();
  assert.equal(f.context.tokenChanges.length, 0); assert.equal(f.context.editedTokens.size, 0);
  assert.equal(f.context.batchAppliedChanges.size, 0); assert.equal(f.context.changesSelected.size, 0);
  assert.equal(f.context.styleChanges.length, 0);
});
