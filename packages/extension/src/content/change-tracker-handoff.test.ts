import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// The handoff staging block lives inside change-tracker.ts (same excerpt
// convention as change-source-location / move-report-restore): the full
// module touches browser.* at load, so tests slice the block, transpile it,
// and bind its collaborators as function params.
function loadHandoff(opts: {
  isLiveFeedbackSupported: () => boolean;
  feedbackSession: { sessionId: string; pageUrl: string; state: 'waiting' | 'implementing' | 'stopped'; cursor: number } | null;
  isConnected: () => boolean;
  storage?: ReturnType<typeof fakeHandoffStorage>;
}) {
  const source = readFileSync(new URL('./change-tracker.ts', import.meta.url), 'utf8');
  const declStart = source.indexOf('const styleChanges: StyleChange[] = [];');
  const helperStart = source.indexOf('export function applyHandoffDelivered');
  const helperEnd = source.indexOf('export function getStyleChanges');
  const clearStart = source.indexOf('export function discardActiveChanges');
  const clearEnd = source.indexOf('// ── Managed override stylesheet');
  const fnStart = source.indexOf('export async function stageAgentHandoff');
  const fnEnd = source.indexOf('// --- Transport sync ---');
  assert.ok(declStart >= 0 && helperStart > declStart, 'pendingHandoff declaration block is missing');
  assert.ok(helperEnd > helperStart, 'applyHandoffDelivered block is missing');
  assert.ok(clearStart >= 0 && clearEnd > clearStart, 'discard/clear block is missing');
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'stageAgentHandoff block is missing');
  const js = ts.transpileModule(
    [
      source.slice(declStart, helperStart),
      source.slice(helperStart, helperEnd).replace(/export /g, ''),
      source.slice(clearStart, clearEnd).replace(/export /g, ''),
      source.slice(fnStart, fnEnd).replace(/export /g, ''),
      'return { stageAgentHandoff, applyHandoffDelivered, restorePendingHandoff, discardActiveChanges, clearAllChanges, getPending: () => pendingHandoff };',
    ].join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const grab = vm.runInThisContext(
    `(function (isLiveFeedbackSupported, feedbackSession, isConnected, getFeedbackSessionView, waitForFeedbackAck, getSiteChangeReport, transportSend, syncCommentChange, browser, routeIdentity, activeRouteLoaded, routeGeneration, routeTextTargets, routeDomTargets, clearAllRules, persistSession, requestStopFeedback, syncAllChanges) { ${js} })`,
  );
  const storage = opts.storage ?? fakeHandoffStorage();
  const sent: Array<{ type: string; payload?: unknown }> = [];
  const mod = grab(
    opts.isLiveFeedbackSupported,
    opts.feedbackSession,
    opts.isConnected,
    () => opts.feedbackSession,
    async () => opts.feedbackSession,
    async () => ({ comments: [] }),
    (msg: { type: string; payload?: unknown }) => { sent.push(msg); },
    () => {},
    { storage: { local: storage.area } },
    (href: string) => ({ origin: href, routeKey: href, url: href }),
    true,
    0,
    new Map(),
    new Map(),
    () => {},
    () => {},
    () => {}, (() => sent.push({ type: RETRACT_TYPE, payload: undefined })),
  ) as {
    stageAgentHandoff(): Promise<{ ok: boolean; error?: string; handoff?: unknown; session: unknown }>;
    applyHandoffDelivered(payload: unknown): boolean;
    restorePendingHandoff(): Promise<boolean>;
    discardActiveChanges(): void;
    clearAllChanges(stopFeedback?: boolean): void;
    getPending(): { id: string; requestedAt: number; pageUrl: string; pageTitle: string } | null;
  };
  return { mod, storage, sent };
}

const PAGE = 'https://example.test/app';
const HANDOFF_KEY = 'dm-pending-handoff:' + PAGE;
const RETRACT_TYPE = 'SESSION_UPDATE';

function fakeHandoffStorage() {
  const data = new Map<string, unknown>();
  const sets: Array<Record<string, unknown>> = [];
  const removed: string[][] = [];
  const area = {
    get: async (keys: string | null) => {
      if (keys === null || keys === undefined) return Object.fromEntries(data);
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) { data.set(k, v); sets.push(items); }
    },
    remove: async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      removed.push(list);
      for (const k of list) data.delete(k);
    },
  };
  return { area, data, sets, removed };
}

