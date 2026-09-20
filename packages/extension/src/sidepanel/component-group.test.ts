import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { componentGroup, groupByComponent } from '../component-group.ts';

describe('component grouping', () => {
  it('groups repeated instances from the same source, preserving element order and IDs', () => {
    const items = [
      { id: 'a', name: 'Card', file: 'src/Card.tsx' },
      { id: 'b', name: 'Header', file: 'src/Header.tsx' },
      { id: 'c', name: 'Card', file: 'src/Card.tsx' },
    ];
    const groups = groupByComponent(items, item => componentGroup(item, item.id));
    assert.deepEqual(groups.map(group => group.items.map(item => item.id)), [['a', 'c'], ['b']]);
    assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c']);
  });

  it('does not conflate same-name components from different files or unknown sources', () => {
    assert.notEqual(componentGroup({ name: 'Card', file: 'a.tsx' }, 'a').key, componentGroup({ name: 'Card', file: 'b.tsx' }, 'b').key);
    assert.notEqual(componentGroup({ name: 'Card' }, 'a').key, componentGroup({ name: 'Card' }, 'b').key);
    assert.equal(componentGroup({ name: 'Card' }, 'a').source, 'Source unverified');
  });

  it('keeps design tokens separate from unavailable/deleted element metadata', () => {
    assert.equal(componentGroup(undefined, 'deleted').label, 'Unattributed elements');
    assert.equal(componentGroup(undefined, ':root', true).label, 'Design tokens');
    assert.notEqual(componentGroup(undefined, ':root', true).key, componentGroup(undefined, 'deleted').key);
  });

  it('handles empty lists and delimiter-like names without key collisions', () => {
    assert.deepEqual(groupByComponent([], () => componentGroup(undefined, '')), []);
    assert.notEqual(componentGroup({ name: 'a:b', file: 'c' }, '1').key, componentGroup({ name: 'b', file: 'c:a' }, '2').key);
  });
});
