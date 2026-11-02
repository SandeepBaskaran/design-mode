// ============================================================
// Design Mode — cloud SSE stream helpers
// ============================================================
//
// The relay ends /api/extension/stream itself shortly before the function
// time limit and sends `event: reconnect` first. That is routine, not a
// failure: the client reconnects at once and stays "connected".

export interface SseFrame { event: string; data: string }

export function parseSseFrame(frame: string): SseFrame {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue; // comment / heartbeat
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  return { event, data };
}

/** A stream that lasted less than this and asked for a reconnect is not routine. */
export const MIN_HEALTHY_STREAM_MS = 5_000;

export interface ReconnectPlan { delayMs: number; backoffMs: number }

/**
 * How long to wait before opening the next stream.
 * - Server asked to reconnect after a healthy stream: immediately, backoff reset.
 * - Anything else (dropped connection, short-lived stream): the existing backoff.
 */
export function planReconnect(input: { reconnectRequested: boolean; streamOpenMs: number; backoffMs: number; maxBackoffMs?: number }): ReconnectPlan {
  const max = input.maxBackoffMs ?? 15_000;
  if (input.reconnectRequested && input.streamOpenMs >= MIN_HEALTHY_STREAM_MS) return { delayMs: 0, backoffMs: 1000 };
  return { delayMs: input.backoffMs, backoffMs: Math.min(input.backoffMs * 2, max) };
}
