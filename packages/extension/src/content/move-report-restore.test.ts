import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(rows: any[]) {
  const source = readFileSync(new URL('./change-tracker.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function captureMoveChangeRestore'), source.indexOf('export function getAllChanges'));
  const js = ts.transpileModule(body.replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sent: any[] = []; let persisted = 0;
  const capture = vm.runInThisContext(`(function(domChanges, persistSession, syncAllChanges) { ${js}; return captureMoveChangeRestore; })`)(
    rows, () => persisted++, () => sent.push(structuredClone(rows)),
  );
  return { capture, sent, persisted: () => persisted };
}

test('move restore keeps unrelated ledger order and synchronizes restored report', () => {
  const a = { id: 'a', elementId: 'a', action: 'move', origin: { index: 0 }, destination: { index: 1 } };
  const b = { id: 'b', elementId: 'b', action: 'move' };
  const c = { id: 'c', elementId: 'c', action: 'remove' };
  const rows: any[] = [a, b, c]; const f = fixture(rows);
  const restore = f.capture('a');
  rows[0] = { ...a, destination: { index: 2 } };
  restore();
  assert.deepEqual(rows, [a, b, c]);
  assert.equal(rows[1], b); assert.equal(rows[2], c);
  assert.deepEqual(f.sent, [[a, b, c]]); assert.equal(f.persisted(), 1);
});

test('undoing first move synchronizes its removal without discarding a sibling edit', () => {
  const rows: any[] = [{ id: 'sibling', elementId: 's', action: 'move' }];
  const f = fixture(rows), restore = f.capture('a');
  rows.push({ id: 'a', elementId: 'a', action: 'move' });
  restore();
  assert.equal(rows.length, 1); assert.equal(rows[0].id, 'sibling');
  assert.deepEqual(f.sent, [rows]);
});
