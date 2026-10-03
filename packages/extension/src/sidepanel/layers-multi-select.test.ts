import { createInspectorOperation, runInspectorAction } from './inspector-operation';
const beginInspectorOperation = () => createInspectorOperation(() => 0, false);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
function harness(mode = false) {
  const start = source.indexOf('async function handleLayerClick(');
  const end = source.indexOf('async function selectParent(', start);
  const state = { beginInspectorOperation, runInspectorAction, layerMultiSelectMode: mode, multiSelectIds: [] as string[], multiSelectAnchor: null as string | null, focused: '',
    getVisibleLayers: () => ['a', 'b', 'c'].map(id => ({ id })),
    pushMultiSelectIds: async (ids: string[]) => { state.multiSelectIds = ids; },
    selectElement: async (id: string) => { state.focused = id; },
  };
  const context = vm.createContext(state);
  vm.runInContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { state, click: (id: string, modifiers = {}) => vm.runInContext(`handleLayerClick(${JSON.stringify(id)}, ${JSON.stringify(modifiers)})`, context) };
}

test('standalone mode adds/removes without modifiers and stays on after removing every layer', async () => {
  const { state, click } = harness(true);
  await click('a'); await click('c');
  assert.deepEqual(Array.from(state.multiSelectIds), ['a', 'c']);
  await click('a'); await click('c');
  assert.equal(state.multiSelectIds.length, 0);
  assert.equal(state.layerMultiSelectMode, true);
  await click('b');
  assert.deepEqual(Array.from(state.multiSelectIds), ['b']);
});

test('plain click, Shift range and Cmd/Ctrl toggle remain available with mode off', async () => {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    const { state, click } = harness();
    await click('a'); await click('c', { [modifier]: true });
    assert.deepEqual(Array.from(state.multiSelectIds), ['a', 'c']);
    await click('b', { shiftKey: true });
    assert.deepEqual(Array.from(state.multiSelectIds), ['a', 'c', 'b']);
    await click('c');
    assert.equal(state.multiSelectIds.length, 0);
    assert.equal(state.multiSelectAnchor, 'c');
  }
});

test('Shift range takes priority over standalone toggle', async () => {
  const { state, click } = harness(true);
  await click('a');
  assert.equal(state.multiSelectAnchor, 'a');
  await click('c', { shiftKey: true });
  assert.deepEqual(Array.from(state.multiSelectIds), ['a', 'b', 'c']);
});

test('toggle is accessible and clear routes through the page synchronization path', () => {
  assert.match(source, /data-dm-action="toggle-layer-multi-select" aria-label="Multi-select layers" aria-pressed=/);
  assert.match(source, /case 'clear-multi-select': \{\s+layerMultiSelectMode = false;\s+runInspectorAction\(pushMultiSelectIds\(\[\], operation\)/);
  assert.match(source, /action === 'clear-selection'\) \{ layerMultiSelectMode = false;[^\n]+pushMultiSelectIds\(\[\], operation\)/);
});
