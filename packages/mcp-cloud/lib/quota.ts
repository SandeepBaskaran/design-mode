// ============================================================
// Design Mode Cloud — Per-tenant daily quota.
//
// One tool call = one INCR. The key is namespaced by UTC date so it
// auto-rolls at midnight and old keys expire on their own. Cheap (one
// Upstash op per call) and the tenant gets a clean MCP error the moment
// they hit the cap, with a precise reset time.
// ============================================================

import { kv } from './kv.js';

// Default cap. Override per-deployment via env without changing code.
export const DAILY_TOOL_CALL_LIMIT = (() => {
  const n = parseInt(process.env.DM_DAILY_QUOTA || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 25;
})();

function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
}

function nextUtcMidnightMs(now = Date.now()): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  // Unix ms — when the counter rolls back to 0. Surface this in the
  // error message so the agent can tell the user.
  resetAt: number;
}

// Atomic increment + read. EXPIRE only fires on the first call of the
// day (when the counter just became 1) so we don't keep extending the
// TTL — the day's bucket dies a few minutes after midnight either way.
export async function consumeQuota(tenantId: string): Promise<QuotaResult> {
  const key = `quota:${tenantId}:${utcDayKey()}`;
  const used = await kv().incr(key);
  if (used === 1) {
    // 24h + a small grace period so the bucket survives a clock skew at
    // midnight. The next day's INCR creates a fresh key anyway.
    try { await kv().expire(key, 90_000); } catch { /* non-fatal */ }
  }
  const allowed = used <= DAILY_TOOL_CALL_LIMIT;
  return { allowed, used, limit: DAILY_TOOL_CALL_LIMIT, resetAt: nextUtcMidnightMs() };
}
