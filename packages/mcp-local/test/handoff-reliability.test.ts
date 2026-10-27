// Phase C handoff-reliability regression tests.
//
// Reproduces the audit finding "agents always got waiting": a Send that
// lands before any wait_for_handoff call has no live session to land on
// (onHandoff no-ops), so the first wait times out. Also covers orphaned
// sessions left behind when an attacher exits mid-wait.
import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { executeLocalTool } from '../src/tools.ts';
import { state } from '../src/state.ts';
import {
  getFeedbackSessionView,
  resetFeedbackSessionForTests,
  setDeliveredAckFileForTests,
  setDisconnectGraceMsForTests,
  stopFeedbackSession,
  waitForHandoff,
  DEFAULT_DISCONNECT_GRACE_MS,
} from '../src/feedback-session.ts';
import { claimOrAttach, probeOwnerHealth, proxyToolCall } from '../src/owner-bridge.ts';

const PAGE = 'https://example.com/app';
const OTHER_PAGE = 'https://example.com/other';

function parseTool(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }) {
  assert.equal(result.content[0]?.type, 'text');
  return JSON.parse((result.content[0] as { text: string }).text);
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('no address'));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function styleChange(id: string) {
  return {
    id,
    elementId: `dm-${id}`,
    selector: `#${id}`,
    property: 'color',
    oldValue: 'black',
    newValue: 'red',
    timestamp: Date.now(),
  };
}

