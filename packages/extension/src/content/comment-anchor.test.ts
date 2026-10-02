import { it } from 'node:test';
import assert from 'node:assert/strict';
import { getOrAssignId, reserveIdsAtLeast } from './helpers';

function element(id = '') {
  return {
    getAttribute: () => id || null,
    setAttribute: (_name: string, value: string) => { id = value; },
  } as unknown as HTMLElement;
}

it('reserves saved IDs even when there is no live anchor', () => {
  Object.assign(globalThis, { document: { querySelector: () => null } });
  reserveIdsAtLeast(['dm-400', '', 'not-a-generated-id']);
  assert.equal(getOrAssignId(element()), 'dm-401');
});

it('skips occupied DOM stamps rather than generating a duplicate ID', () => {
  Object.assign(globalThis, { document: {
    querySelector: (selector: string) => selector === '[data-dm-id="dm-402"]' ? element('dm-402') : null,
  } });
  assert.equal(getOrAssignId(element()), 'dm-403');
});

it('adopting an existing stamp reserves it for later allocations', () => {
  Object.assign(globalThis, { document: { querySelector: () => null } });
  assert.equal(getOrAssignId(element('dm-500')), 'dm-500');
  assert.equal(getOrAssignId(element()), 'dm-501');
});

it('large saved IDs cannot exhaust floating-point precision and collide', () => {
  Object.assign(globalThis, { document: { querySelector: () => null } });
  reserveIdsAtLeast(['dm-9007199254740992']);
  assert.equal(getOrAssignId(element()), 'dm-9007199254740993');
  assert.equal(getOrAssignId(element()), 'dm-9007199254740994');
});
