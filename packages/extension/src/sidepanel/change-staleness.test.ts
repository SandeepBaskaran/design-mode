import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeGroupIsStale } from './change-staleness.ts';

const live = new Set(['dm-4']);

test('a new region note on a live element is not stale', () => {
  const group = { elementId: 'dm-4', items: [{ type: 'comment', region: { x: 1, y: 2, w: 3, h: 4 }, pageUrl: 'https://example.com/' }] };
  assert.equal(changeGroupIsStale(group, live, true, 'https://example.com/'), false);
});

test('a free region note is not stale while the page is present', () => {
  const group = { elementId: '', items: [{ type: 'comment', region: { x: 1, y: 2, w: 3, h: 4 } }] };
  assert.equal(changeGroupIsStale(group, live, true, 'https://example.com/'), false);
});

test('a region note is stale after its element is removed', () => {
  const group = { elementId: 'dm-9', items: [{ type: 'comment', region: { x: 1, y: 2, w: 3, h: 4 } }] };
  assert.equal(changeGroupIsStale(group, live, true, 'https://example.com/'), true);
});

test('a region note is stale after the route changes', () => {
  const group = { elementId: '', items: [{ type: 'comment', region: { x: 1, y: 2, w: 3, h: 4 }, pageUrl: 'https://example.com/other' }] };
  assert.equal(changeGroupIsStale(group, live, true, 'https://example.com/'), true);
});

test('an element edit is stale only when its id has left the live tree', () => {
  assert.equal(changeGroupIsStale({ elementId: 'dm-4', items: [{ type: 'style' }] }, live, true), false);
  assert.equal(changeGroupIsStale({ elementId: 'dm-4', items: [{ type: 'style' }] }, new Set(), true), true);
  assert.equal(changeGroupIsStale({ elementId: 'dm-4', items: [{ type: 'style' }] }, new Set(), false), false);
});