// removePersistedHandoff / persistPendingHandoff are fire-and-forget async;
// one macrotask turn lets their storage effects land before assertions.
const settle = () => new Promise(resolve => setImmediate(resolve));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function seededRecord(over: Partial<Record<string, unknown>> = {}) {
  return {
    version: 1,
    id: crypto.randomUUID(),
    requestedAt: Date.now(),
    pageUrl: PAGE,
    pageTitle: 'App',
    routeKey: PAGE,
    createdAt: Date.now(),
    ...over,
  };
}

describe('stageAgentHandoff send-while-implementing (C.2)', () => {
  const savedLocation = (globalThis as any).location;
  const savedDocument = (globalThis as any).document;
  afterEach(() => {
    (globalThis as any).location = savedLocation;
    (globalThis as any).document = savedDocument;
  });

  it('a send rejected while implementing arms no marker, sends no HANDOFF, and tells the user how to recover', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const { mod: h, sent, storage } = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: { sessionId: 's1', pageUrl: PAGE, state: 'implementing', cursor: 1 },
      isConnected: () => true,
    });
    const result = await h.stageAgentHandoff();
    assert.equal(result.ok, false);
    assert.match(result.error || '', /your changes are saved/i, 'the panel message must say the changes are kept');
    assert.match(result.error || '', /send again/i, 'the panel message must say how to deliver them');
    assert.equal(h.getPending(), null, 'a rejected send must not arm pendingHandoff');
    assert.equal(sent.filter(m => m.type === 'HANDOFF').length, 0, 'captured from the real transport');
    assert.equal(sent.filter(m => m.type === 'SESSION_UPDATE').length, 1);
    assert.equal([...storage.data.keys()].filter(k => k.startsWith('dm-pending-handoff:')).length, 0, 'a rejected send persists nothing');
  });

  it('a send rejected for a page mismatch arms no marker and sends nothing', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const { mod: h, sent, storage } = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: { sessionId: 's1', pageUrl: 'https://example.test/other', state: 'waiting', cursor: 0 },
      isConnected: () => true,
    });
    const result = await h.stageAgentHandoff();
    assert.equal(result.ok, false);
    assert.match(result.error || '', /does not match/);
    assert.equal(h.getPending(), null);
    assert.equal(sent.filter(m => m.type === 'HANDOFF').length, 0);
    assert.equal([...storage.data.keys()].filter(k => k.startsWith('dm-pending-handoff:')).length, 0);
  });

  it('an accepted send stamps a random Send id and monotonic requestedAt (same-ms Sends stay distinct)', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const { mod: h } = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
    });
    const first = await h.stageAgentHandoff();
    assert.equal(first.ok, true);
    const firstArmed = h.getPending();
    assert.match(firstArmed!.id, UUID_RE, 'Send identity is a random UUID, not the timestamp');
    const firstAt = firstArmed!.requestedAt;
    const second = await h.stageAgentHandoff();
    assert.equal(second.ok, true);
    const secondArmed = h.getPending()!;
    assert.notEqual(secondArmed.id, firstArmed!.id, 'two Sends in the same millisecond must stay distinct');
    assert.ok(secondArmed.requestedAt > firstAt, 'requestedAt stays monotonic for ordering');
  });

  it('HANDOFF_DELIVERED clears only the matching Send and its persisted record', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const { mod: h, storage } = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
    });
    await h.stageAgentHandoff();
    const armed = h.getPending()!;
    assert.ok(storage.data.has(HANDOFF_KEY), 'the accepted Send was persisted');
    assert.equal(h.applyHandoffDelivered({ id: 'not-the-id', requestedAt: armed.requestedAt, pageUrl: PAGE }), false, 'an ack for another Send is ignored');
    assert.ok(h.getPending());
    assert.equal(h.applyHandoffDelivered({ id: armed.id, pageUrl: armed.pageUrl }), true);
    assert.equal(h.getPending(), null, 'the acked Send is cleared');
    await new Promise(r => setImmediate(r)); // storage removal is fire-and-forget
    assert.equal(storage.data.has(HANDOFF_KEY), false, 'the persisted record is removed with the ack');
    assert.equal(h.applyHandoffDelivered({ id: armed.id }), false, 'nothing left to clear');
  });

  it('an accepted send persists a minimal record — identity and page coordinates, no change content', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const { mod: h, storage } = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
    });
    await h.stageAgentHandoff();
    const record = storage.data.get(HANDOFF_KEY) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(record).sort(),
      ['createdAt', 'id', 'pageTitle', 'pageUrl', 'requestedAt', 'routeKey', 'version'],
      'the persisted record carries identity only — no selectors, values, or change arrays',
    );
    const second = await h.stageAgentHandoff();
    assert.equal((storage.data.get(HANDOFF_KEY) as Record<string, unknown>).id, (second.handoff as { id: string }).id, 'a newer Send overwrites the route key');
    assert.equal(storage.data.size, 1, 'one key per route');
  });

  it('a cloud-mode send stays in memory only — persistence is local-only, so nothing un-ackable re-arms', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const { mod: h, storage, sent } = loadHandoff({
      isLiveFeedbackSupported: () => false,
      feedbackSession: null,
      isConnected: () => true,
    });
    const result = await h.stageAgentHandoff();
    assert.equal(result.ok, true);
    assert.ok(h.getPending(), 'the Send stays armed for this document');
    assert.equal([...storage.data.keys()].filter(k => k.startsWith('dm-pending-handoff:')).length, 0, 'a transport with no delivery ack must not gain a persisted marker');
    assert.equal(storage.data.size, 0, 'nothing was written at all');
    assert.equal(sent.filter(m => m.type === 'HANDOFF').length, 1);
  });
});

