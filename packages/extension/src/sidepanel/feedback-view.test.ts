import { it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedbackSession } from './feedback-view.ts';

it('accepts only the bounded feedback session protocol', () => {
  const session = { sessionId: 'abcdefghijklmnop', pageUrl: 'https://example.test', state: 'waiting', cursor: 0 };
  assert.deepEqual(parseFeedbackSession(session), session);
  assert.equal(parseFeedbackSession({ ...session, state: '<img src=x>' }), null);
  assert.equal(parseFeedbackSession({ ...session, cursor: -1 }), null);
  assert.equal(parseFeedbackSession({ ...session, cursor: Infinity }), null);
  assert.equal(parseFeedbackSession({ ...session, sessionId: 'bad' }), null);
  assert.equal(parseFeedbackSession(null), null);
  assert.equal(parseFeedbackSession({}), null);
});
