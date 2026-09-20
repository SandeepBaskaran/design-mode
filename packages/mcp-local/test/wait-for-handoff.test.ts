import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { executeLocalTool } from '../src/tools.ts';
import { state } from '../src/state.ts';
import {
  getFeedbackSessionView,
  onExtensionDisconnect,
  onHandoff,
  onPageNavigated,
  resetFeedbackSessionForTests,
  setDisconnectGraceMsForTests,
  stopFeedbackSession,
  waitForHandoff,
  DEFAULT_DISCONNECT_GRACE_MS,
} from '../src/feedback-session.ts';
import { requestFromExtension, stopWebSocketServer } from '../src/websocket-server.ts';
import { claimOrAttach, probeOwnerHealth, proxyToolCall } from '../src/owner-bridge.ts';
import net from 'node:net';

const PAGE = 'https://example.com/app';
const OTHER_PAGE = 'https://example.com/other';

function parseTool(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }) {
  assert.equal(result.content[0]?.type, 'text');
  return JSON.parse((result.content[0] as { text: string }).text);
}

function addStyle(id: string, value: string) {
  state.addStyleChange({
    id,
    elementId: `dm-${id}`,
    selector: `#${id}`,
    property: 'color',
    oldValue: 'black',
    newValue: value,
    timestamp: Date.now(),
  });
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

async function waitForView(timeoutMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getFeedbackSessionView()?.state === 'waiting') return getFeedbackSessionView();
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error('timed out waiting for live session');
}

function sendHandoff(pageUrl = PAGE) {
  state.setHandoff({ requestedAt: Date.now(), pageUrl, pageTitle: 'App' });
  onHandoff();
}

