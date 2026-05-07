// ============================================================
// POST /api/extension/inbox
// extension → cloud. Whenever the extension produces a reply
// (responseTo for a screenshot, change events, status updates),
// it POSTs the same JSON shape it would have sent over the local
// WebSocket. We enqueue it onto outbound:{tenantId}.
// ============================================================

import { authenticate } from '../../lib/auth.js';
import { publishOutbound, type RelayMessage } from '../../lib/redis.js';
import { logEvent } from '../../lib/log.js';

export const config = { runtime: 'nodejs' };

const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6 MB cap — guards against runaway screenshots.

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  let row;
  try { row = await authenticate(req); }
  catch (resp) { return resp as Response; }

  let parsed: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      logEvent('inbox.tooLarge', { tenantId: row.tenantId, byteCount: raw.length, status: 413 });
      return new Response(JSON.stringify({ error: 'payload too large' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    return new Response(JSON.stringify({ error: 'malformed message' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const msg: RelayMessage = {
    type: parsed.type,
    requestId: typeof parsed.requestId === 'string' ? parsed.requestId : undefined,
    responseTo: typeof parsed.responseTo === 'string' ? parsed.responseTo : undefined,
    payload: parsed.payload,
  };
  await publishOutbound(row.tenantId, msg);
  logEvent('inbox.publish', { tenantId: row.tenantId, type: msg.type, latencyMs: Date.now() - started, status: 200 });
  return Response.json({ ok: true });
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } });
}