describe('persisted pending-handoff restore (C.4 Task 1)', () => {
  const savedLocation = (globalThis as any).location;
  const savedDocument = (globalThis as any).document;
  afterEach(() => {
    (globalThis as any).location = savedLocation;
    (globalThis as any).document = savedDocument;
  });

  function fresh() {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const h = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
    });
    h.storage.data.set('dm-mcp-mode', 'local');
    return h;
  }

  it('a fresh persisted record for this route re-arms and re-sends the marker', async () => {
    const { mod: h, storage, sent } = fresh();
    const record = seededRecord();
    storage.data.set(HANDOFF_KEY, record);
    const armed = await h.restorePendingHandoff();
    assert.equal(armed, true);
    assert.equal(h.getPending()!.id, record.id);
    const handoffMsg = sent.find(m => m.type === 'HANDOFF');
    assert.ok(handoffMsg, 'restore re-arms the server with the marker');
    assert.equal((handoffMsg!.payload as { id: string }).id, record.id);
  });

  it('corrupt records are dropped safely, not armed', async () => {
    const { mod: h, storage } = fresh();
    storage.data.set(HANDOFF_KEY + 'a', seededRecord({ version: 2 }));
    storage.data.set(HANDOFF_KEY + 'b', seededRecord({ id: 'not-a-uuid' }));
    storage.data.set(HANDOFF_KEY + 'c', seededRecord({ requestedAt: 'nope' }));
    storage.data.set(HANDOFF_KEY + 'd', { version: 1 });
    storage.data.set(HANDOFF_KEY + 'e', 'just a string');
    storage.data.set(HANDOFF_KEY + 'f', seededRecord({ createdAt: 'nope' }));
    const armed = await h.restorePendingHandoff();
    assert.equal(armed, false);
    assert.equal(h.getPending(), null);
    const removed = storage.removed.flat();
    for (const suffix of ['a', 'b', 'c', 'd', 'e', 'f']) {
      assert.ok(removed.includes(HANDOFF_KEY + suffix), `corrupt entry ${suffix} is removed from storage`);
    }
    assert.equal([...storage.data.keys()].filter(k => k.startsWith('dm-pending-handoff:')).length, 0);
  });

  it('records older than 24h expire on restore', async () => {
    const { mod: h, storage } = fresh();
    storage.data.set(HANDOFF_KEY, seededRecord({ createdAt: Date.now() - 25 * 60 * 60 * 1000 }));
    const armed = await h.restorePendingHandoff();
    assert.equal(armed, false);
    assert.equal(storage.data.has(HANDOFF_KEY), false, 'the expired record is removed');
    assert.equal(h.getPending(), null);
  });

  it('records for another route are neither armed nor removed', async () => {
    const { mod: h, storage, sent } = fresh();
    const other = seededRecord({ routeKey: 'https://example.test/other' });
    storage.data.set('dm-pending-handoff:https://example.test/other', other);
    const armed = await h.restorePendingHandoff();
    assert.equal(armed, false);
    assert.equal(h.getPending(), null);
    assert.equal(sent.filter(m => m.type === 'HANDOFF').length, 0);
    assert.ok(storage.data.has('dm-pending-handoff:https://example.test/other'), 'the other route keeps its record');
  });

  it('a live in-memory marker wins over a stale persisted record', async () => {
    const { mod: h, storage } = fresh();
    await h.stageAgentHandoff();
    const live = h.getPending()!;
    storage.data.set(HANDOFF_KEY, seededRecord({ id: crypto.randomUUID() }));
    const armed = await h.restorePendingHandoff();
    assert.equal(armed, false);
    assert.equal(h.getPending()!.id, live.id, 'the live marker is untouched');
    assert.ok(storage.data.has(HANDOFF_KEY));
  });

  it('a persisted record re-arms only for a local-mode profile (absent mode = cloud default)', async () => {
    const { mod: h, storage, sent } = fresh();
    const record = seededRecord();
    storage.data.set(HANDOFF_KEY, record);
    storage.data.delete('dm-mcp-mode');
    const armed = await h.restorePendingHandoff();
    assert.equal(armed, false, 'an un-ackable transport must not re-arm the marker');
    assert.equal(h.getPending(), null);
    assert.equal(sent.filter(m => m.type === 'HANDOFF').length, 0, 'no marker reaches any transport');
    assert.ok(storage.data.has(HANDOFF_KEY), 'the record is kept — a later local session may still deliver it');
  });

  it('an explicit cloud mode never re-arms a persisted record', async () => {
    const { mod: h, storage, sent } = fresh();
    const record = seededRecord();
    storage.data.set(HANDOFF_KEY, record);
    storage.data.set('dm-mcp-mode', 'cloud');
    const armed = await h.restorePendingHandoff();
    assert.equal(armed, false);
    assert.equal(h.getPending(), null);
    assert.equal(sent.filter(m => m.type === 'HANDOFF').length, 0);
    assert.ok(storage.data.has(HANDOFF_KEY), 'switching back to local within 24 h still finds the record');
  });
});