describe('wait_for_handoff', () => {
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

  test('rejects invalid pageUrl', async () => {
    const result = await executeLocalTool('wait_for_handoff', { pageUrl: 'not-a-url' });
    assert.equal(result.isError, true);
    assert.match((result.content[0] as { text: string }).text, /pageUrl/);
  });

  test('two rounds with snapshot isolation', async () => {
    addStyle('a', 'red');
    state.addComment({
      id: 'c1',
      elementId: 'dm-a',
      selector: '#a',
      text: 'make it red',
      timestamp: Date.now(),
      updatedAt: Date.now(),
      pageUrl: PAGE,
    });
    state.updateSession({
      pageUrl: PAGE,
      pageTitle: 'App',
      tokenChanges: [{
        cssVar: '--brand',
        scopeSelector: ':root',
        oldValue: 'blue',
        newValue: 'red',
        cssRule: ':root { --brand: red; }',
      }],
      styleChanges: [],
      textChanges: [],
      cssBlock: '',
    });

    const waiting = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    const sessionId = getFeedbackSessionView()?.sessionId;
    assert.ok(sessionId);
    sendHandoff();
    const round1 = await waiting;
    assert.equal(round1.status, 'feedback');
    assert.equal(round1.sessionId, sessionId);
    assert.equal(round1.cursor, 1);
    const report1 = round1.report as {
      styleChanges: Array<{ newValue: string }>;
      comments: Array<{ id: string; text: string }>;
      tokenChanges: Array<{ cssVar: string }>;
      items: Array<{ id: string }>;
    };
    assert.equal(report1.styleChanges[0].newValue, 'red');
    assert.equal(report1.comments[0].id, 'c1');
    assert.equal(report1.tokenChanges[0].cssVar, '--brand');
    assert.ok(report1.items.some(i => i.id === 'a'));
    assert.ok(report1.items.some(i => i.id === 'c1'));
    assert.equal(getFeedbackSessionView()?.state, 'implementing');

    addStyle('b', 'green');
    assert.equal((report1.styleChanges as unknown[]).length, 1);
    assert.equal(report1.styleChanges[0].newValue, 'red');

    const waiting2 = waitForHandoff({ pageUrl: PAGE, sessionId, after: 1, timeoutMs: 5_000 });
    await Promise.resolve();
    assert.equal(getFeedbackSessionView()?.state, 'waiting');
    sendHandoff();
    const round2 = await waiting2;
    assert.equal(round2.status, 'feedback');
    assert.equal(round2.cursor, 2);
    const report2 = round2.report as { styleChanges: Array<{ newValue: string }>; items: Array<{ id: string }> };
    assert.deepEqual(report2.styleChanges.map(c => c.newValue), ['red', 'green']);
    assert.ok(report2.items.some(i => i.id === 'b'));
    assert.equal(report1.styleChanges.length, 1);
    assert.equal(report1.styleChanges[0].newValue, 'red');
    assert.ok(!report1.items.some(i => i.id === 'b'));
  });

  test('stop does not erase edits', async () => {
    addStyle('keep', 'purple');
    const pending = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    const sessionId = getFeedbackSessionView()!.sessionId;
    const stopped = stopFeedbackSession();
    assert.equal(stopped?.state, 'stopped');
    const result = await pending;
    assert.equal(result.status, 'stopped');
    assert.equal(result.sessionId, sessionId);
    assert.equal(state.getStyleChanges()[0].id, 'keep');
    const resume = await waitForHandoff({ pageUrl: PAGE, sessionId, timeoutMs: 50 });
    assert.equal(resume.status, 'stopped');
  });

  test('duplicate resume does not reconsume the same cursor', async () => {
    addStyle('a', 'red');
    const first = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    const sessionId = getFeedbackSessionView()!.sessionId;
    sendHandoff();
    const round1 = await first;
    assert.equal(round1.cursor, 1);

    const replay = await waitForHandoff({ pageUrl: PAGE, sessionId, after: 1, timeoutMs: 30 });
    assert.equal(replay.status, 'waiting');
    assert.equal(replay.cursor, 1);
    assert.equal(replay.report, undefined);
  });

  test('competing sessions and page mismatch return busy', async () => {
    const first = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    const sessionId = getFeedbackSessionView()!.sessionId;

    const noId = await waitForHandoff({ pageUrl: PAGE, timeoutMs: 20 });
    assert.equal(noId.status, 'busy');
    assert.equal(noId.sessionId, '');

    const otherId = await waitForHandoff({
      pageUrl: PAGE,
      sessionId: 'aaaaaaaaaaaaaaaaaaaaaa',
      timeoutMs: 20,
    });
    assert.equal(otherId.status, 'busy');

    const mismatch = await waitForHandoff({ pageUrl: OTHER_PAGE, sessionId, timeoutMs: 20 });
    assert.equal(mismatch.status, 'busy');

    stopFeedbackSession();
    await first;
  });

  test('cancellation leaves the session waiting', async () => {
    const ac = new AbortController();
    const pending = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 }, { signal: ac.signal });
    await Promise.resolve();
    const sessionId = getFeedbackSessionView()!.sessionId;
    ac.abort();
    const result = await pending;
    assert.equal(result.status, 'waiting');
    assert.equal(result.sessionId, sessionId);
    assert.equal(getFeedbackSessionView()?.state, 'waiting');
  });

  test('page navigation stops the live session', async () => {
    const pending = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    onPageNavigated(OTHER_PAGE);
    assert.equal(getFeedbackSessionView()?.state, 'waiting');
    onPageNavigated(PAGE);
    const result = await pending;
    assert.equal(result.status, 'stopped');
    assert.equal(getFeedbackSessionView()?.state, 'stopped');
  });
});

describe('feedback send bounds', () => {
  test('ignores duplicate sends while implementing and preserves the next explicit round', async () => {
    resetFeedbackSessionForTests();
    state.clear();
    const pending = waitForHandoff({ pageUrl: PAGE, timeoutMs: 100 });
    sendHandoff();
    const first = await pending;
    sendHandoff();
    sendHandoff();
    assert.equal(getFeedbackSessionView()?.cursor, 1);
    const next = await waitForHandoff({ pageUrl: PAGE, sessionId: first.sessionId, after: first.cursor, timeoutMs: 1 });
    assert.equal(next.status, 'waiting');
    sendHandoff();
    const second = await waitForHandoff({ pageUrl: PAGE, sessionId: first.sessionId, after: first.cursor, timeoutMs: 100 });
    assert.equal(second.status, 'feedback');
    assert.equal(second.cursor, 2);
    stopFeedbackSession();
    state.clear();
  });
});

