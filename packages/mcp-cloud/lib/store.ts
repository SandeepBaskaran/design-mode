// ============================================================
// DIVE Cloud — relay store.
//
// One Redis instance holds everything: tokens, per-tenant inbound
// queue, per-tenant/requestId outbound responses, and the daily quota counter.
// Provisioned via the Vercel Marketplace Redis integration, which
// auto-injects REDIS_URL.
//
// Inbound (cloud → extension):
//   RPUSH inbound:{tenantId}  the JSON message
//   EXPIRE the list to 60 s so abandoned tenants don't leak entries
//   LPOP one at a time on the SSE handler's poll cycle, only by the
//   tenant's current stream ({inbound:<tenantId>}:owner, a leased stream ID)
//
// Outbound (extension → cloud, request/response):
//   SET resp:{tenantId}:{requestId}  the JSON reply, EX 60 s
//   The MCP route GETs that key in a poll loop, deletes on hit
// ============================================================

import { kv } from './kv.js';
import { logEvent } from './log.js';

export const STREAM_TTL_S = 60;
export const POLL_INTERVAL_MS = 250;
export const OWNER_LEASE_MS = 30_000;

// The hash tag makes Redis Cluster slot the owner key by the full inbound key
// name, so both keys of the consume script share a slot (no CROSSSLOT) while
// the existing inbound:{tenantId} queue keeps its name and pending entries.
export function ownerKey(tenantId: string): string { return `{${inboundKey(tenantId)}}:owner`; }
export function evictedKey(tenantId: string): string { return `{${inboundKey(tenantId)}}:evicted`; }
export function takerKey(tenantId: string, requestId: string): string { return `{${inboundKey(tenantId)}}:taker:${requestId}`; }
export const EVICTED_TTL_MS = 600_000;

export function inboundKey(tenantId: string): string { return `inbound:${tenantId}`; }
export function responseKey(tenantId: string, requestId: string): string { return `resp:${tenantId}:${requestId}`; }

export interface RelayMessage {
  type: string;
  requestId?: string;
  responseTo?: string;
  payload?: any;
}

export async function publishInbound(tenantId: string, msg: RelayMessage): Promise<void> {
  const c = await kv();
  const key = inboundKey(tenantId);
  await c.multi()
    .rPush(key, JSON.stringify(msg))
    .expire(key, STREAM_TTL_S)
    .exec();
}

export async function publishResponse(tenantId: string, requestId: string, msg: RelayMessage): Promise<void> {
  const c = await kv();
  await c.set(responseKey(tenantId, requestId), JSON.stringify(msg), { EX: STREAM_TTL_S });
}

// Every tenant stream polls the same queue, and a stale stream (reloaded
// page, closed browser) can stay alive server-side for minutes. Only the
// owner may pop, and the ownership check, lease refresh and pop are one
// script so no other stream can claim in between. A missing owner (expired
// lease or released) is claimed by whichever stream polls next.
export const CONSUME_SCRIPT = `
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 1 then return {2} end
local owner = redis.call('GET', KEYS[1])
if not owner then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
elseif owner ~= ARGV[1] then
  return {0}
else
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local item = redis.call('LPOP', KEYS[2])
if not item then return {1} end
return {1, item}
`;

// The extension answers every request it receives, so an unanswered one means
// the stream that took it is dead even though the platform never told us (a
// closed tab can keep its function, and its lease, alive for minutes). Evict
// that stream: it may no longer consume, and its ownership is released so a
// live stream takes over on its next poll.
export const EVICT_SCRIPT = `
local taker = redis.call('GET', KEYS[2])
if not taker then return 0 end
redis.call('SADD', KEYS[3], taker)
redis.call('PEXPIRE', KEYS[3], ARGV[1])
if redis.call('GET', KEYS[1]) == taker then redis.call('DEL', KEYS[1]) end
redis.call('DEL', KEYS[2])
return 1
`;

export const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

