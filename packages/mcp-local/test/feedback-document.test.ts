import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFeedbackSessionView, onExtensionConnect, onExtensionDisconnect,
  onHandoff, onSessionPage, resetFeedbackSessionForTests, stopFeedbackSession, waitForHandoff,
} from '../src/feedback-session.ts';
import { state } from '../src/state.ts';

const pageUrl = 'http://localhost/document';
beforeEach(() => { resetFeedbackSessionForTests(); state.clear(); });
afterEach(() => { resetFeedbackSessionForTests(); state.clear(); });

test('same-URL replacement stops a pending wait even when unload notification was lost', async () => {
  onSessionPage(pageUrl, 'document-a');
  const pending = waitForHandoff({ pageUrl, timeoutMs: 1000 });
  const initial = getFeedbackSessionView()!;
  onExtensionDisconnect();
  onExtensionConnect();
  onSessionPage(pageUrl, 'document-b');
  assert.deepEqual(await pending, { status: 'stopped', sessionId: initial.sessionId, cursor: 0 });
  onSessionPage(pageUrl, 'document-b');
  assert.equal((await waitForHandoff({ pageUrl, sessionId: initial.sessionId, after: 0 })).status, 'stopped');
  assert.equal(getFeedbackSessionView()!.state, 'stopped');
});

test('same-document socket reconnect preserves the wait', async () => {
  onSessionPage(pageUrl, 'document-a');
  let settled = false;
  const pending = waitForHandoff({ pageUrl, timeoutMs: 1000 }).then(result => { settled = true; return result; });
  onExtensionDisconnect();
  onExtensionConnect();
  onSessionPage(pageUrl, 'document-a');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(settled, false);
  assert.equal(getFeedbackSessionView()!.state, 'waiting');
  stopFeedbackSession();
  assert.equal((await pending).status, 'stopped');
});

test('same-URL document replacement also stops implementing without implicit restart', async () => {
  onSessionPage(pageUrl, 'document-a');
  const pending = waitForHandoff({ pageUrl, timeoutMs: 1000 });
  state.setHandoff({ requestedAt: Date.now(), pageUrl, pageTitle: 'Fixture' });
  onHandoff();
  const round = await pending;
  assert.equal(round.status, 'feedback');
  assert.equal(getFeedbackSessionView()!.state, 'implementing');
  onSessionPage(pageUrl, 'document-b');
  onHandoff();
  const resumed = await waitForHandoff({ pageUrl, sessionId: round.sessionId, after: round.cursor });
  assert.deepEqual(resumed, { status: 'stopped', sessionId: round.sessionId, cursor: round.cursor });
});

test('legacy and invalid document identifiers do not fabricate a replacement', async () => {
  onSessionPage(pageUrl, 'document-a');
  const pending = waitForHandoff({ pageUrl, timeoutMs: 1000 });
  for (const documentId of [undefined, '', 'x'.repeat(129)]) onSessionPage(pageUrl, documentId);
  assert.equal(getFeedbackSessionView()!.state, 'waiting');
  onSessionPage(pageUrl + '/other');
  assert.equal((await pending).status, 'stopped');
});