describe('wait_for_handoff websocket disconnect', () => {
  let owner: Awaited<ReturnType<typeof claimOrAttach>> | null = null;

  before(async () => {
    resetFeedbackSessionForTests();
    state.clear();
    setDisconnectGraceMsForTests(40);
    owner = await claimOrAttach(await getFreePort());
  });

  after(async () => {
    resetFeedbackSessionForTests();
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
    await owner?.close();
    state.clear();
  });

  test('grace disconnect stops an in-flight wait', async () => {
    const port = owner!.port;
    const health = await probeOwnerHealth(port);
    assert.ok(health?.webSocketToken);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(health.webSocketToken)}`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws open timeout')), 3000);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', reject);
    });

    const pending = executeLocalTool('wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
    await waitForView();
    ws.close();
    const result = parseTool(await pending);
    assert.equal(result.status, 'stopped');
  });

  test('owner proxy keeps waiting after the HTTP request body is consumed', async () => {
    resetFeedbackSessionForTests();
    let settled = false;
    const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
    pending.then(() => { settled = true; });
    await waitForView();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(settled, false);
    state.setHandoff({ requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'Example' });
    onHandoff();
    assert.equal(parseTool(await pending).status, 'feedback');
    stopFeedbackSession();
  });

  test('owner proxy cancellation aborts the wait', async () => {
    const ac = new AbortController();
    const pending = proxyToolCall(owner!.port, 'wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 }, { signal: ac.signal });
    await waitForView();
    ac.abort();
    const result = await pending;
    assert.equal(result.isError, true);
  });
});

describe('wait_for_handoff disconnect helper', () => {
  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
    setDisconnectGraceMsForTests(20);
  });

  afterEach(() => {
    resetFeedbackSessionForTests();
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
  });

  test('disconnect grace without reconnect stops the waiter', async () => {
    const pending = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    onExtensionDisconnect();
    const result = await pending;
    assert.equal(result.status, 'stopped');
  });

  test('stop clears disconnect grace so a new session survives', async () => {
    const first = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    onExtensionDisconnect();
    const stopped = stopFeedbackSession();
    assert.equal(stopped?.state, 'stopped');
    assert.equal((await first).status, 'stopped');

    const second = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    const sessionId = getFeedbackSessionView()!.sessionId;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(getFeedbackSessionView()?.sessionId, sessionId);
    assert.equal(getFeedbackSessionView()?.state, 'waiting');
    stopFeedbackSession();
    await second;
  });
});

describe('feedback page mismatch', () => {
  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  afterEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  test('mismatched handoff keeps waiting and pushes the live session', async () => {
    const pending = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    const sessionId = getFeedbackSessionView()!.sessionId;
    state.setHandoff({ requestedAt: Date.now(), pageUrl: OTHER_PAGE, pageTitle: 'Other' });
    onHandoff();
    assert.equal(getFeedbackSessionView()?.sessionId, sessionId);
    assert.equal(getFeedbackSessionView()?.state, 'waiting');
    assert.equal(getFeedbackSessionView()?.cursor, 0);
    sendHandoff();
    const round = await pending;
    assert.equal(round.status, 'feedback');
    assert.equal(round.cursor, 1);
  });
});

describe('feedback websocket ownership', () => {
  let owner: Awaited<ReturnType<typeof claimOrAttach>> | null = null;

  before(async () => {
    resetFeedbackSessionForTests();
    state.clear();
    owner = await claimOrAttach(await getFreePort());
  });

  after(async () => {
    resetFeedbackSessionForTests();
    await owner?.close();
    state.clear();
  });

  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
  });

  async function openClient() {
    const health = await probeOwnerHealth(owner!.port);
    assert.ok(health?.webSocketToken);
    const ws = new WebSocket(`ws://127.0.0.1:${owner!.port}/?token=${encodeURIComponent(health.webSocketToken)}`);
    const messages: any[] = [];
    ws.on('message', (data) => {
      messages.push(JSON.parse(String(data)));
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws open timeout')), 3000);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', reject);
    });
    return { ws, messages };
  }

  async function waitForMsg(messages: any[], type: string, timeoutMs = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = messages.find(m => m.type === type);
      if (found) return found;
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error(`timed out waiting for ${type}`);
  }

  test('handshake pushes HELLO then Stop ACKs with FEEDBACK_SESSION', async () => {
    const { ws, messages } = await openClient();
    const hello = await waitForMsg(messages, 'HELLO');
    assert.equal(hello.payload?.agentConnected, true);

    const pending = executeLocalTool('wait_for_handoff', { pageUrl: PAGE, timeoutMs: 5_000 });
    await waitForView();
    const session = await waitForMsg(messages, 'FEEDBACK_SESSION');
    assert.equal(session.payload?.state, 'waiting');
    assert.equal(session.payload?.pageUrl, PAGE);

    messages.length = 0;
    ws.send(JSON.stringify({ type: 'STOP_FEEDBACK', payload: { sessionId: 'stale-session' } }));
    const reconciled = await waitForMsg(messages, 'FEEDBACK_SESSION');
    assert.equal(reconciled.payload.sessionId, session.payload.sessionId);
    assert.equal(reconciled.payload.state, 'waiting');

    ws.send(JSON.stringify({ type: 'STOP_FEEDBACK', payload: { sessionId: session.payload.sessionId } }));
    const result = parseTool(await pending);
    assert.equal(result.status, 'stopped');
    const start = Date.now();
    while (Date.now() - start < 1000) {
      if (messages.some(m => m.type === 'FEEDBACK_SESSION' && m.payload?.state === 'stopped')) break;
      await new Promise(r => setTimeout(r, 10));
    }
    assert.ok(messages.some(m => m.type === 'FEEDBACK_SESSION' && m.payload?.state === 'stopped'));
    assert.equal(getFeedbackSessionView()?.state, 'stopped');
    ws.close();
  });

  test('inactive socket cannot mutate state or reject pending', async () => {
    const first = await openClient();
    const second = await openClient();
    await waitForMsg(second.messages, 'HELLO');

    const waiting = waitForHandoff({ pageUrl: PAGE, timeoutMs: 5_000 });
    await Promise.resolve();
    assert.equal(getFeedbackSessionView()?.state, 'waiting');

    first.ws.send(JSON.stringify({
      type: 'HANDOFF',
      payload: { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' },
    }));
    await new Promise(r => setTimeout(r, 40));
    assert.equal(getFeedbackSessionView()?.state, 'waiting');
    assert.equal(getFeedbackSessionView()?.cursor, 0);

    let settled: Error | null = null;
    const req = requestFromExtension('PING', {}, 2_000).catch((err: Error) => {
      settled = err;
      throw err;
    });
    first.ws.close();
    await new Promise(r => setTimeout(r, 40));
    assert.equal(settled, null);

    second.ws.send(JSON.stringify({
      type: 'HANDOFF',
      payload: { requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' },
    }));
    const round = await waiting;
    assert.equal(round.status, 'feedback');
    second.ws.close();
    await assert.rejects(req);
    stopFeedbackSession();
  });

  test('server shutdown rejects pending and closes the socket', async () => {
    const { ws } = await openClient();
    const closed = new Promise<void>(resolve => ws.once('close', () => resolve()));
    const req = requestFromExtension('PING', {}, 5_000);
    stopWebSocketServer();
    await assert.rejects(req, /shutting down/);
    await closed;
  });
});
