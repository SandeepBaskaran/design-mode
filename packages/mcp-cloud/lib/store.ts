// ============================================================
// Design Mode Cloud — relay store.
//
// One Redis instance holds everything: tokens, per-tenant inbound
// queue, per-requestId outbound responses, and the daily quota counter.
// Provisioned via the Vercel Marketplace Redis (Upstash) integration,
// which auto-injects UPSTASH_REDIS_REST_URL/TOKEN.
//
// Inbound (cloud → extension):
//   RPUSH inbound:{tenantId}  the JSON message
//   EXPIRE the list to 60 s so abandoned tenants don't leak entries
//   LPOP up to N at a time on the SSE handler's poll cycle
//
// Outbound (extension → cloud, request/response):
//   SET resp:{requestId}  the JSON reply, EX 60 s
//   The MCP route GETs that key in a poll loop, deletes on hit
// ============================================================

import { kv } from './kv.js';

export const STREAM_TTL_S = 60;
export const POLL_INTERVAL_MS = 250;

export function inboundKey(tenantId: string): string { return `inbound:${tenantId}`; }
export function responseKey(requestId: string): string { return `resp:${requestId}`; }

export interface RelayMessage {
  type: string;
  requestId?: string;
  responseTo?: string;
  payload?: any;
}

// Push a relay message into the tenant's inbound queue. Bumps the TTL
// every push so an active tenant's queue doesn't expire mid-session.
export async function publishInbound(tenantId: string, msg: RelayMessage): Promise<void> {
  const key = inboundKey(tenantId);
  await kv().rpush(key, JSON.stringify(msg));
  try { await kv().expire(key, STREAM_TTL_S); } catch { /* non-fatal */ }
}

// Store a request/response payload keyed by the original requestId. The
// awaiting MCP route polls until it sees the key.
export async function publishResponse(requestId: string, msg: RelayMessage): Promise<void> {
  await kv().set(responseKey(requestId), JSON.stringify(msg), { ex: STREAM_TTL_S });
}

// Generator that yields inbound messages for a tenant, polling every
// POLL_INTERVAL_MS until aborted. Caller (the SSE handler) controls the
// loop — when the request signal aborts, the generator exits cleanly.
export async function* readInbound(opts: {
  tenantId: string;
  signal?: AbortSignal;
  pollMs?: number;
}): AsyncGenerator<RelayMessage, void, void> {
  const key = inboundKey(opts.tenantId);
  const pollMs = opts.pollMs ?? POLL_INTERVAL_MS;
  while (!opts.signal?.aborted) {
    let drained = false;
    try {
      // LPOP-many in one call when supported; fall back to single-pop
      // loop for clients that don't ship multi-pop.
      const raw = await (kv() as any).lpop(key, 16);
      const items: string[] = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
      for (const item of items) {
        if (typeof item !== 'string') continue;
        try { yield JSON.parse(item) as RelayMessage; }
        catch { /* skip malformed entry */ }
      }
      drained = items.length === 0;
    } catch {
      // Storage hiccup — back off a tick and retry.
      drained = true;
    }
    if (drained) await new Promise(r => setTimeout(r, pollMs));
  }
}

// Wait for a specific requestId's response to land in KV. Polls every
// POLL_INTERVAL_MS, deletes the key on hit, throws on timeout.
export async function awaitResponse(requestId: string, timeoutMs: number): Promise<RelayMessage> {
  const key = responseKey(requestId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await kv().get<string>(key);
    if (typeof raw === 'string') {
      try { await kv().del(key); } catch { /* non-fatal */ }
      try { return JSON.parse(raw) as RelayMessage; } catch { return { type: 'invalid' }; }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for extension response.');
}
