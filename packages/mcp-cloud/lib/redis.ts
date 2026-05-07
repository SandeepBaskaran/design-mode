// ============================================================
// Design Mode Cloud — Upstash Redis Streams helpers.
//
// Two streams per tenant: inbound (cloud→extension) and outbound
// (extension→cloud). Trimmed aggressively so payloads do not linger.
//
// IMPORTANT: Upstash REST does NOT support XREAD's BLOCK option, so we
// short-poll instead. Loop interval is tuned to balance latency (lower
// is better) against Upstash request count (higher is cheaper). 250ms
// gives sub-second tool-call latency at modest cost.
// ============================================================

import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  _redis = new Redis({ url, token });
  return _redis;
}

export const STREAM_TTL_MS = 60_000;
export const STREAM_MAXLEN = 100;
export const POLL_INTERVAL_MS = 250;

export function inboundKey(tenantId: string): string { return `inbound:${tenantId}`; }
export function outboundKey(tenantId: string): string { return `outbound:${tenantId}`; }

export interface RelayMessage {
  type: string;
  requestId?: string;
  responseTo?: string;
  payload?: any;
}

// XADD with auto-trim by MAXLEN. We pair with a best-effort MINID xtrim
// after to enforce the time bound; xtrim failures are non-fatal because
// MAXLEN already caps memory.
export async function publish(stream: string, msg: RelayMessage): Promise<string> {
  const id = await redis().xadd(stream, '*', { data: JSON.stringify(msg) }, {
    trim: { type: 'MAXLEN', threshold: STREAM_MAXLEN, comparison: '~' },
  });
  try {
    await redis().xtrim(stream, {
      strategy: 'MINID',
      exactness: '~',
      threshold: `${Date.now() - STREAM_TTL_MS}-0`,
    });
  } catch { /* non-fatal */ }
  return id;
}

export async function publishInbound(tenantId: string, msg: RelayMessage) {
  return publish(inboundKey(tenantId), msg);
}
export async function publishOutbound(tenantId: string, msg: RelayMessage) {
  return publish(outboundKey(tenantId), msg);
}

// Normalize whatever shape Upstash returns into a flat list of entries.
// Upstash REST returns `null` when no entries are available, otherwise
// some Redis-array-shaped structure. We accept either flat-record or
// nested-array variants and skip anything we can't parse.
function normalizeXReadResult(raw: any): Array<{ id: string; data: string }> {
  if (!raw) return [];
  // Newer client shape: [{ stream: 'foo', messages: [{ id, message: { data: '...' } }] }]
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object' && 'messages' in raw[0]) {
    const msgs = (raw[0] as any).messages || [];
    return msgs.map((m: any) => ({ id: String(m.id ?? ''), data: String(m.message?.data ?? '') }))
      .filter((e: any) => e.id && e.data);
  }
  // Object-keyed shape: { 'streamname': { 'id-1': { data: '...' }, 'id-2': {...} } }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Array<{ id: string; data: string }> = [];
    for (const stream of Object.values(raw as Record<string, any>)) {
      if (!stream || typeof stream !== 'object') continue;
      for (const [id, fields] of Object.entries(stream as Record<string, any>)) {
        const data = (fields as any)?.data;
        if (typeof data === 'string') out.push({ id, data });
      }
    }
    return out;
  }
  // Tuple shape: [streamname, [[id, [field, val, ...]]]]
  if (Array.isArray(raw) && Array.isArray(raw[0]) && raw[0].length >= 2) {
    const entries = (raw[0] as any[])[1] as any[];
    if (!Array.isArray(entries)) return [];
    return entries.map(e => {
      const id = String((e as any[])[0] ?? '');
      const fields = (e as any[])[1] as any[];
      let data = '';
      if (Array.isArray(fields)) {
        for (let i = 0; i + 1 < fields.length; i += 2) {
          if (fields[i] === 'data') data = String(fields[i + 1]);
        }
      } else if (fields && typeof fields === 'object' && 'data' in fields) {
        data = String((fields as any).data);
      }
      return { id, data };
    }).filter(e => e.id && e.data);
  }
  return [];
}

// Polls a single stream once. Returns any new entries since `fromId`.
async function readSince(stream: string, fromId: string): Promise<Array<{ id: string; msg: RelayMessage }>> {
  const raw = await (redis() as any).xread(stream, fromId, { count: 16 });
  return normalizeXReadResult(raw)
    .map(({ id, data }) => {
      try { return { id, msg: JSON.parse(data) as RelayMessage }; }
      catch { return null; }
    })
    .filter((x): x is { id: string; msg: RelayMessage } => !!x);
}

// Generator that yields messages from a stream, polling every
// POLL_INTERVAL_MS until aborted. Caller controls the loop.
export async function* readStream(opts: {
  stream: string;
  fromId?: string;
  signal?: AbortSignal;
  pollMs?: number;
}): AsyncGenerator<{ id: string; msg: RelayMessage }, void, void> {
  let lastId = opts.fromId ?? '$';
  const pollMs = opts.pollMs ?? POLL_INTERVAL_MS;
  while (!opts.signal?.aborted) {
    let entries: Array<{ id: string; msg: RelayMessage }> = [];
    try { entries = await readSince(opts.stream, lastId); }
    catch { /* swallow; will retry next tick */ }
    for (const e of entries) {
      lastId = e.id;
      yield e;
    }
    if (entries.length === 0) {
      await new Promise(r => setTimeout(r, pollMs));
    }
  }
}

// Resolves with the first message matching `predicate`, or rejects on
// timeout. Used by /mcp routes that await a specific `requestId` reply.
export async function awaitFirst(opts: {
  stream: string;
  predicate: (m: RelayMessage) => boolean;
  timeoutMs: number;
}): Promise<RelayMessage> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    for await (const { msg } of readStream({ stream: opts.stream, signal: ctrl.signal })) {
      if (opts.predicate(msg)) return msg;
    }
    throw new Error('Aborted before a matching message arrived.');
  } finally {
    clearTimeout(t);
  }
}
