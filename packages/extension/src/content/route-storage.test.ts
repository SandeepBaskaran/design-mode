import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouteSessionStore, routeIdentity, sameRoute, groupSiteChanges, emptyRouteChanges, sessionStorageKey } from './route-storage';
import type { CommentData } from './comments';
import type { StyleChange } from './change-tracker';

function memoryStorage(initial: Record<string, any> = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(key: string | null) { return structuredClone(key === null ? data : { [key]: data[key] }); },
    async set(items: Record<string, unknown>) { Object.assign(data, structuredClone(items)); },
    async remove(keys: string | string[]) { for (const key of [keys].flat()) delete data[key]; },
  };
}
const style = (id: string): StyleChange => ({ id, elementId: id, selector: 'header', property: 'color', oldValue: 'black', newValue: 'red', timestamp: 1 });
const changes = (id: string) => ({ ...emptyRouteChanges(), styleChanges: [style(id)] });
const comment = (pageUrl: string): CommentData => ({ id: pageUrl, elementId: 'a', selector: 'header', text: 'note', timestamp: 1, updatedAt: 1, pageUrl });

test('route identity preserves query and router fragments, ignores only ordinary anchors', () => {
  assert.equal(routeIdentity('https://example.test/a?x=1#section').routeKey, 'https://example.test/a?x=1');
  assert.equal(routeIdentity('https://example.test/a?x=1#/b').routeKey, 'https://example.test/a?x=1#/b');
  assert.equal(routeIdentity('https://example.test/a?x=1#!/b').routeKey, 'https://example.test/a?x=1#!/b');
  assert.ok(sameRoute('https://example.test/a#one', 'https://example.test/a#two'));
  assert.ok(!sameRoute('https://example.test/a#/one', 'https://example.test/a#!/one'));
  assert.ok(!sameRoute('http://example.test/a', 'https://example.test/a'));
  assert.ok(!sameRoute('https://example.test:444/a', 'https://example.test/a'));
  assert.ok(!sameRoute('invalid', 'https://example.test/a'));
});

test('groups exact origin, active first, comment-only routes, legacy anchors and live active override', () => {
  const groups = groupSiteChanges('https://example.test/b#section', {
    [sessionStorageKey('https://example.test/a')]: changes('a'),
    [sessionStorageKey('https://example.test/b')]: changes('old-b'),
    [sessionStorageKey('https://example.test.evil/a')]: changes('evil'),
    [sessionStorageKey('https://example.test:444/a')]: changes('port'),
    [sessionStorageKey('http://example.test/a')]: changes('scheme'),
    [sessionStorageKey('https://sub.example.test/a')]: changes('sub'),
    [sessionStorageKey('https://example.test/empty')]: emptyRouteChanges(),
  }, [comment('https://example.test/c#note'), comment('https://example.test/a#/router'), comment('https://else.test/c')], changes('live-b'));
  assert.deepEqual(groups.map(g => g.routeKey), ['/b', '/a', '/a#/router', '/c'].map(path => 'https://example.test' + path));
  assert.equal(groups[0].styleChanges[0].id, 'live-b');
  assert.equal(groups[3].comments.length, 1);
});

test('pending writes bind to their original route and detached snapshot', async () => {
  const storage = memoryStorage();
  const store = new RouteSessionStore(() => storage);
  const a = changes('a');
  store.schedule('https://example.test/a#anchor', a);
  a.styleChanges[0].newValue = 'blue';
  store.schedule('https://example.test/b', changes('b'));
  await store.flush();
  assert.equal((await store.load('https://example.test/a'))?.styleChanges[0].newValue, 'red');
  assert.equal((await store.load('https://example.test/b'))?.styleChanges[0].id, 'b');
});

test('clear cancels debounced writes without removing another route', async () => {
  const storage = memoryStorage();
  const store = new RouteSessionStore(() => storage);
  store.schedule('https://example.test/a', changes('a'));
  store.schedule('https://example.test/b', changes('b'));
  await store.clearRoute('https://example.test/a');
  await store.flush();
  assert.equal(await store.load('https://example.test/a'), null);
  assert.equal((await store.load('https://example.test/b'))?.styleChanges[0].id, 'b');
});

test('clear is serialized after an already in-flight write', async () => {
  const storage = memoryStorage();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const write = storage.set;
  storage.set = async items => { await blocked; await write(items); };
  const store = new RouteSessionStore(() => storage);
  store.schedule('https://example.test/a', changes('a'));
  const writing = store.flush();
  const clearing = store.clearRoute('https://example.test/a');
  release();
  await Promise.all([writing, clearing]);
  assert.equal(await store.load('https://example.test/a'), null);
});

