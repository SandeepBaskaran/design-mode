// ============================================================
// Design Mode Cloud — single Redis client.
// `Redis.fromEnv()` reads UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN, both auto-injected by the Vercel
// Marketplace Redis (Upstash) integration. No explicit config
// needed at the call site.
// ============================================================

import { Redis } from '@upstash/redis';

let _client: Redis | null = null;

export function kv(): Redis {
  if (_client) return _client;
  // Will throw at first use if env vars are missing — preferable to a
  // silent misroute. The Marketplace integration is the only configured
  // path; local dev uses .env.local with the same names.
  _client = Redis.fromEnv();
  return _client;
}
