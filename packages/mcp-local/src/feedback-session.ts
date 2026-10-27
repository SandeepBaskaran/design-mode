import { randomBytes } from 'node:crypto';
import { state } from './state.js';

export const MAX_WAIT_MS = 20_000;
export const DEFAULT_DISCONNECT_GRACE_MS = 2_000;

export type FeedbackUiState = 'waiting' | 'implementing' | 'stopped';
export type FeedbackWaitStatus = 'waiting' | 'feedback' | 'stopped' | 'busy';

export type FeedbackSessionView = {
  sessionId: string;
  pageUrl: string;
  state: FeedbackUiState;
  cursor: number;
};

export type FeedbackWaitResult = {
  status: FeedbackWaitStatus;
  sessionId: string;
  cursor: number;
  report?: unknown;
};

export type ToolExtra = { signal?: AbortSignal };

type PendingRound = {
  cursor: number;
  report: unknown;
  // Identity of the Send that created this round (see handoffKeyOf).
  // Delivery dedupe keys off this, not the marker in state, so a marker
  // re-armed by a reconnecting extension cannot re-deliver a round an
  // agent already received — while a round that was never delivered
  // (timeout, disconnect) still can be.
  handoff: { requestedAt: number; pageUrl: string } | null;
};

type Waiter = {
  after: number;
  resolve: (result: FeedbackWaitResult) => void;
  timer: NodeJS.Timeout;
  abortHandler?: () => void;
  signal?: AbortSignal;
};

type LiveSession = {
  sessionId: string;
  pageUrl: string;
  state: FeedbackUiState;
  cursor: number;
  queue: PendingRound[];
  waiter: Waiter | null;
};

const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

let live: LiveSession | null = null;
let lastStopped: FeedbackSessionView | null = null;
let notifyUi: ((view: FeedbackSessionView | null) => void) | null = null;
let notifyDelivered: ((handoff: { requestedAt: number; pageUrl: string }) => void) | null = null;
let disconnectTimer: NodeJS.Timeout | null = null;
let disconnectGraceMs = DEFAULT_DISCONNECT_GRACE_MS;
let sessionDocumentId: string | null = null;
// Key of the last handoff actually delivered to an agent. One slot is
// enough: sessions are sequential and the key includes requestedAt (ms).
let lastDeliveredHandoffKey: string | null = null;

// Stable handoff identity across reconnects and session boundaries. The
// extension stamps every Send with requestedAt; the same marker can reach
// this module more than once (HANDOFF message, then a reconnecting
// SESSION_UPDATE that still carries it), and dedupe must not confuse that
// re-arm with a genuinely new Send.
function handoffKeyOf(handoff: { requestedAt: number; pageUrl: string }): string {
  return `${handoff.requestedAt}|${handoff.pageUrl}`;
}

export function setFeedbackSessionNotifier(fn: ((view: FeedbackSessionView | null) => void) | null) {
  notifyUi = fn;
}

// Fired exactly when a round reaches an agent (wait_for_handoff returned
// feedback). The extension clears its pendingHandoff on this — on send
// would break recovery after a timeout or disconnect.
export function setHandoffDeliveredNotifier(fn: ((handoff: { requestedAt: number; pageUrl: string }) => void) | null) {
  notifyDelivered = fn;
}

export function setDisconnectGraceMsForTests(ms: number) {
  disconnectGraceMs = ms;
}

export function resetFeedbackSessionForTests() {
  if (live?.waiter) {
    clearTimeout(live.waiter.timer);
    detachAbort(live.waiter);
  }
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
  live = null;
  lastStopped = null;
  sessionDocumentId = null;
  lastDeliveredHandoffKey = null;
}

export function getFeedbackSessionView(): FeedbackSessionView | null {
  if (!live) return lastStopped;
  return viewOf(live);
}

function viewOf(session: LiveSession): FeedbackSessionView {
  return {
    sessionId: session.sessionId,
    pageUrl: session.pageUrl,
    state: session.state,
    cursor: session.cursor,
  };
}

