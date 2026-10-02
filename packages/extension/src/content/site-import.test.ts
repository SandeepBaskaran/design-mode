import assert from 'node:assert/strict';
import test from 'node:test';
import { importSiteChanges, validateSiteImport, SITE_IMPORT_LIMITS } from './site-import';
import { RouteSessionStore, sessionStorageKey, type RouteGroup } from './route-storage';

const activeUrl = 'https://example.test/products?sort=new#/details';
const otherUrl = 'https://example.test/products?sort=old#/details';
const change = { id: 'change-1', elementId: 'dm-1', selector: '.shared', timestamp: 1 };
function route(url: string): RouteGroup {
  return {
    routeKey: url, url,
    styleChanges: [{ ...change, property: 'color', oldValue: 'red', newValue: 'blue' }],
    textChanges: [{ ...change, oldText: 'before', newText: 'after' }],
    domChanges: [{ ...change, action: 'move', tagName: 'div', destination: { parentSelector: '.parent', index: 0 } }],
    comments: [{ id: 'comment-1', elementId: 'dm-1', selector: '.shared', text: 'Review', timestamp: 1, updatedAt: 1, pageUrl: url, resolved: false, region: { x: 1, y: 2, w: 3, h: 4 } }],
  };
}
function envelope(groups = [route(activeUrl), route(otherUrl)]) {
  return { kind: 'design-mode-changes', version: 2, url: activeUrl, routeGroups: groups };
}
function harness() {
  const records: Record<string, any> = {};
  const comments = new Map<string, unknown>();
  const writes: string[] = [];
  const store = new RouteSessionStore(() => ({
    async get(key) { return key === null ? { ...records } : { [key]: records[key] }; },
    async set(items) { Object.assign(records, items); writes.push(...Object.keys(items)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete records[key]; },
  }));
  return { records, comments, writes, store, deps: {
    routeStore: store,
    assertCurrent() {},
    async replaceRouteComments(url: string, incoming: unknown, assertCurrent: () => void) { assertCurrent(); comments.set(url, incoming); },
  } };
}

test('round-trips inactive records through the existing store, returns only active route for replay', async () => {
  const h = harness();
  const input = envelope();
  const result = await importSiteChanges(input, activeUrl + '#ignored', h.deps);
  // A second hash is part of the hash-router route, not an ordinary anchor.
  assert.equal(result.activePayload, null);
  const second = harness();
  const imported = await importSiteChanges(input, activeUrl, second.deps);
  assert.deepEqual(imported.activePayload, input.routeGroups[0]);
  assert.deepEqual(imported.inactiveGroups, [input.routeGroups[1]]);
  assert.deepEqual(await second.store.load(otherUrl), {
    styleChanges: input.routeGroups[1].styleChanges,
    textChanges: input.routeGroups[1].textChanges,
    domChanges: input.routeGroups[1].domChanges,
  });
  assert.equal(second.records[sessionStorageKey(activeUrl)], undefined);
  assert.equal(second.comments.has(activeUrl), false);
  assert.deepEqual(second.comments.get(otherUrl), input.routeGroups[1].comments);
  assert.ok(second.records[sessionStorageKey(otherUrl)].savedAt > 0);
});

test('a missing active route does not become an empty replacement payload', async () => {
  const h = harness();
  const result = await importSiteChanges(envelope([route(otherUrl)]), activeUrl, h.deps);
  assert.equal(result.activePayload, null);
  assert.equal(result.inactiveGroups.length, 1);
});

test('validates the entire envelope before scheduling any route or comment mutation', async () => {
  for (const url of ['https://evil.test/a', 'http://example.test/a', 'https://example.test:444/a', 'https://sub.example.test/a', 'https://user:pass@example.test/a']) {
    const h = harness();
    await assert.rejects(importSiteChanges(envelope([route(otherUrl), route(url)]), activeUrl, h.deps));
    await h.store.flush();
    assert.deepEqual(h.writes, []);
    assert.equal(h.comments.size, 0);
  }
});

test('rejects route aliases, duplicate routes and misplaced comments', () => {
  const mismatch = route(otherUrl); mismatch.routeKey = activeUrl;
  const misplaced = route(otherUrl); misplaced.comments[0].pageUrl = activeUrl;
  for (const groups of [[mismatch], [route(otherUrl), route(otherUrl)], [misplaced]]) {
    assert.throws(() => validateSiteImport(envelope(groups), activeUrl));
  }
});

test('ordinary anchors preserve comment URLs but compare as the same route', async () => {
  const plain = route('https://example.test/about');
  plain.url += '#section';
  plain.comments[0].pageUrl += '#comment';
  const h = harness();
  const result = await importSiteChanges(envelope([plain]), 'https://example.test/about#current', h.deps);
  assert.equal(result.activePayload?.comments[0].pageUrl, 'https://example.test/about#comment');
  assert.equal(h.writes.length, 0);
});

test('rejects bad envelopes and malformed entries instead of silently clearing records', () => {
  const cases: unknown[] = [null, {}, { ...envelope(), version: 1 }, { ...envelope(), kind: 'other' }, envelope([]), { ...envelope(), url: 'https://evil.test' }];
  for (const value of [null, {}, { ...change, property: 'color', oldValue: '', newValue: 123 }, { ...change, elementId: '\"] body', property: 'color', oldValue: '', newValue: 'red' }]) {
    const invalid = envelope();
    (invalid.routeGroups[1].styleChanges as unknown[]) = [value];
    cases.push(invalid);
  }
  for (const value of cases) assert.throws(() => validateSiteImport(value, activeUrl));
});

test('reuses safe href validation for attribute edits', () => {
  const input = envelope();
  input.routeGroups[1].textChanges[0] = { ...change, attributeName: 'href', oldText: '/before', newText: 'javascript:alert(1)' };
  assert.throws(() => validateSiteImport(input, activeUrl));
  input.routeGroups[1].textChanges[0].newText = '/after';
  assert.doesNotThrow(() => validateSiteImport(input, activeUrl));
});

test('bounds routes, entries, bytes and numeric fields', () => {
  assert.throws(() => validateSiteImport(envelope(Array.from({ length: SITE_IMPORT_LIMITS.routes + 1 }, (_, i) => route(`https://example.test/${i}`))), activeUrl));
  const oversized = envelope();
  oversized.routeGroups[1].comments[0].text = 'a'.repeat(SITE_IMPORT_LIMITS.bytes);
  assert.throws(() => validateSiteImport(oversized, activeUrl));
  const invalidNumber = envelope(); invalidNumber.routeGroups[1].comments[0].timestamp = Infinity;
  assert.throws(() => validateSiteImport(invalidNumber, activeUrl));
  const many = envelope();
  many.routeGroups[1].styleChanges = Array.from({ length: SITE_IMPORT_LIMITS.entries }, (_, i) => ({ ...many.routeGroups[0].styleChanges[0], id: `s-${i}` }));
  assert.throws(() => validateSiteImport(many, activeUrl), /entry limit/);
});

test('store invalidation is not bypassed by raw inactive route writes', async () => {
  const h = harness();
  const flushing = h.store.flush.bind(h.store);
  h.deps.routeStore.flush = async () => { h.store.invalidate(otherUrl); await flushing(); };
  await importSiteChanges(envelope(), activeUrl, h.deps);
  assert.equal(h.records[sessionStorageKey(otherUrl)], undefined);
});

test('a clear or navigation during the store flush prevents subsequent comments and replay', async () => {
  const h = harness();
  let current = true;
  h.deps.assertCurrent = () => { if (!current) throw new Error('Route changed or cleared'); };
  const flushing = h.store.flush.bind(h.store);
  h.deps.routeStore.flush = async () => {
    h.store.invalidate(otherUrl);
    current = false;
    await flushing();
  };
  await assert.rejects(importSiteChanges(envelope(), activeUrl, h.deps), /changed or cleared/);
  assert.equal(h.records[sessionStorageKey(otherUrl)], undefined);
  assert.equal(h.comments.size, 0);
});

test('storage failures propagate and prevent comment persistence', async () => {
  const h = harness();
  h.deps.routeStore.flush = async () => { h.store.invalidate(otherUrl); throw new Error('storage failed'); };
  await assert.rejects(importSiteChanges(envelope(), activeUrl, h.deps), /storage failed/);
  assert.equal(h.comments.size, 0);
});
