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
let disconnectTimer: NodeJS.Timeout | null = null;
let disconnectGraceMs = DEFAULT_DISCONNECT_GRACE_MS;

export function setFeedbackSessionNotifier(fn: ((view: FeedbackSessionView | null) => void) | null) {
  notifyUi = fn;
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
    if (!sessionId || sessionId !== live.sessionId || pageUrl !== live.pageUrl) {
      return Promise.resolve(busy(sessionId || '', resumeAfter));
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
  if (live.state !== 'waiting' || live.queue.length) {
    notify();
    return;
  }
  const handoff = state.getHandoff();
  if (handoff?.pageUrl && handoff.pageUrl !== live.pageUrl) {
    notify();
    return;
  }
  live.cursor += 1;
  const round: PendingRound = {
    cursor: live.cursor,
    report: freeze(state.getFullChangeReport()),
  };
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

export function onSessionPage(pageUrl?: string) {
  if (!live || live.state === 'stopped') return;
  if (typeof pageUrl !== 'string' || !pageUrl || pageUrl === live.pageUrl) return;
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
