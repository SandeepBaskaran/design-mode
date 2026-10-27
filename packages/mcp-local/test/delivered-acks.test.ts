// Delivered-ack file behaviour: multi-owner merge, permissions, atomic
// replacement, and explicit failure handling. The file is the durability
// contract for "a delivered Send is not delivered again" across owner
// restarts (see handoff-reliability.test.ts's owner-restart describes for
// the end-to-end protocol coverage).
import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { state } from '../src/state.ts';
import {
  DEFAULT_DISCONNECT_GRACE_MS,
  onHandoff,
  resetFeedbackSessionForTests,
  setDeliveredAckFileForTests,
  setDisconnectGraceMsForTests,
  waitForHandoff,
} from '../src/feedback-session.ts';

const PAGE = 'https://example.com/app';

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

function readAckEntries(file: string): Array<{ k: string; at: number }> {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version: number; entries: Array<{ k: string; at: number }> };
  assert.equal(parsed.version, 1);
  return parsed.entries;
}

async function deliverSend(id: string) {
  state.addStyleChange(styleChange(id));
  state.setHandoff({ id, requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
  const result = await waitForHandoff({ pageUrl: PAGE, timeoutMs: 2_000 });
  assert.equal(result.status, 'feedback', 'the Send is delivered in-process');
}

describe('delivered-ack file: merge, permissions, atomic writes', () => {
  let dir: string;
  let ackFile: string;
  const capturedWarns: unknown[][] = [];
  let originalWarn: typeof console.warn;

  before(() => {
    setDisconnectGraceMsForTests(40);
  });

  beforeEach(() => {
    resetFeedbackSessionForTests();
    state.clear();
    dir = mkdtempSync(path.join(tmpdir(), 'dm-acks-'));
    ackFile = path.join(dir, 'handoff-delivered.json');
    setDeliveredAckFileForTests(ackFile);
    capturedWarns.length = 0;
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { capturedWarns.push(args); };
  });

  afterEach(() => {
    console.warn = originalWarn;
    resetFeedbackSessionForTests();
    state.clear();
    try { chmodSync(dir, 0o755); } catch {}
    rmSync(dir, { recursive: true, force: true });
    setDeliveredAckFileForTests(null);
    setDisconnectGraceMsForTests(DEFAULT_DISCONNECT_GRACE_MS);
  });

  test('a delivery re-merges entries another owner recorded since our load (no last-writer-wins)', async () => {
    const foreignAt = Date.now() - 1_000;
    writeFileSync(ackFile, JSON.stringify({ version: 1, entries: [{ k: 'other-owner-key', at: foreignAt }] }));
    await deliverSend(crypto.randomUUID());
    const keys = readAckEntries(ackFile).map(e => e.k);
    assert.ok(keys.includes('other-owner-key'), 'the other owner’s acknowledgement survives our write');
    assert.equal(keys.length, 2, 'and our own key is recorded alongside it');
  });

  test('a pre-existing wide-mode file is tightened to owner-only on the next delivery', async () => {
    writeFileSync(ackFile, JSON.stringify({ version: 1, entries: [{ k: 'seed', at: Date.now() }] }), { mode: 0o644 });
    const before = statSync(ackFile).mode & 0o777;
    assert.equal(before, 0o644, 'precondition: the file starts world-readable');
    await deliverSend(crypto.randomUUID());
    const after = statSync(ackFile).mode & 0o777;
    assert.equal(after, 0o600, 'the replacement is owner-only, not just at first creation');
  });

  test('the replacement is atomic: a failed rename leaves the old file intact and no temp residue', async () => {
    writeFileSync(ackFile, JSON.stringify({ version: 1, entries: [{ k: 'previous', at: Date.now() }] }));
    // A directory at the ack-file path makes the final rename fail after the
    // temp write succeeded.
    rmSync(ackFile);
    mkdirSync(ackFile);
    await deliverSend(crypto.randomUUID());
    assert.ok(statSync(ackFile).isDirectory(), 'the blocked target was not clobbered');
    const residue = readdirSync(dir).filter(name => name.includes('.tmp'));
    assert.deepEqual(residue, [], 'the temp file is cleaned up');
  });

  test('a failed persistence write is explicit: warn once, never throw, in-memory dedupe still holds', async () => {
    const blockedDir = path.join(dir, 'not-a-dir');
    writeFileSync(blockedDir, 'x'); // mkdir at persist time will fail on this path
    setDeliveredAckFileForTests(path.join(blockedDir, 'nested', 'acks.json'));
    const id = crypto.randomUUID();
    await deliverSend(id);
    assert.equal(capturedWarns.length, 1, 'the persistence failure is logged exactly once');
    assert.match(String(capturedWarns[0]?.[0]), /handoff deliver/i);
    // The same Send re-armed is still deduped from memory alone.
    state.setHandoff({ id, requestedAt: Date.now(), pageUrl: PAGE, pageTitle: 'App' });
    onHandoff();
    const replay = await waitForHandoff({ pageUrl: PAGE, timeoutMs: 250 });
    assert.equal(replay.status, 'waiting', 'the delivered Send is deduped despite the failed write');
  });

  test('a corrupt existing file degrades to an empty set and is replaced by a valid file', async () => {
    writeFileSync(ackFile, '{not json at all');
    await deliverSend(crypto.randomUUID());
    const entries = readAckEntries(ackFile);
    assert.equal(entries.length, 1, 'our key is recorded on the fresh file');
  });
});
