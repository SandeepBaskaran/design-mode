// ============================================================
// Design Mode Cloud — single Redis client (node-redis).
// `REDIS_URL` is auto-injected by the Vercel Marketplace Redis
// integration. We connect lazily so cold-start cost is paid only
// once per function instance, then reused across invocations.
// ============================================================

import { createClient, type RedisClientType } from 'redis';

let _client: RedisClientType | null = null;
let _connectPromise: Promise<RedisClientType> | null = null;

async function ensureClient(): Promise<RedisClientType> {
  if (_client?.isOpen) return _client;
  if (_connectPromise) return _connectPromise;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL must be set (provision the Vercel Marketplace Redis integration).');

  const client: RedisClientType = createClient({
    url,
    socket: {
      // The instance is reused, so a long-lived connection is fine —
      // but if the broker drops us, retry a few times before giving up
      // so a single transient blip doesn't 500 a tool call.
      reconnectStrategy: (retries) => Math.min(retries * 50, 500),
    },
  });
  client.on('error', (err) => console.error('[redis]', err?.message || err));

  _connectPromise = client.connect().then(() => {
    _client = client;
    _connectPromise = null;
    return client;
  }).catch((err) => {
    _connectPromise = null;
    throw err;
  });
  return _connectPromise;
}

// Awaitable accessor. Routes call `await kv()` once and reuse the
// returned client for the rest of their work.
export async function kv(): Promise<RedisClientType> {
  return ensureClient();
}
