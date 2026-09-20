export interface FeedbackSessionView {
  sessionId: string;
  pageUrl: string;
  state: 'waiting' | 'implementing' | 'stopped';
  cursor: number;
}

export function parseFeedbackSession(value: unknown): FeedbackSessionView | null {
  if (!value || typeof value !== 'object') return null;
  const session = value as Record<string, unknown>;
  if (typeof session.sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(session.sessionId)
    || typeof session.pageUrl !== 'string' || session.pageUrl.length > 2048
    || !['waiting', 'implementing', 'stopped'].includes(String(session.state))
    || !Number.isSafeInteger(session.cursor) || (session.cursor as number) < 0) return null;
  return { sessionId: session.sessionId, pageUrl: session.pageUrl, state: session.state as FeedbackSessionView['state'], cursor: session.cursor as number };
}