// Newest stream wins: a reconnecting page supersedes whatever stale stream
// still holds the lease.
export async function claimOwner(tenantId: string, streamId: string): Promise<void> {
  const c = await kv();
  await c.set(ownerKey(tenantId), streamId, { PX: OWNER_LEASE_MS });
}

export async function releaseOwner(tenantId: string, streamId: string): Promise<void> {
  const c = await kv();
  await c.sendCommand(['EVAL', RELEASE_SCRIPT, '1', ownerKey(tenantId), streamId]);
}

export async function consumeInbound(tenantId: string, streamId: string): Promise<{ owner: boolean; evicted: boolean; item: string | null }> {
  const c = await kv();
  const raw = (await c.sendCommand([
    'EVAL', CONSUME_SCRIPT, '3', ownerKey(tenantId), inboundKey(tenantId), evictedKey(tenantId), streamId, String(OWNER_LEASE_MS),
  ])) as unknown[];
  const item = raw?.[1];
  const state = Number(raw?.[0]);
  return { owner: state === 1, evicted: state === 2, item: typeof item === 'string' ? item : null };
}

export async function recordTaker(tenantId: string, requestId: string, streamId: string): Promise<void> {
  const c = await kv();
  await c.set(takerKey(tenantId, requestId), streamId, { PX: STREAM_TTL_S * 1000 });
}

export async function evictTaker(tenantId: string, requestId: string): Promise<boolean> {
  const c = await kv();
  const evicted = await c.sendCommand([
    'EVAL', EVICT_SCRIPT, '3', ownerKey(tenantId), takerKey(tenantId, requestId), evictedKey(tenantId), String(EVICTED_TTL_MS),
  ]);
  return Number(evicted) === 1;
}

// Puts an undeliverable message back at the head so the next owner gets it.
export async function requeueInbound(tenantId: string, msg: RelayMessage): Promise<void> {
  const c = await kv();
  const key = inboundKey(tenantId);
  await c.multi()
    .lPush(key, JSON.stringify(msg))
    .expire(key, STREAM_TTL_S)
    .exec();
}

export async function* readInbound(opts: {
  tenantId: string;
  streamId: string;
  signal?: AbortSignal;
  pollMs?: number;
  isAuthorized?: () => Promise<boolean>;
  onOwnership?: (owner: boolean) => void;
}): AsyncGenerator<RelayMessage, void, void> {
  const pollMs = opts.pollMs ?? POLL_INTERVAL_MS;
  // Logged once per run of failures, not on every poll tick; the queue is
  // untouched on failure, so the next successful poll still delivers.
  let failing = false;
  let owner: boolean | null = null;
  while (!opts.signal?.aborted) {
    if (opts.isAuthorized && !(await opts.isAuthorized())) return;
    if (opts.signal?.aborted) return;
    let item: string | null = null;
    try {
      const result = await consumeInbound(opts.tenantId, opts.streamId);
      if (result.evicted) {
        logEvent('relay.stream.evicted', { tenantId: opts.tenantId });
        return;
      }
      item = result.item;
      if (result.owner !== owner) {
        owner = result.owner;
        opts.onOwnership?.(owner);
      }
      if (failing) {
        failing = false;
        logEvent('relay.inbound.consume_recovered', { tenantId: opts.tenantId });
      }
    } catch (err: any) {
      if (!failing) {
        failing = true;
        logEvent('relay.inbound.consume_error', { tenantId: opts.tenantId, error: err?.code || err?.name || 'unknown' });
      }
    }
    if (item === null) {
      await new Promise(r => setTimeout(r, pollMs));
      continue;
    }
    try { yield JSON.parse(item) as RelayMessage; }
    catch { logEvent('relay.inbound.malformed', { tenantId: opts.tenantId, byteCount: Buffer.byteLength(item, 'utf8') }); }
  }
}

export async function awaitResponse(tenantId: string, requestId: string, timeoutMs: number): Promise<RelayMessage> {
  const c = await kv();
  const key = responseKey(tenantId, requestId);
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
