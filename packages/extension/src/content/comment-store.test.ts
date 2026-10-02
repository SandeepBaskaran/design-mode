import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentStore } from '../background/comment-store.ts';
import type { CommentData } from './comments.ts';

const pageA = 'https://example.test/a';
const pageB = 'https://example.test/b';
const comment = (id: string, pageUrl = pageA): CommentData => ({
  id, pageUrl, elementId: 'element', selector: 'p', text: id, timestamp: 1, updatedAt: 1,
});

function fixture(initial: any[] = []) {
  let data = structuredClone(initial);
  let failGet = false, failSet = false;
  let writes = 0;
  const storage = {
    async get() {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (failGet) { failGet = false; throw new Error('Storage unavailable'); }
      return { 'dm-comments': structuredClone(data) };
    },
    async set(value: Record<string, CommentData[]>) {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (failSet) { failSet = false; throw new Error('Quota exceeded'); }
      data = structuredClone(value['dm-comments']); writes++;
    },
  };
  return {
    storage: storage as unknown as Pick<typeof chrome.storage.local, 'get' | 'set'>,
    data: () => data, writes: () => writes,
    failRead: () => { failGet = true; }, failWrite: () => { failSet = true; },
  };
}

it('serializes concurrent tab saves without losing any comments', async () => {
  const f = fixture();
  const store = createCommentStore(f.storage);
  await Promise.all(Array.from({ length: 40 }, (_, i) => store({ href: i % 2 ? pageA : pageB,
    action: 'add', comment: comment(String(i), i % 2 ? pageA : pageB),
  }, i % 2 ? pageA : pageB)));
  assert.equal(f.data().length, 40);
  assert.equal(new Set(f.data().map(c => c.id)).size, 40);
  assert.equal((await store({ href: pageA, action: 'read' }, pageA)).filter(c => c.pageUrl === pageA).length, 20);
  assert.equal((await store({ href: pageB, action: 'read' }, pageB)).filter(c => c.pageUrl === pageB).length, 20);
});

it('merges simultaneous text, resolve and pin changes instead of stale array replacement', async () => {
  const f = fixture([comment('one')]);
  const store = createCommentStore(f.storage);
  await Promise.all([
    store({ href: pageA, action: 'update', id: 'one', text: 'edited' }, pageA),
    store({ href: pageA, action: 'resolve', id: 'one', resolved: true }, pageA),
    store({ href: pageA, action: 'offset', id: 'one', offset: { x: 7, y: 8 } }, pageA),
  ]);
  assert.equal(f.data()[0].text, 'edited');
  assert.equal(f.data()[0].resolved, true);
  assert.deepEqual(f.data()[0].pinOffset, { x: 7, y: 8 });
  await store({ href: pageA, action: 'offset', id: 'one', offset: null }, pageA);
  assert.equal('pinOffset' in f.data()[0], false);
});

it('page replacement, delete and add keep other pages and duplicate imported ids isolated', async () => {
  const f = fixture([comment('same'), comment('same', pageB)]);
  const store = createCommentStore(f.storage);
  await Promise.all([
    store({ href: pageA, action: 'replace-route', comments: [comment('imported')] }, pageA),
    store({ href: pageB, action: 'add', comment: comment('new', pageB) }, pageB),
    store({ href: pageA, action: 'delete', id: 'same' }, pageA),
  ]);
  assert.deepEqual(f.data().map(c => [c.pageUrl, c.id]), [
    [pageB, 'same'], [pageA, 'imported'], [pageB, 'new'],
  ]);
  await store({ href: pageA, action: 'replace-route', comments: [] }, pageA);
  assert.equal(f.data().length, 2);
});

it('rejects failed reads without overwriting stored data and allows retry', async () => {
  const f = fixture([comment('existing')]);
  const store = createCommentStore(f.storage);
  f.failRead();
  await assert.rejects(store({ href: pageA, action: 'add', comment: comment('new') }, pageA), /Storage unavailable/);
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.data(), [comment('existing')]);
  await store({ href: pageA, action: 'add', comment: comment('new') }, pageA);
  assert.equal(f.data().length, 2);
});

it('rejects failed writes and drains subsequent queued mutations from durable state', async () => {
  const f = fixture([comment('one')]);
  const store = createCommentStore(f.storage);
  f.failWrite();
  const failed = store({ href: pageA, action: 'update', id: 'one', text: 'not saved' }, pageA);
  const later = store({ href: pageA, action: 'resolve', id: 'one', resolved: true }, pageA);
  await assert.rejects(failed, /Quota exceeded/);
  await later;
  assert.equal(f.data()[0].text, 'one');
  assert.equal(f.data()[0].resolved, true);
});