async function openExtensionClient(port: number) {
  const health = await probeOwnerHealth(port);
  assert.ok(health?.webSocketToken);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(health.webSocketToken)}`);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 3000);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', reject);
  });
  return ws;
}

function send(ws: WebSocket, type: string, payload: unknown) {
  ws.send(JSON.stringify({ type, payload }));
}

describe('handoff before the first wait', () => {
  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
    setDisconnectGraceMsForTests(40);
  });

  afterEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
  });

  test('Send with no live session is delivered on the first wait', async () => {
    state.addStyleChange(styleChange('a'));
    // Extension clicked Send before the agent ever called wait_for_handoff:
    // the HANDOFF message stored the marker (websocket-server sets state)
    // but onHandoff had no live session to queue a round on.
    state.setHandoff({ requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
    const result = await waitForHandoff({ pageUrl: PAGE, timeoutMs: 300 });
    assert.equal(result.status, 'feedback');
    assert.equal(result.cursor, 1);
    const report = result.report as { styleChanges: Array<{ newValue: string }> };
    assert.equal(report.styleChanges[0]?.newValue, 'red');
    // The marker is consumed: get_session_summary must not keep reporting it.
    assert.equal(state.getHandoff(), null);
  });

  test('reconnect SESSION_UPDATE carrying handoff delivers on the first wait', async () => {
    state.addStyleChange(styleChange('b'));
    // Page reload after Send: the extension re-syncs SESSION_UPDATE with
    // report.handoff set. websocket-server stores it but never calls
    // onHandoff — session creation must still pick it up.
    state.setHandoff({ requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
    const result = await waitForHandoff({ pageUrl: PAGE, timeoutMs: 300 });
    assert.equal(result.status, 'feedback');
  });

  test('handoff for another page does not seed the session', async () => {
    state.setHandoff({ requestedAt: Date.now(), pageUrl: OTHER_PAGE, pageTitle: 'Other' });
    const result = await waitForHandoff({ pageUrl: PAGE, timeoutMs: 300 });
    assert.equal(result.status, 'waiting');
  });
});

describe('owner + extension-fake + attacher (real processes)', () => {
  let owner: Awaited<ReturnType<typeof claimOrAttach>> | null = null;

  before(async () => {
    resetFeedbackSessionForTests();
    state.clear();
    setDisconnectGraceMsForTests(60);
    owner = await claimOrAttach(await getFreePort());
  });

  after(async () => {
    resetFeedbackSessionForTests();
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
    await owner?.close();
    state.clear();
  });

  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  afterEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  test('(a) attacher waiting before Send receives feedback', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
      for (let i = 0; i < 100 && getFeedbackSessionView()?.state !== 'waiting'; i++) {
        await new Promise(r => setTimeout(r, 10));
      }
      assert.equal(getFeedbackSessionView()?.state, 'waiting');
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('s1')], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
      const result = parseTool(await pending);
      assert.equal(result.status, 'feedback');
      assert.equal(result.cursor, 1);
      const report = result.report as { styleChanges: Array<{ newValue: string }> };
      assert.equal(report.styleChanges[0]?.newValue, 'red');
    } finally {
      ws.close();
    }
  });

  test('(b) Send before the attacher connects is queued for the first wait', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      // Extension round-trip from stageAgentHandoff: SESSION_UPDATE first
      // (carrying no handoff yet), then the HANDOFF marker.
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('s2')], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
      await new Promise(r => setTimeout(r, 50));
      const result = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 1_000 }));
      assert.equal(result.status, 'feedback');
      const report = result.report as { styleChanges: Array<{ newValue: string }> };
      assert.equal(report.styleChanges[0]?.newValue, 'red');
    } finally {
      ws.close();
    }
  });

  test('(c) attacher exits; a new attacher adopts the orphaned session', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      // Attacher 1 waits, times out, and exits (no session stop — that is
      // what a real process death looks like over the proxy).
      const first = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 120 }));
      assert.equal(first.status, 'waiting');
      const orphanSessionId = first.sessionId;
      assert.ok(orphanSessionId);

      // Pending change + Send arrive while nobody is waiting.
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('s3')], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
      await new Promise(r => setTimeout(r, 50));

      // A known-but-stale sessionId still gets busy (protocol unchanged),
      // but a fresh attacher with no sessionId adopts the waiterless
      // session instead of bricking the port.
      const stale = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: orphanSessionId, after: 0, timeoutMs: 200 }));
      assert.equal(stale.status, 'feedback');

      // Simulate one more orphan cycle, then adoption with no sessionId.
      const second = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: stale.sessionId, after: stale.cursor, timeoutMs: 120 }));
      assert.equal(second.status, 'waiting');
      send(ws, 'HANDOFF', { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
      await new Promise(r => setTimeout(r, 50));
      const adopted = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 1_000 }));
      assert.equal(adopted.status, 'feedback');
      assert.equal(adopted.sessionId, stale.sessionId);
      assert.equal(adopted.cursor, stale.cursor + 1);
    } finally {
      ws.close();
    }
  });

  test('(d) timeout returns waiting cleanly over the proxy', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      const result = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 150 }));
      assert.equal(result.status, 'waiting');
      assert.equal(result.report, undefined);
    } finally {
      ws.close();
    }
  });

  test('(e) a delivered round is not re-delivered to later waits', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      const first = parseTool(await (async () => {
        const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
        for (let i = 0; i < 100 && getFeedbackSessionView()?.state !== 'waiting'; i++) {
          await new Promise(r => setTimeout(r, 10));
        }
        send(ws, 'HANDOFF', { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
        return await pending;
      })());
      assert.equal(first.status, 'feedback');
      assert.equal(first.cursor, 1);

      const replay = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: first.sessionId, after: first.cursor, timeoutMs: 200 }));
      assert.equal(replay.status, 'waiting');
      assert.equal(replay.report, undefined);
      assert.equal(replay.cursor, first.cursor);

      send(ws, 'HANDOFF', { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
      const second = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: first.sessionId, after: first.cursor, timeoutMs: 5_000 }));
      assert.equal(second.status, 'feedback');
      assert.equal(second.cursor, 2);
    } finally {
      ws.close();
    }
  });

  test('(f) extension disconnect stops the wait with extensionConnected false', async () => {
    const ws = await openExtensionClient(owner!.port);
    const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
    for (let i = 0; i < 100 && getFeedbackSessionView()?.state !== 'waiting'; i++) {
      await new Promise(r => setTimeout(r, 10));
    }
    assert.equal(getFeedbackSessionView()?.state, 'waiting');
    ws.close();
    const result = parseTool(await pending);
    assert.equal(result.status, 'stopped');
    const summary = parseTool(await proxyToolCall(owner!.port, 'get_session_summary', {}));
    assert.equal(summary.extensionConnected, false);
  });
});

// ── C.2: delivery identity, ack, and recovery ──
//
// The extension keeps its pendingHandoff until the server acks real delivery
// (HANDOFF_DELIVERED), and reconnects re-send SESSION_UPDATE carrying that
// marker. A marker whose Send an agent already received must never seed a
// second round in a later session; a marker that was never delivered must.
describe('handoff delivery identity across sessions (real processes)', () => {
  let owner: Awaited<ReturnType<typeof claimOrAttach>> | null = null;

  before(async () => {
    resetFeedbackSessionForTests();
    state.clear();
    setDisconnectGraceMsForTests(60);
    owner = await claimOrAttach(await getFreePort());
  });

  after(async () => {
    resetFeedbackSessionForTests();
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
    await owner?.close();
    state.clear();
  });

  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  afterEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  test('(g) a delivered Send is not re-delivered to a later session; a new Send is', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      const requestedAt = Date.now();
      const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
      for (let i = 0; i < 100 && getFeedbackSessionView()?.state !== 'waiting'; i++) {
        await new Promise(r => setTimeout(r, 10));
      }
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('g1')], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', { requestedAt, pageUrl: PAGE, pageTitle: 'App' });
      const first = parseTool(await pending);
      assert.equal(first.status, 'feedback');
      assert.equal(first.cursor, 1);

      // Extension reconnect re-sync: the same Send rides SESSION_UPDATE.
      ws.close();
      await new Promise(r => setTimeout(r, 150)); // grace stop destroys the delivered session
      const ws2 = await openExtensionClient(owner!.port);
      try {
        send(ws2, 'SESSION_UPDATE', {
          pageUrl: PAGE, pageTitle: 'App',
          styleChanges: [styleChange('g1')], textChanges: [], domChanges: [],
          handoff: { requestedAt, pageUrl: PAGE, pageTitle: 'App' },
        });
        await new Promise(r => setTimeout(r, 50));
        const replay = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 250 }));
        assert.equal(replay.status, 'waiting', 'the same Send must not deliver twice across sessions');
        assert.equal(state.getHandoff(), null, 'the re-armed marker is consumed silently');

        // A genuinely new Send in that same session still delivers.
        const wsSend = Date.now();
        send(ws2, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('g2')], textChanges: [], domChanges: [] });
        send(ws2, 'HANDOFF', { requestedAt: wsSend, pageUrl: PAGE, pageTitle: 'App' });
        const second = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: replay.sessionId, after: replay.cursor, timeoutMs: 2_000 }));
        assert.equal(second.status, 'feedback');
        assert.equal(second.cursor, 1);
      } finally {
        ws2.close();
      }
    } finally {
      ws.close();
    }
  });

  test('(h) delivery emits HANDOFF_DELIVERED with the Send identity', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      const got: Array<{ type: string; payload: any }> = [];
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'HANDOFF_DELIVERED') got.push(msg);
        } catch { /* ignore */ }
      });
      const requestedAt = Date.now();
      const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
      for (let i = 0; i < 100 && getFeedbackSessionView()?.state !== 'waiting'; i++) {
        await new Promise(r => setTimeout(r, 10));
      }
      send(ws, 'HANDOFF', { requestedAt, pageUrl: PAGE, pageTitle: 'App' });
      const first = parseTool(await pending);
      assert.equal(first.status, 'feedback');
      for (let i = 0; i < 100 && got.length === 0; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal(got.length, 1, 'exactly one delivery ack per Send');
      assert.deepEqual(got[0].payload, { requestedAt, pageUrl: PAGE, pageTitle: 'App' });
    } finally {
      ws.close();
    }
  });

  test('(i) a HANDOFF while implementing is ignored; the next explicit Send delivers round 2', async () => {
    const ws = await openExtensionClient(owner!.port);
    try {
      const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
      for (let i = 0; i < 100 && getFeedbackSessionView()?.state !== 'waiting'; i++) {
        await new Promise(r => setTimeout(r, 10));
      }
      send(ws, 'HANDOFF', { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
      const first = parseTool(await pending);
      assert.equal(first.status, 'feedback');
      assert.equal(getFeedbackSessionView()?.state, 'implementing');

      // Send-while-implementing semantics: the panel rejects the send with a
      // clear message (nothing is armed or silently discarded — the changes
      // stay in the page ledger), and the server ignores a HANDOFF that
      // races through anyway.
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('i2')], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', { requestedAt: Date.now() + 1, pageUrl: PAGE, pageTitle: 'App' });
      await new Promise(r => setTimeout(r, 50));
      assert.equal(getFeedbackSessionView()?.cursor, 1, 'no round is created while implementing');

      // The agent returns to its wait (state waiting); the user's next
      // accepted Send becomes round 2.
      const next = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: first.sessionId, after: first.cursor, timeoutMs: 200 }));
      assert.equal(next.status, 'waiting');
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('i3')], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', { requestedAt: Date.now() + 2, pageUrl: PAGE, pageTitle: 'App' });
      const second = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: first.sessionId, after: first.cursor, timeoutMs: 2_000 }));
      assert.equal(second.status, 'feedback', 'the next explicit Send is not lost');
      assert.equal(second.cursor, 2);
      const report = second.report as { styleChanges: Array<{ newValue: string }> };
      assert.equal(report.styleChanges[0]?.newValue, 'red');
    } finally {
      ws.close();
    }
  });

  test('(j) a handoff orphaned by timeout + disconnect is delivered to the next wait; a lost ack cannot re-deliver it', async () => {
    let ws = await openExtensionClient(owner!.port);
    try {
      // Attacher waits and times out; nobody is waiting when the Send lands.
      const timedOut = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 120 }));
      assert.equal(timedOut.status, 'waiting');
      const requestedAt = Date.now();
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('j1')], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', { requestedAt, pageUrl: PAGE, pageTitle: 'App' });
      await new Promise(r => setTimeout(r, 50));

      // Extension drops before any agent picks the round up (grace stop).
      ws.close();
      await new Promise(r => setTimeout(r, 150));

      // Reconnect: the extension still holds pendingHandoff (no ack yet) and
      // re-syncs it. The next wait must deliver it.
      const ws2 = await openExtensionClient(owner!.port);
      try {
        send(ws2, 'SESSION_UPDATE', {
          pageUrl: PAGE, pageTitle: 'App',
          styleChanges: [styleChange('j1')], textChanges: [], domChanges: [],
          handoff: { requestedAt, pageUrl: PAGE, pageTitle: 'App' },
        });
        const delivered = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 2_000 }));
        assert.equal(delivered.status, 'feedback', 'the undelivered Send survives disconnect and timeout');
        assert.equal(delivered.cursor, 1);

        // Ack was lost (extension missed HANDOFF_DELIVERED): the reconnect
        // re-arm of the SAME Send must not deliver a second time.
        ws2.close();
        await new Promise(r => setTimeout(r, 150));
        const ws3 = await openExtensionClient(owner!.port);
        try {
          send(ws3, 'SESSION_UPDATE', {
            pageUrl: PAGE, pageTitle: 'App',
            styleChanges: [styleChange('j1')], textChanges: [], domChanges: [],
            handoff: { requestedAt, pageUrl: PAGE, pageTitle: 'App' },
          });
          const replay = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 250 }));
          assert.equal(replay.status, 'waiting', 'no second delivery after the ack was already earned');
        } finally {
          ws3.close();
        }
      } finally {
        ws2.close();
      }
    } finally {
      ws.close();
    }
  });
});

// ── C.4: delivery survives owner restarts ──
//
// The owner's delivered-key set persists to a bounded 0600 file
// (DESIGN_MODE_HANDOFF_ACKS here; ~/.design-mode/ in production), so a
// Send delivered just before a crash — whose HANDOFF_DELIVERED never
// reached the extension — cannot re-deliver after the restart.
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'dist', 'bin', 'cli.js');

async function waitForOwnerUp(port: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const health = await probeOwnerHealth(port).catch(() => null);
    if (health?.webSocketToken) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`owner on port ${port} never came up`);
}

function killOwner(child: ChildProcess) {
  try { child.kill('SIGKILL'); } catch {}
}

describe('handoff delivery across owner restarts (real owner subprocesses)', () => {
  let port: number;
  let ackFile: string;
  const children: ChildProcess[] = [];

  function spawnOwner(): ChildProcess {
    const child = spawn(process.execPath, [CLI], {
      env: { ...process.env, DM_PORT: String(port), DESIGN_MODE_HANDOFF_ACKS: ackFile },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.push(child);
    return child;
  }

  before(async () => {
    port = await getFreePort();
    ackFile = path.join(tmpdir(), `dm-c4-acks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    setDisconnectGraceMsForTests(60);
  });

  after(async () => {
    rmSync(ackFile, { force: true });
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
  });

  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  afterEach(async () => {
    // Kill every owner this test spawned, and wait for the port to actually
    // free: a surviving owner would silently turn the next test's spawned
    // CLI into an attacher of the stale session instead of a real owner.
    for (const child of children.splice(0)) killOwner(child);
    for (let i = 0; i < 50; i++) {
      const health = await probeOwnerHealth(port).catch(() => null);
      if (!health) break;
      await new Promise(r => setTimeout(r, 100));
    }
    resetFeedbackSessionForTests();
    state.clear();
  });

  test('(k) restart before delivery: the re-armed Send still delivers, exactly once', async () => {
    const owner1 = spawnOwner();
    await waitForOwnerUp(port);
    const requestedAt = Date.now();
    const handoff = { id: crypto.randomUUID(), requestedAt, pageUrl: PAGE, pageTitle: 'App' };

    const ws1 = await openExtensionClient(port);
    send(ws1, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('k1')], textChanges: [], domChanges: [] });
    send(ws1, 'HANDOFF', handoff);
    await new Promise(r => setTimeout(r, 50));
    ws1.close();
    killOwner(owner1);
    await new Promise(r => setTimeout(r, 200));

    // Restart: the extension (still holding the un-acked marker) reconnects
    // and re-syncs SESSION_UPDATE carrying the same Send.
    const owner2 = spawnOwner();
    await waitForOwnerUp(port);
    const reacked: Array<{ type: string; payload: any }> = [];
    const ws2 = await openExtensionClient(port);
    ws2.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'HANDOFF_DELIVERED') reacked.push(msg);
      } catch { /* ignore */ }
    });
    try {
      send(ws2, 'SESSION_UPDATE', {
        pageUrl: PAGE, pageTitle: 'App',
        styleChanges: [styleChange('k1')], textChanges: [], domChanges: [],
        handoff,
      });
      const delivered = parseTool(await proxyToolCall(port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 2_000 }));
      assert.equal(delivered.status, 'feedback', 'the undelivered Send survives the owner restart');
      assert.equal(delivered.cursor, 1);
      for (let i = 0; i < 100 && reacked.length === 0; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal(reacked.length, 1, 'the delivery ack reaches the reconnecting extension');
      assert.equal(reacked[0].payload.id, handoff.id);

      // A later re-arm of the now-delivered Send must not deliver again.
      ws2.close();
      await new Promise(r => setTimeout(r, 150));
      const ws3 = await openExtensionClient(port);
      try {
        send(ws3, 'SESSION_UPDATE', {
          pageUrl: PAGE, pageTitle: 'App',
          styleChanges: [styleChange('k1')], textChanges: [], domChanges: [],
          handoff,
        });
        const replay = parseTool(await proxyToolCall(port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 300 }));
        assert.equal(replay.status, 'waiting', 'no second delivery across the restart');
      } finally {
        ws3.close();
      }
    } finally {
      ws2.close();
    }
  });

  test('(l) restart after delivery but before the ack reaches the extension: no re-delivery, and the reconnect re-acks', async () => {
    const owner1 = spawnOwner();
    await waitForOwnerUp(port);
    const requestedAt = Date.now();
    const handoff = { id: crypto.randomUUID(), requestedAt, pageUrl: PAGE, pageTitle: 'App' };

    // Extension sends the Send, then drops before any agent picks it up —
    // so when the wait delivers the round, the ack goes nowhere.
    const ws1 = await openExtensionClient(port);
    send(ws1, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('l1')], textChanges: [], domChanges: [] });
    send(ws1, 'HANDOFF', handoff);
    await new Promise(r => setTimeout(r, 50));
    ws1.close();
    const delivered = parseTool(await proxyToolCall(port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 2_000 }));
    assert.equal(delivered.status, 'feedback');
    assert.ok(existsSync(ackFile), 'the delivered key was persisted synchronously');

    // Crash the owner right after delivery; the ack never reached anyone.
    killOwner(owner1);
    await new Promise(r => setTimeout(r, 200));

    const owner2 = spawnOwner();
    await waitForOwnerUp(port);
    const reacked: Array<{ type: string; payload: any }> = [];
    const ws2 = await openExtensionClient(port);
    ws2.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'HANDOFF_DELIVERED') reacked.push(msg);
      } catch { /* ignore */ }
    });
    try {
      // Extension reconnect: the persisted marker re-arms via SESSION_UPDATE.
      send(ws2, 'SESSION_UPDATE', {
        pageUrl: PAGE, pageTitle: 'App',
        styleChanges: [styleChange('l1')], textChanges: [], domChanges: [],
        handoff,
      });
      await new Promise(r => setTimeout(r, 50));
      const replay = parseTool(await proxyToolCall(port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 400 }));
      assert.equal(replay.status, 'waiting', 'the restarted owner must not re-deliver a Send it already delivered');
      for (let i = 0; i < 100 && reacked.length === 0; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal(reacked.length, 1, 'exactly one re-ack so the extension can drop its persisted marker');
      assert.equal(reacked[0].payload.id, handoff.id);
    } finally {
      ws2.close();
    }
  });
});

