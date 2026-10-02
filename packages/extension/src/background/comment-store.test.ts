import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createCommentStore, COMMENT_STORAGE_KEY } from './comment-store';
import type { CommentData } from '../content/comments';

// Exercise the actual content request function without loading DOM helpers.
function contentRequests() {
  const source = readFileSync(new URL('../content/comments.ts', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('let commentWrites:'), source.indexOf('export function loadComments'));
  const context: any = {
    editable: true, messages: [] as unknown[],
    canEditRoute: () => context.editable,
    browser: { runtime: { sendMessage: async (message: unknown) => {
      context.messages.push(message);
      return { ok: true, comments: [] };
    } } },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}

test('content import guard runs after pending requests and never crosses the wire', async () => {
  const h = contentRequests();
  const gate = deferred();
  h.browser.runtime.sendMessage = async (message: unknown) => {
    h.messages.push(message);
    await gate.promise;
    return { ok: true, comments: [] };
  };
  const pending = h.requestComments({ action: 'read', href: A });
  let current = true;
  const replacement = h.requestComments({ action: 'replace-route', href: A, comments: [] }, () => {
    if (!current) throw new Error('stale import');
  });
  await Promise.resolve();
  current = false;
  gate.resolve();
  await pending;
  await assert.rejects(replacement, /stale import/);
  assert.equal(h.messages.length, 1);
  assert.deepEqual(Object.keys(h.messages[0]).sort(), ['operation', 'type']);
});

test('direct content edits reject while rendering is unsafe; clear and import stay allowed', async () => {
  const h = contentRequests();
  h.editable = false;
  for (const action of ['add', 'update', 'resolve', 'offset', 'delete']) {
    await assert.rejects(h.requestComments({ action, href: A }), /reload the destination/);
  }
  for (const action of ['read', 'clear-route', 'clear-site', 'replace-route']) {
    await h.requestComments({ action, href: A });
  }
  assert.equal(h.messages.length, 4);
});

test('content edit guard is checked again after an earlier request settles', async () => {
  const h = contentRequests();
  const gate = deferred();
  h.browser.runtime.sendMessage = async (message: unknown) => {
    h.messages.push(message);
    await gate.promise;
    return { ok: true, comments: [] };
  };
  const pending = h.requestComments({ action: 'read', href: A });
  const update = h.requestComments({ action: 'update', href: A, id: 'a', text: 'new' });
  await Promise.resolve();
  h.editable = false;
  gate.resolve();
  await pending;
  await assert.rejects(update, /reload the destination/);
  assert.equal(h.messages.length, 1);
});

const A = 'https://a.test/route';
const B = 'https://b.test/route';
const comment = (id: string, pageUrl: string): CommentData => ({
  id, pageUrl, elementId: 'element', selector: '#element', text: id, timestamp: 1, updatedAt: 1,
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
function storage(initial: CommentData[] = []) {
  let saved = structuredClone(initial);
  let reads = 0;
  let writes = 0;
  let beforeWrite = async () => {};
  return {
    async get() { reads++; return { [COMMENT_STORAGE_KEY]: structuredClone(saved) }; },
    async set(items: Record<string, unknown>) {
      writes++;
      await beforeWrite();
      saved = structuredClone(items[COMMENT_STORAGE_KEY] as CommentData[]);
    },
    get saved() { return saved; }, get reads() { return reads; }, get writes() { return writes; },
    set beforeWrite(value: () => Promise<void>) { beforeWrite = value; },
  };
}

for (const action of ['clear-site', 'clear-route'] as const) {
  test(`in-flight B write then A ${action} preserves both unrelated B comments`, async () => {
    const disk = storage([comment('a-old', A), comment('b-old', B)]);
    const started = deferred(), release = deferred();
    disk.beforeWrite = async () => { started.resolve(); await release.promise; };
    const run = createCommentStore(disk);
    const writeB = run({ action: 'add', href: B, comment: comment('b-new', B) }, B);
    await started.promise; // The storage.set really is in flight, not merely queued.
    const clearA = run({ action, href: A }, A);
    await Promise.resolve();
    assert.equal(disk.reads, 1, 'clear must not read a snapshot before the B commit');
    release.resolve();
    await Promise.all([writeB, clearA]);
    assert.deepEqual(disk.saved.map(c => c.id), ['b-old', 'b-new']);
  });
}

test('FIFO across origins, including reads and same-origin clear ordering', async () => {
  const disk = storage();
  const run = createCommentStore(disk);
  const operations = [
    run({ action: 'add', href: A, comment: comment('a', A) }, A),
    run({ action: 'add', href: B, comment: comment('b', B) }, B),
    run({ action: 'clear-site', href: A }, A),
    run({ action: 'add', href: A, comment: comment('after-clear', A) }, A),
    run({ action: 'read', href: B }, B),
  ];
  const results = await Promise.all(operations);
  assert.deepEqual(results[4].map(c => c.id), ['b', 'after-clear']);
  assert.equal(disk.writes, 4);
});

test('sender URL exact origin is required; malformed requests never touch storage', async () => {
  const disk = storage([comment('b', B)]);
  const run = createCommentStore(disk);
  for (const sender of [A, 'https://b.test:444/x', 'http://b.test/x', undefined, 'not a URL']) {
    await assert.rejects(run({ action: 'clear-site', href: B }, sender));
  }
  await assert.rejects(run({ action: 'clear-site', href: 'data:text/plain,hello' }, 'data:text/plain,hello'));
  await assert.rejects(run({ action: 'add', href: A, comment: comment('forged', B) }, A));
  await assert.rejects(run({ action: 'replace-route', href: A, comments: [{}] }, A));
  await assert.rejects(run({ action: 'unknown', href: A }, A));
  assert.equal(disk.reads, 0);
  assert.equal(disk.writes, 0);
  assert.deepEqual((await run({ action: 'read', href: B }, B)).map(c => c.id), ['b']);
});

test('route-scoped operations and import restamping preserve other routes and origins', async () => {
  const other = 'https://a.test/other';
  const disk = storage([comment('same-id', A), comment('same-id', other), comment('same-id', B)]);
  const run = createCommentStore(disk);
  await run({ action: 'update', href: A, id: 'same-id', text: 'edited' }, A);
  await run({ action: 'resolve', href: A, id: 'same-id', resolved: true }, A);
  await run({ action: 'offset', href: A, id: 'same-id', offset: { x: 2, y: 3 } }, A);
  assert.equal(disk.saved[0].text, 'edited');
  assert.equal(disk.saved[0].resolved, true);
  assert.deepEqual(disk.saved[0].pinOffset, { x: 2, y: 3 });
  await run({ action: 'offset', href: A, id: 'same-id', offset: null }, A);
  assert.equal('pinOffset' in disk.saved[0], false);
  assert.equal(disk.saved[1].text, 'same-id');
  assert.equal(disk.saved[2].text, 'same-id');
  await run({ action: 'replace-route', href: A, comments: [comment('imported', B)] }, A);
  assert.deepEqual(disk.saved.map(c => c.pageUrl), [other, B, A]);
  await run({ action: 'delete', href: A, id: 'imported' }, A);
  assert.deepEqual(disk.saved.map(c => c.pageUrl), [other, B]);
});

test('storage failure rejects the caller without poisoning later operations', async () => {
  const disk = storage([comment('a', A)]);
  disk.beforeWrite = async () => { throw new Error('disk failed'); };
  const run = createCommentStore(disk);
  await assert.rejects(run({ action: 'clear-site', href: A }, A), /disk failed/);
  disk.beforeWrite = async () => {};
  await run({ action: 'add', href: B, comment: comment('b', B) }, B);
  assert.deepEqual(disk.saved.map(c => c.id), ['a', 'b']);
});

test('a recreated background writer reads persistent records without clearing them', async () => {
  const disk = storage();
  await createCommentStore(disk)({ action: 'add', href: A, comment: comment('a', A) }, A);
  const restarted = createCommentStore(disk);
  assert.deepEqual((await restarted({ action: 'read', href: A }, A)).map(c => c.id), ['a']);
});