it('reloads committed data after owner recreation and makes same-id add retries idempotent', async () => {
  const f = fixture();
  await createCommentStore(f.storage)({ href: pageA, action: 'add', comment: comment('one') }, pageA);
  const restarted = createCommentStore(f.storage);
  await restarted({ href: pageA, action: 'add', comment: comment('one') }, pageA);
  assert.equal((await restarted({ href: pageA, action: 'read' }, pageA)).filter(c => c.pageUrl === pageA).length, 1);
});

it('preserves the old page on a failed import and rejects malformed payloads', async () => {
  const f = fixture([comment('original')]);
  const store = createCommentStore(f.storage);
  f.failWrite();
  await assert.rejects(store({ href: pageA, action: 'replace-route', comments: [comment('replacement')] }, pageA), /Quota exceeded/);
  assert.deepEqual(f.data(), [comment('original')]);
  await assert.rejects(store({ href: pageA, action: 'add', comment: { id: 'bad' } as CommentData }, pageA), /Invalid comment/);
  assert.equal(f.writes(), 0);
});

it('normalizes missing updatedAt in stored and imported legacy comments', async () => {
  const { updatedAt: _, ...legacy } = comment('legacy');
  const f = fixture([legacy]);
  const store = createCommentStore(f.storage);
  assert.equal((await store({ href: pageA, action: 'read' }, pageA)).filter(c => c.pageUrl === pageA)[0].updatedAt, legacy.timestamp);
  await store({ href: pageB, action: 'add', comment: comment('other', pageB) }, pageB);
  assert.equal(f.data()[0].updatedAt, legacy.timestamp);
  await store({ href: pageA, action: 'replace-route', comments: [legacy as CommentData] }, pageA);
  assert.equal((await store({ href: pageA, action: 'read' }, pageA)).filter(c => c.pageUrl === pageA)[0].updatedAt, legacy.timestamp);
});

it('isolates damaged pages and preserves malformed records through recovery and restart', async () => {
  const damaged = { ...comment('damaged'), text: { original: 'keep every byte' } };
  const orphan = { unknown: ['unattributed', 42] };
  const f = fixture([damaged, orphan, null, comment('healthy', pageB)]);
  const store = createCommentStore(f.storage);
  assert.equal((await store({ href: pageB, action: 'read' }, pageB)).filter(c => c.pageUrl === pageB)[0].id, 'healthy');
  await store({ href: pageB, action: 'update', id: 'healthy', text: 'changed' }, pageB);
  assert.ok(f.data().some(c => JSON.stringify(c) === JSON.stringify(damaged)));
  await assert.rejects(store({ href: pageA, action: 'read' }, pageA), /Clear or import/);
  f.failWrite();
  await assert.rejects(store({ href: pageA, action: 'replace-route', comments: [] }, pageA), /Quota/);
  await assert.rejects(store({ href: pageA, action: 'read' }, pageA), /Clear or import/);
  await store({ href: pageA, action: 'replace-route', comments: [comment('recovered')] }, pageA);
  const restarted = createCommentStore(f.storage);
  assert.deepEqual((await restarted({ href: pageA, action: 'read' }, pageA)).filter(c => c.pageUrl === pageA).map(c => c.id), ['recovered']);
  assert.deepEqual(f.data().find(c => c?.quarantinedPageUrl === pageA).record, damaged);
  assert.ok(f.data().some(c => JSON.stringify(c) === JSON.stringify(orphan)));
  assert.ok(f.data().includes(null));
  await restarted({ href: pageA, action: 'replace-route', comments: [] }, pageA);
  assert.deepEqual(f.data().find(c => c?.quarantinedPageUrl === pageA).record, damaged);
  assert.equal((await restarted({ href: pageB, action: 'read' }, pageB)).filter(c => c.pageUrl === pageB)[0].text, 'changed');
});

it('does not resurrect a deleted comment from a stale edit', async () => {
  const f = fixture([comment('one')]);
  const store = createCommentStore(f.storage);
  await store({ href: pageA, action: 'delete', id: 'one' }, pageA);
  await assert.rejects(store({ href: pageA, action: 'update', id: 'one', text: 'stale' }, pageA), /no longer exists/);
  assert.deepEqual(f.data(), []);
});
