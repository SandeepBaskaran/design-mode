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
  await Promise.all(Array.from({ length: 40 }, (_, i) => store(i % 2 ? pageA : pageB, {
    kind: 'add', comment: comment(String(i)),
  })));
  assert.equal(f.data().length, 40);
  assert.equal(new Set(f.data().map(c => c.id)).size, 40);
  assert.equal((await store(pageA, { kind: 'read' })).comments.length, 20);
  assert.equal((await store(pageB, { kind: 'read' })).comments.length, 20);
});

it('merges simultaneous text, resolve and pin changes instead of stale array replacement', async () => {
  const f = fixture([comment('one')]);
  const store = createCommentStore(f.storage);
  await Promise.all([
    store(pageA, { kind: 'update', id: 'one', text: 'edited' }),
    store(pageA, { kind: 'resolve', id: 'one', resolved: true }),
    store(pageA, { kind: 'offset', id: 'one', offset: { x: 7, y: 8 } }),
  ]);
  assert.equal(f.data()[0].text, 'edited');
  assert.equal(f.data()[0].resolved, true);
  assert.deepEqual(f.data()[0].pinOffset, { x: 7, y: 8 });
  await store(pageA, { kind: 'offset', id: 'one', offset: null });
  assert.equal('pinOffset' in f.data()[0], false);
});

it('page replacement, delete and add keep other pages and duplicate imported ids isolated', async () => {
  const f = fixture([comment('same'), comment('same', pageB)]);
  const store = createCommentStore(f.storage);
  await Promise.all([
    store(pageA, { kind: 'replacePage', comments: [comment('imported')] }),
    store(pageB, { kind: 'add', comment: comment('new') }),
    store(pageA, { kind: 'delete', id: 'same' }),
  ]);
  assert.deepEqual(f.data().map(c => [c.pageUrl, c.id]), [
    [pageB, 'same'], [pageA, 'imported'], [pageB, 'new'],
  ]);
  await store(pageA, { kind: 'replacePage', comments: [] });
  assert.equal(f.data().length, 2);
});

it('rejects failed reads without overwriting stored data and allows retry', async () => {
  const f = fixture([comment('existing')]);
  const store = createCommentStore(f.storage);
  f.failRead();
  await assert.rejects(store(pageA, { kind: 'add', comment: comment('new') }), /Storage unavailable/);
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.data(), [comment('existing')]);
  await store(pageA, { kind: 'add', comment: comment('new') });
  assert.equal(f.data().length, 2);
});

it('rejects failed writes and drains subsequent queued mutations from durable state', async () => {
  const f = fixture([comment('one')]);
  const store = createCommentStore(f.storage);
  f.failWrite();
  const failed = store(pageA, { kind: 'update', id: 'one', text: 'not saved' });
  const later = store(pageA, { kind: 'resolve', id: 'one', resolved: true });
  await assert.rejects(failed, /Quota exceeded/);
  await later;
  assert.equal(f.data()[0].text, 'one');
  assert.equal(f.data()[0].resolved, true);
});

it('reloads committed data after owner recreation and makes same-id add retries idempotent', async () => {
  const f = fixture();
  await createCommentStore(f.storage)(pageA, { kind: 'add', comment: comment('one') });
  const restarted = createCommentStore(f.storage);
  await restarted(pageA, { kind: 'add', comment: comment('one') });
  assert.equal((await restarted(pageA, { kind: 'read' })).comments.length, 1);
});

it('preserves the old page on a failed import and rejects malformed payloads', async () => {
  const f = fixture([comment('original')]);
  const store = createCommentStore(f.storage);
  f.failWrite();
  await assert.rejects(store(pageA, { kind: 'replacePage', comments: [comment('replacement')] }), /Quota exceeded/);
  assert.deepEqual(f.data(), [comment('original')]);
  await assert.rejects(store(pageA, { kind: 'add', comment: { id: 'bad' } as CommentData }), /Invalid comment operation/);
  assert.equal(f.writes(), 0);
});

it('normalizes missing updatedAt in stored and imported legacy comments', async () => {
  const { updatedAt: _, ...legacy } = comment('legacy');
  const f = fixture([legacy]);
  const store = createCommentStore(f.storage);
  assert.equal((await store(pageA, { kind: 'read' })).comments[0].updatedAt, legacy.timestamp);
  await store(pageB, { kind: 'add', comment: comment('other') });
  assert.equal(f.data()[0].updatedAt, legacy.timestamp);
  await store(pageA, { kind: 'replacePage', comments: [legacy as CommentData] });
  assert.equal((await store(pageA, { kind: 'read' })).comments[0].updatedAt, legacy.timestamp);
});

it('isolates damaged pages and preserves malformed records through recovery and restart', async () => {
  const damaged = { ...comment('damaged'), text: { original: 'keep every byte' } };
  const orphan = { unknown: ['unattributed', 42] };
  const f = fixture([damaged, orphan, null, comment('healthy', pageB)]);
  const store = createCommentStore(f.storage);
  assert.equal((await store(pageB, { kind: 'read' })).comments[0].id, 'healthy');
  await store(pageB, { kind: 'update', id: 'healthy', text: 'changed' });
  assert.ok(f.data().some(c => JSON.stringify(c) === JSON.stringify(damaged)));
  await assert.rejects(store(pageA, { kind: 'read' }), /Clear or import/);
  f.failWrite();
  await assert.rejects(store(pageA, { kind: 'replacePage', comments: [] }), /Quota/);
  await assert.rejects(store(pageA, { kind: 'read' }), /Clear or import/);
  await store(pageA, { kind: 'replacePage', comments: [comment('recovered')] });
  const restarted = createCommentStore(f.storage);
  assert.deepEqual((await restarted(pageA, { kind: 'read' })).comments.map(c => c.id), ['recovered']);
  assert.deepEqual(f.data().find(c => c?.quarantinedPageUrl === pageA).record, damaged);
  assert.ok(f.data().some(c => JSON.stringify(c) === JSON.stringify(orphan)));
  assert.ok(f.data().includes(null));
  await restarted(pageA, { kind: 'replacePage', comments: [] });
  assert.deepEqual(f.data().find(c => c?.quarantinedPageUrl === pageA).record, damaged);
  assert.equal((await restarted(pageB, { kind: 'read' })).comments[0].text, 'changed');
});

it('does not resurrect a deleted comment from a stale edit', async () => {
  const f = fixture([comment('one')]);
  const store = createCommentStore(f.storage);
  await store(pageA, { kind: 'delete', id: 'one' });
  await assert.rejects(store(pageA, { kind: 'update', id: 'one', text: 'stale' }), /no longer exists/);
  assert.deepEqual(f.data(), []);
});
