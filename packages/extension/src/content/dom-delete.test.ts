import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderDomDeletionTargets } from './dom-delete.ts';

interface FakeElement {
  parentElement: FakeElement | null;
  order: number;
}

describe('DOM multi-delete ordering', () => {
  it('deduplicates IDs, skips stale elements, and deletes descendants before ancestors', () => {
    const root: FakeElement = { parentElement: null, order: 0 };
    const parent: FakeElement = { parentElement: root, order: 1 };
    const child: FakeElement = { parentElement: parent, order: 2 };
    const sibling: FakeElement = { parentElement: root, order: 3 };
    const elements = new Map<string, FakeElement>([
      ['parent', parent],
      ['child', child],
      ['sibling', sibling],
    ]);

    const targets = orderDomDeletionTargets(
      ['parent', 'child', 'sibling', 'child', 'stale'],
      id => elements.get(id) || null,
      (a, b) => b.order - a.order,
    );

    assert.deepEqual(targets.map(target => target.id), ['child', 'sibling', 'parent']);
  });
});
