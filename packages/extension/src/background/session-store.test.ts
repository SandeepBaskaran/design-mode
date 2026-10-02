import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from './session-store';
import { RouteSessionStore, sessionStorageKey } from '../content/route-storage';

const a = 'https://example.test/a';
const changes = (id: string) => ({ styleChanges: [{ elementId: id }] as any, textChanges: [], domChanges: [] });
function fixture() {
  const records: Record<string, any> = {};
  const storage = {
    get: async () => structuredClone(records),
    set: async (items: Record<string, unknown>) => { Object.assign(records, structuredClone(items)); },
    remove: async (keys: string | string[]) => { for (const key of [keys].flat()) delete records[key]; },
  };
  const background = createSessionStore(storage);
  const tab = () => new RouteSessionStore(() => storage, 100, async op => await background(op, a) === true);
  return { storage, records, background, tab };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

for (const action of ['clear', 'edit']) {
  it(`background serialises a competing ${action} after an in-flight import and rejects compensation`, async () => {
    const f = fixture(), importer = f.tab(), other = f.tab();
    importer.schedule(a, changes('old'));
    const ownership = await importer.captureOwnership(a);
    const started = deferred(), release = deferred();
    const set = f.storage.set;
    let once = true;
    f.storage.set = async items => {
      if (once && items[sessionStorageKey(a)]) {
        once = false;
        started.resolve();
        await release.promise;
      }
      await set(items);
    };
    const importing = importer.writeOwned(ownership, changes('import'));
    await started.promise;
    let competing: Promise<void>;
    if (action === 'clear') competing = other.clearRoute(a);
    else { other.schedule(a, changes('new')); competing = other.flush(); }
    release.resolve();
    await Promise.all([importing, competing]);
    await assert.rejects(importer.assertOwnership(ownership), /Session changed/);
    await importer.writeOwned(ownership, changes('old'), true);
    assert.deepEqual(await importer.load(a), action === 'clear' ? null : changes('new'));
  });
}

it('an edit queued ahead of compensation cannot slip between the background ownership check and write', async () => {
  const f = fixture(), importer = f.tab(), other = f.tab();
  const ownership = await importer.captureOwnership(a);
  await importer.writeOwned(ownership, changes('import'));
  const started = deferred(), release = deferred();
  const set = f.storage.set;
  let once = true;
  f.storage.set = async items => {
    if (once && items[sessionStorageKey(a)]) {
      once = false;
      started.resolve();
      await release.promise;
    }
    await set(items);
  };
  other.schedule(a, changes('new'));
  const edit = other.flush();
  await started.promise;
  const rollback = importer.writeOwned(ownership, changes('old'), true);
  release.resolve();
  await Promise.all([edit, rollback]);
  assert.deepEqual(await importer.load(a), changes('new'));
});

it('background validates session routes and rejects non-session keys without touching storage', async () => {
  const f = fixture();
  let reads = 0;
  f.storage.get = async () => { reads++; return {}; };
  for (const op of [
    { action: 'clear', href: 'https://other.test/a', wholeSite: true, writerId: 'x' },
    { action: 'clear', href: a, wholeSite: 'yes', writerId: 'x' },
    { action: 'write', payload: { 'dm-comments': [] } },
    { action: 'owned', ownership: { href: a, snapshot: 'null' }, value: {} },
  ]) await assert.rejects(f.background(op, a));
  await assert.rejects(f.background({ action: 'clear', href: 'file:///other.html', wholeSite: true, writerId: 'x' }, 'file:///first.html'));
  assert.equal(reads, 0);
  assert.deepEqual(f.records, {});
});

it('a restarted background writer preserves persisted ownership comparisons', async () => {
  const f = fixture(), importer = f.tab(), other = f.tab();
  const ownership = await importer.captureOwnership(a);
  await importer.writeOwned(ownership, changes('import'));
  other.schedule(a, changes('new'));
  await other.flush();
  const restarted = createSessionStore(f.storage);
  assert.equal(await restarted({ action: 'owned', ownership, value: { ...changes('old'), siteGeneration: null, routeGeneration: null } }, a), false);
  assert.deepEqual(await importer.load(a), changes('new'));
});

it('background reads expose only sender-site sessions and clear barriers', async () => {
  const f = fixture();
  Object.assign(f.records, {
    [sessionStorageKey(a)]: changes('own'),
    [sessionStorageKey('https://other.test/a')]: changes('other'),
    'dm_site_generation:https://example.test': 'site',
    'dm_route_generation:https://example.test/a': 'route',
    'dm_site_generation:https://other.test': 'foreign',
    'dm-mcp-cloud-token': 'synthetic-not-a-credential',
    'dm-comments': [],
  });
  assert.deepEqual(await f.background({ action: 'read', href: a }, a), {
    [sessionStorageKey(a)]: changes('own'),
    'dm_site_generation:https://example.test': 'site',
    'dm_route_generation:https://example.test/a': 'route',
  });
  await assert.rejects(f.background({ action: 'read', href: 'https://other.test/a' }, a));
  await assert.rejects(f.background({ action: 'read', href: 'file:///other.html' }, 'file:///own.html'));
});
