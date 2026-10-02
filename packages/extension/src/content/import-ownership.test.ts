import { it } from 'node:test';
import assert from 'node:assert/strict';
import { RouteSessionStore, sessionStorageKey } from './route-storage';
import { createCommentStore } from '../background/comment-store';

const a = 'https://example.test/a', b = 'https://example.test/b';
const changes = (id: string) => ({ styleChanges: [{ elementId: id }] as any, textChanges: [], domChanges: [] });
const comment = (id: string) => ({ id, pageUrl: a, elementId: id, selector: 'p', text: id, timestamp: 1, updatedAt: 1 });
function fixture() {
  const records: Record<string, any> = { 'dm-comments': [comment('old')] };
  const storage = {
    get: async () => structuredClone(records),
    set: async (items: Record<string, unknown>) => { Object.assign(records, structuredClone(items)); },
    remove: async (keys: string | string[]) => { for (const key of [keys].flat()) delete records[key]; },
  };
  const local = new RouteSessionStore(() => storage), remote = new RouteSessionStore(() => storage);
  const commentStorage = {
    get: async () => Object.fromEntries(Object.entries(await storage.get()).filter(([key]) => key === 'dm-comments' || key === 'dm-comment-owners')),
    set: (items: Record<string, unknown>) => storage.set(items),
  };
  return { records, storage, commentStorage, local, remote, comments: createCommentStore(commentStorage, storage) };
}

for (const clear of ['route', 'site'] as const) {
  for (const phase of ['forward', 'rollback'] as const) {
    it(`${clear} clear invalidates ${phase} session ownership without a storage notification`, async () => {
      const f = fixture();
      f.local.schedule(a, changes('old'));
      const ownership = await f.local.captureOwnership(a);
      if (phase === 'rollback') await f.local.writeOwned(ownership, changes('import'));
      await (clear === 'site' ? f.remote.clearSite(a) : f.remote.clearRoute(a));
      if (phase === 'forward') await assert.rejects(f.local.writeOwned(ownership, changes('import')), /Session changed/);
      else await f.local.writeOwned(ownership, changes('old'), true);
      assert.equal(await f.local.load(a), null);
      assert.equal(f.records[sessionStorageKey(a)], undefined);
    });
  }
}

for (const pending of [false, true]) {
  it(`a newer ${pending ? 'pending local' : 'persisted remote'} edit owns the session instead of compensation`, async () => {
    const f = fixture();
    f.local.schedule(a, changes('old'));
    const ownership = await f.local.captureOwnership(a);
    await f.local.writeOwned(ownership, changes('import'));
    const writer = pending ? f.local : f.remote;
    writer.schedule(a, changes('new'));
    if (!pending) await writer.flush();
    await f.local.writeOwned(ownership, changes('old'), true);
    assert.deepEqual(await f.local.load(a), changes('new'));
  });
}

it('clear between the owned session storage write and its acknowledgement remains authoritative', async () => {
  const f = fixture();
  const ownership = await f.local.captureOwnership(a);
  const set = f.storage.set;
  let once = true;
  f.storage.set = async items => {
    await set(items);
    if (once && items[sessionStorageKey(a)]) {
      once = false;
      await f.remote.clearRoute(a);
    }
  };
  await f.local.writeOwned(ownership, changes('import'));
  await assert.rejects(f.local.assertOwnership(ownership), /Session changed/);
  await f.local.writeOwned(ownership, changes('old'), true);
  assert.equal(await f.local.load(a), null);
});

it('an owned write retains old barriers if another tab clears between read and write', async () => {
  const f = fixture();
  const ownership = await f.local.captureOwnership(a);
  const set = f.storage.set;
  let once = true;
  f.storage.set = async items => {
    if (once && items[sessionStorageKey(a)]) {
      once = false;
      await f.remote.clearSite(a);
    }
    await set(items);
  };
  await f.local.writeOwned(ownership, changes('import'));
  await assert.rejects(f.local.assertOwnership(ownership), /Session changed/);
  await f.local.writeOwned(ownership, changes('old'), true);
  assert.equal(await f.local.load(a), null);
});

for (const action of ['clear-route', 'clear-site', 'replace-route'] as const) {
  for (const phase of ['forward', 'rollback'] as const) {
    it(`${action} invalidates ${phase} comment ownership, including after background restart`, async () => {
      const f = fixture();
      const ownership = { id: 'import', siteGeneration: null, routeGeneration: null };
      await f.comments({ action: 'claim-route', href: a, ownership }, a);
      if (phase === 'rollback') await f.comments({ action: 'replace-route', href: a, comments: [comment('import')], ownership }, a);
      await f.comments({ action, href: a, comments: [comment('new')] }, a);
      const restarted = createCommentStore(f.commentStorage, f.storage);
      const request = { action: 'replace-route', href: a, comments: [comment('old')], ownership, rollback: phase === 'rollback' };
      if (phase === 'forward') await assert.rejects(restarted(request, a), /Comments changed/);
      else await restarted(request, a);
      assert.deepEqual(f.records['dm-comments'].map((c: any) => c.id), action === 'replace-route' ? ['new'] : []);
    });
  }
}

it('clearing an already-empty comment route invalidates a previously claimed import', async () => {
  const f = fixture();
  f.records['dm-comments'] = [];
  const ownership = { id: 'import', siteGeneration: null, routeGeneration: null };
  await f.comments({ action: 'claim-route', href: a, ownership }, a);
  await f.comments({ action: 'clear-route', href: a }, a);
  await assert.rejects(f.comments({ action: 'replace-route', href: a, comments: [comment('import')], ownership }, a), /Comments changed/);
  assert.deepEqual(f.records['dm-comments'], []);
});

it('comment ownership reads non-null clear barriers from the session area, not local comments storage', async () => {
  const f = fixture();
  await f.remote.clearSite(a);
  const sessionOwner = await f.local.captureOwnership(a);
  const ownership = { id: 'after-clear', siteGeneration: sessionOwner.siteGeneration, routeGeneration: sessionOwner.routeGeneration };
  await f.comments({ action: 'claim-route', href: a, ownership }, a);
  await f.comments({ action: 'replace-route', href: a, comments: [comment('new')], ownership }, a);
  assert.deepEqual(f.records['dm-comments'], [comment('new')]);
  await f.remote.clearRoute(a);
  await f.comments({ action: 'replace-route', href: a, comments: [comment('old')], ownership, rollback: true }, a);
  assert.deepEqual(f.records['dm-comments'], [comment('new')]);
});

it('unrelated-route clears leave captured-route compensation authorised', async () => {
  const f = fixture();
  f.local.schedule(a, changes('old'));
  const ownership = await f.local.captureOwnership(a);
  const commentsOwner = { id: 'import', siteGeneration: ownership.siteGeneration, routeGeneration: ownership.routeGeneration };
  await f.comments({ action: 'claim-route', href: a, ownership: commentsOwner }, a);
  await f.comments({ action: 'replace-route', href: a, comments: [comment('import')], ownership: commentsOwner }, a);
  await f.local.writeOwned(ownership, changes('import'));
  await f.remote.clearRoute(b);
  await f.comments({ action: 'clear-route', href: b }, b);
  await f.local.writeOwned(ownership, changes('old'), true);
  await f.comments({ action: 'replace-route', href: a, comments: [comment('old')], ownership: commentsOwner, rollback: true }, a);
  assert.deepEqual(await f.local.load(a), changes('old'));
  assert.deepEqual(f.records['dm-comments'], [comment('old')]);
});
