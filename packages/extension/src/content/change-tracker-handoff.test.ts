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
}) {
  const source = readFileSync(new URL('./change-tracker.ts', import.meta.url), 'utf8');
  const declStart = source.indexOf('// Set when the user clicks "Send to Agent"');
  const helperStart = source.indexOf('export function applyHandoffDelivered');
  const helperEnd = source.indexOf('export function getStyleChanges');
  const fnStart = source.indexOf('export async function stageAgentHandoff');
  const fnEnd = source.indexOf('// --- Transport sync ---');
  assert.ok(declStart >= 0 && helperStart > declStart, 'pendingHandoff declaration block is missing');
  assert.ok(helperEnd > helperStart, 'applyHandoffDelivered block is missing');
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'stageAgentHandoff block is missing');
  const js = ts.transpileModule(
    [
      source.slice(declStart, helperStart),
      source.slice(helperStart, helperEnd).replace(/export /g, ''),
      source.slice(fnStart, fnEnd).replace(/export /g, ''),
      'return { stageAgentHandoff, applyHandoffDelivered, getPending: () => pendingHandoff };',
    ].join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const grab = vm.runInThisContext(
    `(function (isLiveFeedbackSupported, feedbackSession, isConnected, getFeedbackSessionView, waitForFeedbackAck, getSiteChangeReport, transportSend, syncCommentChange) { ${js} })`,
  );
  return grab(
    opts.isLiveFeedbackSupported,
    opts.feedbackSession,
    opts.isConnected,
    () => opts.feedbackSession,
    async () => opts.feedbackSession,
    async () => ({ comments: [] }),
    () => {},
    () => {},
  ) as {
    stageAgentHandoff(): Promise<{ ok: boolean; error?: string; handoff?: unknown; session: unknown }>;
    applyHandoffDelivered(payload: unknown): boolean;
    getPending(): { requestedAt: number; pageUrl: string; pageTitle: string } | null;
  };
}

const PAGE = 'https://example.test/app';

describe('stageAgentHandoff send-while-implementing (C.2)', () => {
  const savedLocation = (globalThis as any).location;
  const savedDocument = (globalThis as any).document;
  afterEach(() => {
    (globalThis as any).location = savedLocation;
    (globalThis as any).document = savedDocument;
  });

  it('a send rejected while implementing arms no marker and sends no HANDOFF', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const sent: Array<{ type: string }> = [];
    const h = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: { sessionId: 's1', pageUrl: PAGE, state: 'implementing', cursor: 1 },
      isConnected: () => true,
    });
    const result = await h.stageAgentHandoff();
    assert.equal(result.ok, false);
    assert.match(result.error || '', /implementing/);
    assert.equal(h.getPending(), null, 'a rejected send must not arm pendingHandoff');
    assert.equal(sent.filter(m => m.type === 'HANDOFF').length, 0);
  });

  it('a send rejected for a page mismatch arms no marker', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const h = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: { sessionId: 's1', pageUrl: 'https://example.test/other', state: 'waiting', cursor: 0 },
      isConnected: () => true,
    });
    const result = await h.stageAgentHandoff();
    assert.equal(result.ok, false);
    assert.match(result.error || '', /does not match/);
    assert.equal(h.getPending(), null);
  });

  it('an accepted send arms the marker and stamps monotonic Send ids', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const h = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
    });
    const first = await h.stageAgentHandoff();
    assert.equal(first.ok, true);
    const firstArmed = h.getPending();
    assert.equal(firstArmed?.pageUrl, PAGE);
    const firstAt = firstArmed!.requestedAt;
    const second = await h.stageAgentHandoff();
    assert.equal(second.ok, true);
    const secondArmed = h.getPending();
    assert.ok(secondArmed!.requestedAt > firstAt, 'two Sends in one millisecond must stay distinct');
  });

  it('HANDOFF_DELIVERED clears only the matching Send', async () => {
    (globalThis as any).location = { href: PAGE };
    (globalThis as any).document = { title: 'App' };
    const h = loadHandoff({
      isLiveFeedbackSupported: () => true,
      feedbackSession: null,
      isConnected: () => true,
    });
    await h.stageAgentHandoff();
    const armed = h.getPending()!;
    assert.equal(h.applyHandoffDelivered({ requestedAt: armed.requestedAt + 1, pageUrl: PAGE }), false, 'a newer Send is not cleared by an older ack');
    assert.ok(h.getPending());
    assert.equal(h.applyHandoffDelivered({ requestedAt: armed.requestedAt, pageUrl: armed.pageUrl }), true);
    assert.equal(h.getPending(), null, 'the acked Send is cleared');
    assert.equal(h.applyHandoffDelivered({ requestedAt: armed.requestedAt }), false, 'nothing left to clear');
  });
});
