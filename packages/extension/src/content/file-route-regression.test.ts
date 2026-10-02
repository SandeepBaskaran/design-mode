import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { createCommentStore, COMMENT_STORAGE_KEY } from '../background/comment-store';
import { RouteSessionStore, routeIdentity, sameRoute, groupSiteChanges, emptyRouteChanges } from './route-storage';
import type { CommentData } from './comments';

const A = 'file:///Users/example/page.html';
const B = 'file:///Users/other/private.html';
const HTTP = 'https://example.test/page.html';
const note = (pageUrl: string, id = 'shared'): CommentData => ({
  id, pageUrl, elementId: 'e', selector: '#e', text: pageUrl, timestamp: 1, updatedAt: 1,
});
function storage() {
  const data: Record<string, any> = {};
  return {
    data,
    async get(key: string | null) { return structuredClone(key === null ? data : { [key]: data[key] }); },
    async set(items: Record<string, unknown>) { Object.assign(data, structuredClone(items)); },
    async remove(keys: string | string[]) { for (const key of [keys].flat()) delete data[key]; },
  };
}

test('file identity is canonical, round-trips and isolates documents rather than null origins', () => {
  for (const href of [A, A + '?q=1#/route', 'file://server/share/a%20b.html#!/route']) {
    const identity = routeIdentity(href);
    assert.equal(identity.url, href);
    assert.equal(new URL(identity.url).href, href);
    assert.ok(sameRoute(identity.url, href));
  }
  assert.ok(sameRoute(A + '#anchor', A));
  assert.ok(!sameRoute(A + '?q=1', A));
  assert.ok(!sameRoute(A + '#/route', A));
  assert.notEqual(routeIdentity(A).origin, routeIdentity(B).origin);
  assert.notEqual(routeIdentity(A).origin, routeIdentity(HTTP).origin);
  assert.notEqual(routeIdentity(A).origin, 'null');
});

test('file change replay, site grouping and clear preserve unrelated files and HTTP', async () => {
  const disk = storage();
  const store = new RouteSessionStore(() => disk);
  for (const href of [A, B, HTTP]) store.schedule(href, {
    ...emptyRouteChanges(),
    textChanges: [{ id: href, elementId: 'e', selector: '#e', oldText: 'old', newText: href, timestamp: 1 }],
  });
  await store.flush();
  const restarted = new RouteSessionStore(() => disk);
  assert.equal((await restarted.load(A + '#anchor'))?.textChanges[0].newText, A);
  const groups = groupSiteChanges(A, await restarted.readAll(), [note(A), note(B), note(HTTP)]);
  assert.deepEqual(groups.map(g => g.url), [A]);
  assert.deepEqual(groups[0].comments.map(c => c.pageUrl), [A]);
  assert.equal(groups[0].textChanges[0].newText, A);
  await restarted.clearSite(A);
  assert.equal(await restarted.load(A), null);
  assert.equal((await restarted.load(B))?.textChanges[0].newText, B);
  assert.equal((await restarted.load(HTTP))?.textChanges[0].newText, HTTP);
});

test('all file comment operations stay within the sender document and return no unrelated records', async () => {
  const disk = storage();
  disk.data[COMMENT_STORAGE_KEY] = [note(B), note(HTTP)];
  const run = createCommentStore(disk);
  const check = (rows: CommentData[]) => assert.ok(rows.every(c => routeIdentity(c.pageUrl).origin === routeIdentity(A).origin));
  check(await run({ action: 'add', href: A, comment: note(A) }, A));
  check(await run({ action: 'read', href: A }, A));
  check(await run({ action: 'update', href: A, id: 'shared', text: 'edited' }, A));
  check(await run({ action: 'resolve', href: A, id: 'shared', resolved: true }, A));
  check(await run({ action: 'offset', href: A, id: 'shared', offset: { x: 1, y: 2 } }, A));
  const rows = await run({ action: 'read', href: A }, A);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, 'edited');
  assert.equal(rows[0].resolved, true);
  assert.deepEqual(rows[0].pinOffset, { x: 1, y: 2 });
  check(await run({ action: 'replace-route', href: A, comments: [note(B, 'imported')] }, A));
  check(await run({ action: 'delete', href: A, id: 'imported' }, A));
  await run({ action: 'add', href: A, comment: note(A) }, A);
  check(await run({ action: 'clear-route', href: A }, A));
  await run({ action: 'add', href: A, comment: note(A) }, A);
  check(await run({ action: 'clear-site', href: A }, A));
  assert.deepEqual(disk.data[COMMENT_STORAGE_KEY], [note(B), note(HTTP)]);
  assert.deepEqual(await run({ action: 'read', href: HTTP }, HTTP), [note(HTTP)]);
});

