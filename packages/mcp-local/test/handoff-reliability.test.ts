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
import { executeLocalTool } from '../src/tools.ts';
import { state } from '../src/state.ts';
import {
  getFeedbackSessionView,
  resetFeedbackSessionForTests,
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