// C.4.1 merge-blocker fix: discard/clear must kill the persisted pending Send,
// not just the in-memory marker, or the next content-script start resurrects a
// Send the user explicitly threw away.
describe('discard/clear remove the persisted pending Send (C.4.1) — UNIT(mocked, vm-slice)', () => {
  const savedLocation = (globalThis as any).location;
  const savedDocument = (globalThis as any).document;
  afterEach(() => {
    (globalThis as any).location = savedLocation;
    (globalThis as any).document = savedDocument;
  });

  function fresh(storage?: ReturnType<typeof fakeHandoffStorage>) {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const h = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
      storage,
    });
    h.storage.data.set('dm-mcp-mode', 'local');
    return h;
  }

  it('1. [UNIT] discarding the changes removes the persisted pending Send', async () => {
    const { mod: h, storage } = fresh();
    await h.stageAgentHandoff();
    assert.ok(storage.data.has(HANDOFF_KEY), 'precondition: the accepted Send was persisted');
    h.discardActiveChanges();
    assert.equal(h.getPending(), null, 'the in-memory marker is cleared');
    await settle();
    assert.equal(storage.data.has(HANDOFF_KEY), false, 'the persisted record is removed with the discard');
  });

  it('2. [UNIT] clearing all changes removes the persisted pending Send', async () => {
    const { mod: h, storage } = fresh();
    await h.stageAgentHandoff();
    assert.ok(storage.data.has(HANDOFF_KEY), 'precondition: the accepted Send was persisted');
    h.clearAllChanges();
    assert.equal(h.getPending(), null, 'the in-memory marker is cleared');
    await settle();
    assert.equal(storage.data.has(HANDOFF_KEY), false, 'the persisted record is removed with the clear');
  });

  it('3. [UNIT] a discarded Send does not come back after a reload', async () => {
    const shared = fakeHandoffStorage();
    const first = fresh(shared);
    await first.mod.stageAgentHandoff();
    assert.ok(shared.data.has(HANDOFF_KEY), 'precondition: the accepted Send was persisted');
    first.mod.discardActiveChanges();
    await settle();
    assert.equal([...shared.data.keys()].filter(k => k.startsWith('dm-pending-handoff:')).length, 0, 'storage holds no marker after the discard');
    const reloaded = fresh(shared);
    const armed = await reloaded.mod.restorePendingHandoff();
    assert.equal(armed, false, 'a fresh content-script start must not re-arm a discarded Send');
    assert.equal(reloaded.mod.getPending(), null);
    assert.equal(reloaded.sent.filter(m => m.type === 'HANDOFF').length, 0, 'no HANDOFF is re-sent to the server');
  });

  it('4. [UNIT] a discarded Send cannot be delivered after a reconnect', async () => {
    const shared = fakeHandoffStorage();
    const first = fresh(shared);
    await first.mod.stageAgentHandoff();
    const discardedId = first.mod.getPending()!.id;
    first.mod.discardActiveChanges();
    await settle();
    const reconnected = fresh(shared);
    const armed = await reconnected.mod.restorePendingHandoff();
    assert.equal(armed, false, 'the reconnect restore path finds nothing to re-arm');
    assert.equal(reconnected.sent.filter(m => m.type === 'HANDOFF').length, 0, 'the reconnect pushes no HANDOFF, so the server can never deliver the discarded Send');
    assert.equal(reconnected.mod.applyHandoffDelivered({ id: discardedId, pageUrl: PAGE }), false, 'a late ack for the discarded Send matches nothing');
  });

  it("5. [UNIT] discarding a stale (older) Send cannot delete a newer Send's persisted record", async () => {
    const { mod: h, storage } = fresh();
    await h.stageAgentHandoff();
    const stale = h.getPending()!.id;
    const newer = seededRecord({ id: crypto.randomUUID() });
    storage.data.set(HANDOFF_KEY, newer);
    h.discardActiveChanges();
    await settle();
    const survivor = storage.data.get(HANDOFF_KEY) as Record<string, unknown> | undefined;
    assert.ok(survivor, "the newer Send's record survives the older Send's discard");
    assert.equal(survivor.id, newer.id, 'the surviving record is the newer Send, not the discarded one');
    assert.equal(h.getPending(), null, 'this tab\'s stale marker is still cleared');
    const next = fresh(storage);
    assert.equal(await next.mod.restorePendingHandoff(), true, "the newer Send is still deliverable — restore re-arms it");
    assert.equal(next.mod.getPending()!.id, newer.id);
    assert.equal(next.sent.filter(m => m.type === 'HANDOFF').length, 1);
  });

  it('6. [UNIT] normal recovery is intact — an un-acked Send still survives a reload and delivers after reconnect', async () => {
    const shared = fakeHandoffStorage();
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const offline = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => false,
      storage: shared,
    });
    const result = await offline.mod.stageAgentHandoff();
    assert.equal(result.ok, false);
    assert.match(result.error || '', /Not connected/);
    assert.ok(offline.mod.getPending(), 'the Send stays armed for recovery');
    assert.ok(shared.data.has(HANDOFF_KEY), 'and is persisted');
    await settle();
    const reloaded = fresh(shared);
    const armed = await reloaded.mod.restorePendingHandoff();
    assert.equal(armed, true, 'the reload re-arms the un-acked Send');
    assert.equal(reloaded.mod.getPending()!.id, offline.mod.getPending()!.id);
    assert.equal(reloaded.sent.filter(m => m.type === 'HANDOFF').length, 1, 'the reconnect re-sends the marker');
    const acked = reloaded.mod.applyHandoffDelivered({ id: reloaded.mod.getPending()!.id, pageUrl: PAGE });
    assert.equal(acked, true, 'the delivered Send acks normally');
    await settle();
    assert.equal(shared.data.has(HANDOFF_KEY), false, 'and its persisted record is removed by the ack');
  });

  it('7. [UNIT] an acked Send stays acked — a reload does not re-arm it', async () => {
    const shared = fakeHandoffStorage();
    const first = fresh(shared);
    await first.mod.stageAgentHandoff();
    const armed = first.mod.getPending()!;
    assert.equal(first.mod.applyHandoffDelivered({ id: armed.id, pageUrl: armed.pageUrl }), true);
    await settle();
    assert.equal([...shared.data.keys()].filter(k => k.startsWith('dm-pending-handoff:')).length, 0, 'the ack removed the persisted record');
    const reloaded = fresh(shared);
    const reArmed = await reloaded.mod.restorePendingHandoff();
    assert.equal(reArmed, false, 'reload does not re-arm an acked Send');
    assert.equal(reloaded.mod.getPending(), null);
    assert.equal(reloaded.sent.filter(m => m.type === 'HANDOFF').length, 0);
    assert.equal(reloaded.mod.applyHandoffDelivered({ id: armed.id }), false, 'nothing left to ack');
  });
});