function freeze(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function busy(sessionId = '', cursor = 0): FeedbackWaitResult {
  return { status: 'busy', sessionId, cursor };
}

function stoppedResult(session: FeedbackSessionView): FeedbackWaitResult {
  return { status: 'stopped', sessionId: session.sessionId, cursor: session.cursor };
}

function notify() {
  notifyUi?.(getFeedbackSessionView());
}

function clearDisconnectTimer() {
  if (!disconnectTimer) return;
  clearTimeout(disconnectTimer);
  disconnectTimer = null;
}

function detachAbort(waiter: Waiter) {
  if (waiter.signal && waiter.abortHandler) {
    waiter.signal.removeEventListener('abort', waiter.abortHandler);
  }
}

function finishWaiter(session: LiveSession, result: FeedbackWaitResult) {
  const waiter = session.waiter;
  if (!waiter) return;
  session.waiter = null;
  clearTimeout(waiter.timer);
  detachAbort(waiter);
  waiter.resolve(result);
}

function parsePageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const pageUrl = raw.trim();
  if (!pageUrl || pageUrl.length > 2048) return null;
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'file:') return null;
    return pageUrl;
  } catch {
    return null;
  }
}

function parseSessionId(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !SESSION_ID_RE.test(raw)) return null;
  return raw;
}

function parseAfter(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || !Number.isSafeInteger(raw)) return null;
  return raw;
}

function parseTimeoutMs(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return null;
  return Math.min(raw, MAX_WAIT_MS);
}

function createSession(pageUrl: string): LiveSession {
  live = {
    sessionId: randomBytes(18).toString('base64url'),
    pageUrl,
    state: 'waiting',
    cursor: 0,
    queue: [],
    waiter: null,
  };
  lastStopped = null;
  // A Send that landed before any wait_for_handoff call has no live session
  // to land on — onHandoff would drop it. Seed round 1 from the pending
  // marker (HANDOFF message, or a reconnect SESSION_UPDATE that carried
  // report.handoff) so the first wait delivers it instead of timing out.
  // Freeze the report before consuming the marker.
  const handoff = state.getHandoff();
  if (handoff && (!handoff.pageUrl || handoff.pageUrl === pageUrl)) {
    // A marker whose Send an agent already received (earlier session) must
    // not re-deliver here — reconnects re-arm it from the extension's
    // pendingHandoff. Consume it without a round.
    if (handoffKeyOf(handoff) !== lastDeliveredHandoffKey) {
      live.cursor = 1;
      live.queue.push({ cursor: 1, report: freeze(state.getFullChangeReport()), handoff });
    }
    state.setHandoff(null);
  }
  notify();
  return live;
}

function consumeNext(session: LiveSession, after: number): PendingRound | null {
  const idx = session.queue.findIndex(round => round.cursor > after);
  if (idx < 0) return null;
  const round = session.queue[idx];
  session.queue.splice(0, idx + 1);
  return round;
}

function deliverFeedback(session: LiveSession, round: PendingRound): FeedbackWaitResult {
  session.state = 'implementing';
  if (round.handoff) {
    lastDeliveredHandoffKey = handoffKeyOf(round.handoff);
    notifyDelivered?.(round.handoff);
  }
  notify();
  return {
    status: 'feedback',
    sessionId: session.sessionId,
    cursor: round.cursor,
    report: round.report,
  };
}

export function waitForHandoff(args: Record<string, unknown> = {}, extra?: ToolExtra): Promise<FeedbackWaitResult> {
  const pageUrl = parsePageUrl(args.pageUrl);
  if (!pageUrl) {
    return Promise.reject(new Error('pageUrl is required and must be an http(s) or file URL'));
  }
  const sessionId = parseSessionId(args.sessionId);
  if (sessionId === null) {
    return Promise.reject(new Error('sessionId is invalid'));
  }
  const after = parseAfter(args.after);
  if (after === null) {
    return Promise.reject(new Error('after must be a non-negative integer'));
  }
  const timeoutMs = parseTimeoutMs(args.timeoutMs);
  if (timeoutMs === null) {
    return Promise.reject(new Error('timeoutMs must be an integer of at least 1'));
  }
  const waitMs = timeoutMs ?? MAX_WAIT_MS;
  const resumeAfter = after ?? 0;

  if (live && live.state !== 'stopped') {
    // An attacher that exited mid-wait leaves its session waiterless on the
    // owner. A fresh attacher with no sessionId adopts it instead of
    // bricking the port behind a busy it can never clear.
    const adoptable = !sessionId && !live.waiter && pageUrl === live.pageUrl;
    if (!sessionId || sessionId !== live.sessionId || pageUrl !== live.pageUrl) {
      if (!adoptable) {
        return Promise.resolve(busy(sessionId || '', resumeAfter));
      }
    }
    if (live.waiter) {
      return Promise.resolve(busy(live.sessionId, live.cursor));
    }
  } else if (sessionId) {
    if (lastStopped && lastStopped.sessionId === sessionId) {
      return Promise.resolve(stoppedResult(lastStopped));
    }
    return Promise.resolve(busy(sessionId, resumeAfter));
  } else {
    createSession(pageUrl);
  }

  const session = live!;
  session.state = 'waiting';
  notify();

  const ready = consumeNext(session, resumeAfter);
  if (ready) {
    return Promise.resolve(deliverFeedback(session, ready));
  }

  return new Promise(resolve => {
    const waiter: Waiter = {
      after: resumeAfter,
      resolve,
      timer: setTimeout(() => {
        if (session.waiter === waiter) {
          session.waiter = null;
          detachAbort(waiter);
          resolve({ status: 'waiting', sessionId: session.sessionId, cursor: session.cursor });
        }
      }, waitMs),
      signal: extra?.signal,
    };
    if (extra?.signal) {
      if (extra.signal.aborted) {
        clearTimeout(waiter.timer);
        resolve({ status: 'waiting', sessionId: session.sessionId, cursor: session.cursor });
        return;
      }
      waiter.abortHandler = () => {
        if (session.waiter !== waiter) return;
        session.waiter = null;
        clearTimeout(waiter.timer);
        detachAbort(waiter);
        resolve({ status: 'waiting', sessionId: session.sessionId, cursor: session.cursor });
      };
      extra.signal.addEventListener('abort', waiter.abortHandler, { once: true });
    }
    session.waiter = waiter;
  });
}

