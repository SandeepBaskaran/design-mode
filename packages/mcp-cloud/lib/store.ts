// ============================================================
// Design Mode Cloud — relay store.
//
// One Redis instance holds everything: tokens, per-tenant inbound
// queue, per-requestId outbound responses, and the daily quota counter.
// Provisioned via the Vercel Marketplace Redis integration, which
// auto-injects REDIS_URL.
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

export async function publishInbound(tenantId: string, msg: RelayMessage): Promise<void> {
  const c = await kv();
  const key = inboundKey(tenantId);
  await c.rPush(key, JSON.stringify(msg));
  try { await c.expire(key, STREAM_TTL_S); } catch { /* non-fatal */ }
}

export async function publishResponse(requestId: string, msg: RelayMessage): Promise<void> {
  const c = await kv();
  await c.set(responseKey(requestId), JSON.stringify(msg), { EX: STREAM_TTL_S });
}

export async function* readInbound(opts: {
  tenantId: string;
  signal?: AbortSignal;
  pollMs?: number;
}): AsyncGenerator<RelayMessage, void, void> {
  const c = await kv();
  const key = inboundKey(opts.tenantId);
  const pollMs = opts.pollMs ?? POLL_INTERVAL_MS;
  while (!opts.signal?.aborted) {
    let drained = false;
    try {
      // node-redis v4: typed lPop only takes a key. The Redis ≥6.2 LPOP
      // count form is reachable via sendCommand and is much cheaper than
      // looping single-pops at every poll tick.
      const raw = (await c.sendCommand(['LPOP', key, '16'])) as string[] | string | null;
      const items: string[] = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
      for (const item of items) {
        if (typeof item !== 'string') continue;
        try { yield JSON.parse(item) as RelayMessage; }
        catch { /* skip malformed entry */ }
      }
      drained = items.length === 0;
    } catch {
      drained = true;
    }
    if (drained) await new Promise(r => setTimeout(r, pollMs));
  }
}

export async function awaitResponse(requestId: string, timeoutMs: number): Promise<RelayMessage> {
  const c = await kv();
  const key = responseKey(requestId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await c.get(key);
    if (typeof raw === 'string') {
      try { await c.del(key); } catch { /* non-fatal */ }
      try { return JSON.parse(raw) as RelayMessage; } catch { return { type: 'invalid' }; }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for extension response.');
}
