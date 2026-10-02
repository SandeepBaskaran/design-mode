import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  let report = 'before';
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./move-command.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: () => ({ captureMoveChangeRestore: () => { const saved = report; return () => { report = saved; }; } }) });
  const source: any = { isConnected: true, contains: () => false };
  const parent = () => ({ isConnected: true, insertBefore(el: any, next: any) { el.parentNode = this; el.nextSibling = next; } });
  const a = parent(), b = parent(), anchor = { parentNode: a };
  a.insertBefore(source, anchor);
  return { source, a, b, anchor, begin: () => exports.beginMove(source, 'moving'), setReport: (v: string) => { report = v; }, report: () => report };
}

test('reparent history preserves live identity, sibling anchor and exact report snapshot', () => {
  const f = fixture(), finish = f.begin();
  f.b.insertBefore(f.source, null); f.setReport('after');
  const command = finish();
  assert.equal(command.undo(), true); assert.equal(f.source.parentNode, f.a); assert.equal(f.source.nextSibling, f.anchor); assert.equal(f.report(), 'before');
  assert.equal(command.redo(), true); assert.equal(f.source.parentNode, f.b); assert.equal(f.report(), 'after');
});

test('missing destination or reparented sibling fails without moving or restoring report', () => {
  const f = fixture(), finish = f.begin();
  f.b.insertBefore(f.source, null); f.setReport('after'); const command = finish();
  f.a.isConnected = false; assert.equal(command.undo(), false);
  f.a.isConnected = true; f.anchor.parentNode = f.b; assert.equal(command.undo(), false);
  assert.equal(f.source.parentNode, f.b); assert.equal(f.report(), 'after');
});

test('no-op is not a history entry; repeated moves undo one live location at a time', () => {
  const f = fixture(); assert.equal(f.begin()(), null);
  const first = f.begin(); f.b.insertBefore(f.source, null); f.setReport('first'); const one = first();
  const second = f.begin(); f.a.insertBefore(f.source, null); f.setReport('second'); const two = second();
  assert.equal(two.undo(), true); assert.equal(f.source.parentNode, f.b); assert.equal(f.report(), 'first');
  assert.equal(one.undo(), true); assert.equal(f.source.nextSibling, f.anchor); assert.equal(f.report(), 'before');
  assert.equal(one.redo(), true); assert.equal(two.redo(), true); assert.equal(f.report(), 'second');
});
