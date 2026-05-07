// ============================================================
// POST /api/auth/revoke
// Authenticated. Invalidates the bearer token. Active SSE streams
// for this tenant will drop on the next heartbeat (the stream
// handler re-checks on every loop iteration).
// ============================================================

import { bearerFromHeaders, revokeToken, verifyToken } from '../../lib/auth.js';
import { logEvent } from '../../lib/log.js';

export const config = { runtime: 'nodejs' };

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  const token = bearerFromHeaders(req.headers);
  const row = await verifyToken(token);
  if (!row || !token) {
    logEvent('auth.revoke', { latencyMs: Date.now() - started, status: 401 });
    return new Response(JSON.stringify({ error: 'invalid or missing token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const ok = await revokeToken(token);
  logEvent('auth.revoke', { tenantId: row.tenantId, latencyMs: Date.now() - started, status: ok ? 200 : 404 });
  return Response.json({ ok });
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } });
}