test('forged file requests and unsupported opaque schemes fail before storage access', async () => {
  let reads = 0;
  const run = createCommentStore({ async get() { reads++; return {}; }, async set() {} });
  for (const action of ['read', 'clear-site', 'clear-route', 'delete', 'update', 'resolve', 'offset', 'add', 'replace-route']) {
    for (const [href, sender] of [[A, B], [A, HTTP], [HTTP, A], ['data:text/plain,a', 'data:text/plain,a'], [A, 'about:blank']]) {
      await assert.rejects(run({ action, href, id: 'shared', text: 'edit', resolved: true, offset: null, comment: note(A), comments: [] }, sender));
    }
  }
  await assert.rejects(run({ action: 'add', href: A, comment: note(B) }, A));
  assert.equal(reads, 0);
});

test('real tracker initialisation, site report and Markdown export retain the file URL', async () => {
  const disk = storage();
  const source = readFileSync(new URL('./change-tracker.ts', import.meta.url), 'utf8');
  const excerpt = source.slice(source.indexOf('let activeRouteUrl ='), source.indexOf('export function persistSession'))
    + source.slice(source.indexOf('export async function getSiteRouteGroups'), source.indexOf('export async function clearSavedRoute'));
  const tracker = { exports: {} as any };
  runInNewContext(transformSync(excerpt, { loader: 'ts', format: 'cjs' }).code, {
    module: tracker, location: { href: A }, routeIdentity, RouteSessionStore, groupSiteChanges,
    browser: { runtime: { sendMessage: async () => ({ ok: true, applied: await disk.get() }) } }, loadComments: async () => [note(A), note(B), note(HTTP)],
  });
  assert.equal(tracker.exports.getActiveRouteUrl(), A);
  const groups = await tracker.exports.getSiteRouteGroups();
  assert.deepEqual(groups.map((g: { url: string }) => g.url), [A]);
  const exported = { exports: {} as any };
  const dependencies: Record<string, unknown> = {
    './helpers': { getElementById: () => null },
    './change-tracker': { getStyleChanges: () => [], getTextChanges: () => [], getDomChanges: () => [] },
    './source-detection': {}, './root-var-store': { getTokenEdits: () => [] },
    './token-engine': { getTokenIndex: () => ({ tokens: [] }) },
  };
  runInNewContext(transformSync(readFileSync(new URL('./enhanced-export.ts', import.meta.url), 'utf8'), {
    loader: 'ts', format: 'cjs',
  }).code, {
    module: exported, require: (name: string) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    }, document: { title: 'File fixture' }, window: { location: { href: tracker.exports.getActiveRouteUrl() } },
  });
  const markdown = exported.exports.exportMarkdown(groups[0].comments);
  assert.ok(markdown.includes(`<${A}>`));
  assert.ok(!markdown.includes(B));
  assert.ok(!markdown.includes(HTTP));
});

test('HTTP retains same-origin cross-route operations without exposing file comments', async () => {
  const disk = storage();
  disk.data[COMMENT_STORAGE_KEY] = [note(A), note(HTTP), note('https://example.test/other')];
  const run = createCommentStore(disk);
  const rows = await run({ action: 'read', href: 'https://example.test/other' }, HTTP);
  assert.deepEqual(rows.map(c => c.pageUrl), [HTTP, 'https://example.test/other']);
  await run({ action: 'clear-site', href: 'https://example.test/other' }, HTTP);
  assert.deepEqual(disk.data[COMMENT_STORAGE_KEY], [note(A)]);
});