describe('handoff ack recovery with a live owner (real process)', () => {
  let owner: Awaited<ReturnType<typeof claimOrAttach>> | null = null;
  let ackFile = '';

  before(async () => {
    resetFeedbackSessionForTests();
    state.clear();
    setDisconnectGraceMsForTests(60);
    ackFile = path.join(tmpdir(), `dm-c4-acks-m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    setDeliveredAckFileForTests(ackFile);
    owner = await claimOrAttach(await getFreePort());
  });

  after(async () => {
    resetFeedbackSessionForTests();
    setDeliveredAckFileForTests(null);
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
    await owner?.close();
    state.clear();
    rmSync(ackFile, { force: true });
  });

  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  afterEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  test('(m) ack lost while the extension is disconnected: re-ack on re-arm, no re-delivery, and the next Send delivers', async () => {
    const requestedAt = Date.now();
    const first = { id: crypto.randomUUID(), requestedAt, pageUrl: PAGE, pageTitle: 'App' };
    // Extension sends the Send and drops before any waiter exists — the
    // ack for this delivery has nowhere to go.
    const ws1 = await openExtensionClient(owner!.port);
    send(ws1, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('m1')], textChanges: [], domChanges: [] });
    send(ws1, 'HANDOFF', first);
    await new Promise(r => setTimeout(r, 50));
    ws1.close();

    const delivered = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 2_000 }));
    assert.equal(delivered.status, 'feedback');
    assert.ok(existsSync(ackFile), 'delivery persisted the key');

    // Reconnect + re-arm the same Send (the extension still holds it).
    const reacked: Array<{ type: string; payload: any }> = [];
    const ws2 = await openExtensionClient(owner!.port);
    ws2.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'HANDOFF_DELIVERED') reacked.push(msg);
      } catch { /* ignore */ }
    });
    try {
      send(ws2, 'SESSION_UPDATE', {
        pageUrl: PAGE, pageTitle: 'App',
        styleChanges: [styleChange('m1')], textChanges: [], domChanges: [],
        handoff: first,
      });
      await new Promise(r => setTimeout(r, 50));
      const replay = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 400 }));
      assert.equal(replay.status, 'waiting', 'no second delivery of the acked Send');
      for (let i = 0; i < 100 && reacked.length === 0; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal(reacked.length, 1, 'the re-arm earns a fresh HANDOFF_DELIVERED');
      assert.equal(reacked[0].payload.id, first.id);

      // A genuinely new Send after the acked one still delivers.
      const second = { id: crypto.randomUUID(), requestedAt: Date.now() + 1, pageUrl: PAGE, pageTitle: 'App' };
      send(ws2, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange('m2')], textChanges: [], domChanges: [] });
      send(ws2, 'HANDOFF', second);
      const next = parseTool(await proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, sessionId: replay.sessionId, after: replay.cursor, timeoutMs: 2_000 }));
      assert.equal(next.status, 'feedback', 'the new Send is not swallowed by the dedupe');
      assert.equal(next.cursor, replay.cursor + 1);
    } finally {
      ws2.close();
    }
  });
});

// Two live owners (different ports, e.g. two projects on one machine) share
// the production ack file. Neither owner's write may erase the entries the
// other recorded — last-writer-wins here would silently shrink the dedupe
// window below what the restart tests promise.
describe('two owners share one delivered-ack file (real owner subprocesses)', () => {
  const children: ChildProcess[] = [];
  let sharedAckFile = '';
  let portA = 0;
  let portB = 0;

  function spawnOwnerOn(port: number): ChildProcess {
    const child = spawn(process.execPath, [CLI], {
      env: { ...process.env, DM_PORT: String(port), DESIGN_MODE_HANDOFF_ACKS: sharedAckFile },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.push(child);
    return child;
  }

  async function deliverOn(port: number, tag: string, handoff: { id: string; requestedAt: number; pageUrl: string; pageTitle: string }) {
    const ws = await openExtensionClient(port);
    try {
      send(ws, 'SESSION_UPDATE', { pageUrl: PAGE, pageTitle: 'App', styleChanges: [styleChange(tag)], textChanges: [], domChanges: [] });
      send(ws, 'HANDOFF', handoff);
      const result = parseTool(await proxyToolCall(port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 }));
      assert.equal(result.status, 'feedback');
      return result;
    } finally {
      ws.close();
    }
  }

  function readAckKeys(): string[] {
    const parsed = JSON.parse(readFileSync(sharedAckFile, 'utf8')) as { version: number; entries: Array<{ k: string }> };
    assert.equal(parsed.version, 1);
    return parsed.entries.map(e => e.k);
  }

  afterEach(async () => {
    for (const child of children.splice(0)) killOwner(child);
    for (const port of [portA, portB]) {
      for (let i = 0; i < 50; i++) {
        const health = await probeOwnerHealth(port).catch(() => null);
        if (!health) break;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  });

  after(() => {
    if (sharedAckFile) rmSync(sharedAckFile, { force: true });
  });

  test('each owner’s delivery lands in the shared file and survives every interleaved write', async () => {
    sharedAckFile = path.join(tmpdir(), `dm-c4-acks-multi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    // Owner B's port is allocated after owner A is up and bound, so the OS
    // cannot hand the same port to both (a collision would make B an
    // attacher of A's session and the test would assert the wrong world).
    portA = await getFreePort();
    spawnOwnerOn(portA);
    await waitForOwnerUp(portA);
    portB = await getFreePort();
    assert.notEqual(portB, portA);
    spawnOwnerOn(portB);
    await waitForOwnerUp(portB);

    const sendA = { id: crypto.randomUUID(), requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' };
    const gotA = await deliverOn(portA, 'ma', sendA);

    const sendB = { id: crypto.randomUUID(), requestedAt: Date.now() + 1, pageUrl: PAGE, pageTitle: 'App' };
    await deliverOn(portB, 'mb', sendB);

    const keysAfterB = readAckKeys();
    assert.ok(keysAfterB.includes(sendA.id), 'owner A’s ack survives owner B’s write');
    assert.ok(keysAfterB.includes(sendB.id), 'owner B’s ack is recorded');

    // Owner A's agent returns to its wait (session implementing → waiting)
    // before the next Send — a HANDOFF while implementing is ignored by
    // design, so the interleaved write needs the session back at waiting.
    const idle = parseTool(await proxyToolCall(portA, 'wait_for_handoff', { pageUrl: PAGE, sessionId: gotA.sessionId, after: gotA.cursor, timeoutMs: 200 }));
    assert.equal(idle.status, 'waiting');

    // Owner A delivers again — its rewrite must re-merge owner B's entry.
    const sendA2 = { id: crypto.randomUUID(), requestedAt: Date.now() + 2, pageUrl: PAGE, pageTitle: 'App' };
    await deliverOn(portA, 'ma2', sendA2);
    const keysAfterA2 = readAckKeys();
    for (const key of [sendA.id, sendB.id, sendA2.id]) {
      assert.ok(keysAfterA2.includes(key), 'every acknowledgement survives the interleaved writes');
    }
  });
});