export function onHandoff() {
  if (!live) return;
  // While implementing (or with a round still queued) a HANDOFF is ignored:
  // the panel rejects the send with a clear message, the changes stay in the
  // page ledger, and the user's next accepted Send becomes the next round.
  if (live.state !== 'waiting' || live.queue.length) {
    notify();
    return;
  }
  const handoff = state.getHandoff();
  if (!handoff) {
    notify();
    return;
  }
  if (handoff.pageUrl && handoff.pageUrl !== live.pageUrl) {
    notify();
    return;
  }
  // A re-send of a marker whose Send an agent already received is consumed
  // without a round — never a second delivery of the same changes.
  if (handoffKeyOf(handoff) === lastDeliveredHandoffKey) {
    state.setHandoff(null);
    notify();
    return;
  }
  live.cursor += 1;
  const round: PendingRound = {
    cursor: live.cursor,
    report: freeze(state.getFullChangeReport()),
    handoff,
  };
  // The marker has done its job once the round exists; drop it so a
  // reconnect SESSION_UPDATE re-arm is recognizably a re-arm, not news.
  state.setHandoff(null);
  live.queue.push(round);
  if (live.waiter && round.cursor > live.waiter.after) {
    const delivered = consumeNext(live, live.waiter.after);
    if (delivered) {
      finishWaiter(live, deliverFeedback(live, delivered));
      return;
    }
  }
  live.state = 'implementing';
  notify();
}

export function stopFeedbackSession(sessionId?: string): FeedbackSessionView | null {
  if (!live) {
    if (sessionId && lastStopped && lastStopped.sessionId !== sessionId) return lastStopped;
    return lastStopped;
  }
  if (sessionId && sessionId !== live.sessionId) return viewOf(live);
  clearDisconnectTimer();
  live.state = 'stopped';
  lastStopped = viewOf(live);
  finishWaiter(live, stoppedResult(lastStopped));
  live = null;
  notify();
  return lastStopped;
}

export function onSessionPage(pageUrl?: string, documentId?: string) {
  const nextDocumentId = typeof documentId === 'string' && documentId.length > 0 && documentId.length <= 128 ? documentId : null;
  const documentChanged = nextDocumentId !== null && sessionDocumentId !== null && nextDocumentId !== sessionDocumentId;
  if (nextDocumentId !== null) sessionDocumentId = nextDocumentId;
  if (!live || live.state === 'stopped') return;
  // Unload-time WebSocket sends can be lost; a new document must not resume the old round.
  if (!documentChanged && (typeof pageUrl !== 'string' || !pageUrl || pageUrl === live.pageUrl)) return;
  stopFeedbackSession();
}

export function onPageNavigated(pageUrl?: string) {
  if (!live) return;
  if (typeof pageUrl === 'string' && pageUrl && pageUrl !== live.pageUrl) return;
  stopFeedbackSession();
}

export function onExtensionConnect() {
  clearDisconnectTimer();
  if (live || lastStopped) notify();
}

export function onExtensionDisconnect() {
  if (!live || live.state === 'stopped') return;
  clearDisconnectTimer();
  disconnectTimer = setTimeout(() => {
    disconnectTimer = null;
    stopFeedbackSession();
  }, disconnectGraceMs);
}
