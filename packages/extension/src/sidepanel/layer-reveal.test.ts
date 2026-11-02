import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collapsedAncestorIds, layerScrollDelta } from './layer-reveal.ts';

const tree = [
  { id: 'body', parentId: null },
  { id: 'main', parentId: 'body' },
  { id: 'section', parentId: 'main' },
  { id: 'leaf', parentId: 'section' },
  { id: 'other', parentId: 'body' },
];

describe('collapsedAncestorIds', () => {
  it('returns only the collapsed ancestors of the selected layer, nearest first', () => {
    assert.deepEqual(collapsedAncestorIds(tree, 'leaf', new Set(['main', 'section', 'other'])), ['section', 'main']);
  });
  it('ignores the layer itself and unrelated collapsed branches', () => {
    assert.deepEqual(collapsedAncestorIds(tree, 'leaf', new Set(['leaf', 'other'])), []);
  });
  it('returns nothing for a layer missing from the tree and survives parent cycles', () => {
    assert.deepEqual(collapsedAncestorIds(tree, 'gone', new Set(['main'])), []);
    const cyclic = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }];
    assert.deepEqual(collapsedAncestorIds(cyclic, 'a', new Set(['a', 'b'])), ['b', 'a']);
  });
});

describe('layerScrollDelta', () => {
  const view = { top: 100, bottom: 700 };
  it('does not scroll a row that is fully visible below the sticky header', () => {
    assert.equal(layerScrollDelta({ top: 300, bottom: 330 }, view, 80), 0);
  });
  it('scrolls a row hidden under the sticky header into the visible band', () => {
    const delta = layerScrollDelta({ top: 100, bottom: 130 }, view, 80);
    assert.ok(delta < 0);
    const newTop = 100 - delta;
    assert.ok(newTop >= 180 && newTop + 30 <= 700);
  });
  it('scrolls a row below the viewport up and centres it in the visible band', () => {
    const delta = layerScrollDelta({ top: 1200, bottom: 1230 }, view, 80);
    const newTop = 1200 - delta;
    assert.equal(newTop, 180 + (520 - 30) / 2);
  });
});
