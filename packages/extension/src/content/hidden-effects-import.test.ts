import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImportPayload } from './import-validation';

// Selector parsing is unrelated to the synthetic-property schema exercised here.
(globalThis as any).document = { createDocumentFragment: () => ({ querySelector: () => null }) };
const payload = (newValue: string, oldValue = '') => ({
  styleChanges: [{ id: 'hidden', elementId: 'dm-1', selector: '#target', timestamp: 0,
    property: '__effect_hidden', oldValue, newValue }],
  textChanges: [], domChanges: [], comments: [],
});

test('hidden effect metadata round-trips and accepts undone empty values', () => {
  const value = JSON.stringify([{ id: 'box:2', raw: 'red 1px 2px 3px' }, { id: 'layer-blur:0', raw: 'blur(4px)' }]);
  assert.equal(validateImportPayload(payload(value)).styleChanges[0].newValue, value);
  assert.equal(validateImportPayload(payload('', value)).styleChanges[0].oldValue, value);
});

test('hidden effect metadata rejects malformed IDs, values, and oversized lists', () => {
  for (const value of ['{', '{}', '[null]', '[{"id":"box:-1","raw":"x"}]', '[{"id":"box:NaN","raw":"x"}]', '[{"id":"filter-drop:0","raw":42}]', JSON.stringify(Array.from({length:1001}, () => ({id:'box:0',raw:'x'})))]) {
    assert.throws(() => validateImportPayload(payload(value)));
    assert.throws(() => validateImportPayload(payload('[]', value)));
  }
});