// Completion fix: clearing the marker locally is not enough - the companion
// keeps its own copy of an armed marker via state.setHandoff and a fresh
// wait seeds a round from that copy, because createSession consumes
// state.getHandoff. Discard and clear must therefore also push a
// handoff-less SESSION_UPDATE that retracts the server-side marker.
const RETRACT_TITLE = 'discard/clear retract the server-side marker (completion)';
const RETRACT_TEST_DISCARD = 'discarding a pending Send retracts the companion marker with a handoff-less SESSION_UPDATE';
const RETRACT_DISCARD_MSG = 'the discard must retract the marker before any wait seeds a round from it';
const RETRACT_TEST_CLEAR = 'clearing all changes retracts the companion marker the same way';
const RETRACT_CLEAR_MSG = 'the clear must retract the marker before any wait seeds a round from it';
const RETRACT_TEST_NOOP = 'a discard with nothing pending sends no extra sync';
const RETRACT_NOOP_MSG = 'ordinary discards keep their existing traffic';
const RETRACT_NO_MARKER_MSG = 'the retraction carries no marker';
const APP_TITLE = 'App';
const MODE_KEY = 'dm-mcp-mode';
const MODE_LOCAL = 'local';
describe(RETRACT_TITLE, () => {
  const savedLocation = (globalThis as any).location;
  const savedDocument = (globalThis as any).document;
  afterEach(() => {
    (globalThis as any).location = savedLocation;
    (globalThis as any).document = savedDocument;
  });

  function fresh() {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: APP_TITLE };
    const h = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
    });
    h.storage.data.set(MODE_KEY, MODE_LOCAL);
    return h;
  }

  it(RETRACT_TEST_DISCARD, async () => {
    const h = fresh();
    await h.mod.stageAgentHandoff();
    const updatesBefore = h.sent.filter(m => m.type === RETRACT_TYPE).length;
    h.mod.discardActiveChanges();
    const retractions = h.sent.filter(m => m.type === RETRACT_TYPE).slice(updatesBefore);
    assert.equal(retractions.length, 1, RETRACT_DISCARD_MSG);
    assert.equal((retractions[0]!.payload as { handoff?: unknown } | undefined)?.handoff ?? undefined, undefined, RETRACT_NO_MARKER_MSG);
  });

  it(RETRACT_TEST_CLEAR, async () => {
    const h = fresh();
    await h.mod.stageAgentHandoff();
    const updatesBefore = h.sent.filter(m => m.type === RETRACT_TYPE).length;
    h.mod.clearAllChanges();
    const retractions = h.sent.filter(m => m.type === RETRACT_TYPE).slice(updatesBefore);
    assert.equal(retractions.length, 1, RETRACT_CLEAR_MSG);
    assert.equal((retractions[0]!.payload as { handoff?: unknown } | undefined)?.handoff ?? undefined, undefined, RETRACT_NO_MARKER_MSG);
  });

  it(RETRACT_TEST_NOOP, async () => {
    const h = fresh();
    h.mod.discardActiveChanges();
    assert.equal(h.sent.filter(m => m.type === RETRACT_TYPE).length, 0, RETRACT_NOOP_MSG);
  });
});