test('site clear removes only exact origin records and pending writes', async () => {
  const storage = memoryStorage({
    [sessionStorageKey('https://example.test/a')]: changes('a'),
    [sessionStorageKey('https://else.test/a')]: changes('else'),
    [sessionStorageKey('https://example.test:444/a')]: changes('port'),
    'dm-comments': [comment('https://example.test/a')],
  });
  const store = new RouteSessionStore(() => storage);
  store.schedule('https://example.test/b#/router', changes('b'));
  await store.clearSite('https://example.test/a');
  await store.flush();
  assert.equal(await store.load('https://example.test/a'), null);
  assert.equal(await store.load('https://example.test/b#/router'), null);
  assert.equal((await store.load('https://else.test/a'))?.styleChanges[0].id, 'else');
  assert.equal((await store.load('https://example.test:444/a'))?.styleChanges[0].id, 'port');
  assert.equal(storage.data['dm-comments'].length, 1);
});

test('storage errors reject reads and clears rather than reporting false success', async () => {
  const storage = memoryStorage();
  storage.set = async () => { throw new Error('quota'); };
  const store = new RouteSessionStore(() => storage);
  store.schedule('https://example.test/a', changes('a'));
  await assert.rejects(store.flush(), /quota/);
  storage.set = async () => {};
  storage.remove = async () => { throw new Error('denied'); };
  await assert.rejects(store.clearRoute('https://example.test/a'), /denied/);
});


for (const wholeSite of [false, true]) {
  test(`cross-writer ${wholeSite ? 'site' : 'route'} clear rejects an in-flight stale write persistently`, async () => {
    const a = 'https://example.test/a';
    const b = 'https://example.test/b';
    const storage = memoryStorage({ [sessionStorageKey(b)]: changes('b') });
    const writer = new RouteSessionStore(() => storage);
    const clearer = new RouteSessionStore(() => storage);
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const set = storage.set;
    storage.set = async items => {
      if (sessionStorageKey(a) in items) { started(); await blocked; }
      await set(items);
    };
    writer.schedule(a, changes('stale'));
    const writing = writer.flush();
    await entered;
    if (wholeSite) await clearer.clearSite(a);
    else await clearer.clearRoute(a);
    release();
    await writing;
    // The late write really landed. Readers, including new instances, must reject it.
    assert.equal(storage.data[sessionStorageKey(a)].styleChanges[0].id, 'stale');
    const reader = new RouteSessionStore(() => storage);
    assert.equal(await reader.load(a), null);
    assert.equal((await reader.readAll())[sessionStorageKey(a)], undefined);
    assert.ok(!groupSiteChanges(b, storage.data, [], emptyRouteChanges()).some(g => g.routeKey === a));
    assert.equal((await reader.load(b))?.styleChanges[0].id, wholeSite ? undefined : 'b');
    // An unrelated route clear must not replace the earlier persistent tombstone.
    await clearer.clearRoute(b);
    assert.equal(await reader.load(a), null);
    writer.schedule(a, changes('fresh'));
    await writer.flush();
    assert.equal((await reader.load(a))?.styleChanges[0].id, 'fresh');
    assert.equal((await reader.readAll())[sessionStorageKey(a)] !== undefined, true);
    assert.equal(groupSiteChanges(b, storage.data, [], emptyRouteChanges()).find(g => g.routeKey === a)?.styleChanges[0].id, 'fresh');
  });
}

test('remote clear invalidates both pending and already queued snapshots', async () => {
  const storage = memoryStorage();
  const store = new RouteSessionStore(() => storage);
  store.schedule('https://example.test/a', changes('a'));
  const queued = store.flush();
  store.schedule('https://example.test/b', changes('b'));
  store.invalidate('https://example.test/a', true);
  await queued;
  await store.flush();
  assert.equal(await store.load('https://example.test/a'), null);
  assert.equal(await store.load('https://example.test/b'), null);
  store.schedule('https://example.test/a', changes('new-a'));
  await store.flush();
  assert.equal((await store.load('https://example.test/a'))?.styleChanges[0].id, 'new-a');
});

test('ownership survives browser storage object-key reordering but not changed values', async () => {
  const storage = memoryStorage();
  const set = storage.set;
  const reorder = (value: any): any => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, reorder(value[key])])) : value;
  storage.set = items => set(reorder(items));
  const store = new RouteSessionStore(() => storage);
  const href = 'https://example.test/a';
  await store.clearSite(href);
  const ownership = await store.captureOwnership(href);
  await store.writeOwned(ownership, changes('import'));
  await store.assertOwnership(ownership);
  storage.data[sessionStorageKey(href)].styleChanges[0].newValue = 'blue';
  await assert.rejects(store.assertOwnership(ownership), /Session changed/);
});
