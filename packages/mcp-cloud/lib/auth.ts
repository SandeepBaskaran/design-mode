// ============================================================
// Design Mode Cloud — Anonymous device tokens, KV-backed.
// No email, no account. The token IS the credential. Lose it,
// generate a new one. Revoking deletes the row.
// ============================================================

import { kv } from './kv.js';
import { randomBytes, createHash } from 'node:crypto';

export interface TokenRow {
  tenantId: string;
  // Stored as SHA-256 hex of the actual token. The plaintext token is
  // shown to the user once on register and never persisted server-side.
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
}

const TOKEN_PREFIX = 'dm_';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintToken(): { token: string; tenantId: string } {
  const tenantId = 't_' + randomBytes(8).toString('hex');
  const token = TOKEN_PREFIX + randomBytes(24).toString('base64url');
  return { token, tenantId };
}

function rowKey(tokenHash: string): string { return `tok:${tokenHash}`; }

export async function storeToken(token: string, tenantId: string): Promise<TokenRow> {
  const row: TokenRow = {
    tenantId,
    tokenHash: hashToken(token),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  const c = await kv();
  await c.set(rowKey(row.tokenHash), JSON.stringify(row));
  return row;
}

// Bearer extraction. Used by every authenticated route.
export function bearerFromHeaders(headers: Headers): string | null {
  const a = headers.get('authorization') || headers.get('Authorization');
  if (!a) return null;
  const m = a.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

// Returns the row on success, null on bad/missing/revoked token. Updates
// lastSeenAt opportunistically.
export async function verifyToken(token: string | null | undefined): Promise<TokenRow | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const tokenHash = hashToken(token);
  const c = await kv();
  const raw = await c.get(rowKey(tokenHash));
  if (!raw) return null;
  let row: TokenRow;
  try { row = JSON.parse(raw) as TokenRow; }
  catch { return null; }
  // Best-effort lastSeenAt bump; ignore failures.
  row.lastSeenAt = Date.now();
  try { await c.set(rowKey(tokenHash), JSON.stringify(row)); } catch {}
  return row;
}

// Authentication middleware-style helper. Throws a Response on failure
// so callers can re-throw cleanly.
export async function authenticate(req: Request): Promise<TokenRow> {
  const token = bearerFromHeaders(req.headers);
  const row = await verifyToken(token);
  if (!row) {
    throw new Response(JSON.stringify({ error: 'invalid or missing token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return row;
}

export async function revokeToken(token: string | null | undefined): Promise<boolean> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return false;
  const tokenHash = hashToken(token);
  const c = await kv();
  return (await c.del(rowKey(tokenHash))) > 0;
}
