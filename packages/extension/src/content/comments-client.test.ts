import { it } from 'node:test';
import assert from 'node:assert/strict';

const messages: any[] = [];
let reply: any = { ok: false, error: 'Storage unavailable; retry' };
Object.assign(globalThis, {
  window: { location: { href: 'https://example.test/page' }, addEventListener() {} },
  browser: { runtime: { sendMessage: async (message: unknown) => { messages.push(message); return reply; } } },
});
const comments = import('./comments.ts');

it('content mutations and reads propagate storage rejection without fake success', async () => {
  const { addComment, addRegionComment, updateComment, loadComments, deleteComment } = await comments;
  await assert.rejects(addComment('one', 'p', 'draft'), /Storage unavailable/);
  await assert.rejects(addRegionComment({ x: 0, y: 0, w: 10, h: 10 }, 'p', 'region'), /Storage unavailable/);
  await assert.rejects(updateComment('one', 'edited'), /Storage unavailable/);
  await assert.rejects(loadComments(), /Storage unavailable/);
  await assert.rejects(deleteComment('one'), /Storage unavailable/);
  assert.deepEqual(messages.map(m => m.operation.kind), ['add', 'add', 'update', 'read', 'delete']);
  assert.ok(messages.every(m => m.type === 'COMMENT_STORE' && m.pageUrl === 'https://example.test/page'));
});

it('page persistence does not render pins or access the DOM before acknowledgement', async () => {
  const { persistPageComments } = await comments;
  reply = { ok: false, error: 'Storage unavailable; retry' };
  await assert.rejects(persistPageComments([]), /Storage unavailable/);
  reply = { ok: true, comments: [{ id: 'committed' }], comment: null };
  assert.deepEqual(await persistPageComments([]), [{ id: 'committed' }]);
});

it('allows a caller to retry after storage recovers', async () => {
  const { addComment } = await comments;
  reply = { ok: true, comments: [], comment: null };
  const saved = await addComment('one', 'p', 'draft');
  assert.equal(saved.text, 'draft');
  assert.equal(saved.pageUrl, 'https://example.test/page');
});
