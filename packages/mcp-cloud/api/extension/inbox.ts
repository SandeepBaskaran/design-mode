// ============================================================
// POST /api/extension/inbox
// extension → cloud. Whenever the extension produces a reply
// (responseTo for a screenshot, status updates, etc.), it POSTs
// the same JSON shape it would have sent over the local WS. If it
// carries a `responseTo`, we stash the message under that key so
// the awaiting MCP route can pick it up directly. Anything without
// a `responseTo` is best-effort — there's no agent waiting on it,
// so we just log and drop.
// ============================================================

import { authenticate } from '../../lib/auth.js';
import { publishResponse, type RelayMessage } from '../../lib/store.js';
import { logEvent } from '../../lib/log.js';
import { corsHeaders, preflight, withCors } from '../../lib/cors.js';

export const config = { runtime: 'nodejs' };

const MAX_BODY_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  let row;
  try { row = await authenticate(req); }
  catch (resp) { return withCors(resp as Response); }

  let parsed: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      logEvent('inbox.tooLarge', { tenantId: row.tenantId, byteCount: raw.length, status: 413 });
      return new Response(JSON.stringify({ error: 'payload too large' }), {
        status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    return new Response(JSON.stringify({ error: 'malformed message' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const msg: RelayMessage = {
    type: parsed.type,
    requestId: typeof parsed.requestId === 'string' ? parsed.requestId : undefined,
    responseTo: typeof parsed.responseTo === 'string' ? parsed.responseTo : undefined,
    payload: parsed.payload,
  };
  if (msg.responseTo) {
    await publishResponse(msg.responseTo, msg);
  }
  logEvent('inbox.publish', {
    tenantId: row.tenantId, type: msg.type,
    latencyMs: Date.now() - started, status: 200,
  });
  return withCors(Response.json({ ok: true }));
}

export async function OPTIONS() { return preflight(); }

export async function GET() {
  return new Response('Method Not Allowed', {
    status: 405, headers: { 'Allow': 'POST', ...corsHeaders() },
  });
}
