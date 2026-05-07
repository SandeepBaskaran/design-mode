// ============================================================
// POST /api/auth/register
// Mints an anonymous device token + tenantId. Stores the row in
// Vercel KV and returns the plaintext token to the caller. The
// extension stores the token in chrome.storage.local — server-side
// we only ever keep the SHA-256 hash.
// ============================================================

import { mintToken, storeToken } from '../../lib/auth.js';
import { logEvent } from '../../lib/log.js';

export const config = { runtime: 'nodejs' };

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  try {
    const { token, tenantId } = mintToken();
    await storeToken(token, tenantId);
    const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0];
    const host = req.headers.get('host') || 'mcp.designmode.app';
    // Agent-facing URL is the short form. /api/mcp still resolves (rewrite
    // in vercel.json), but every config snippet we hand out should match
    // what hosted MCPs like Notion / Figma publish.
    const mcpUrl = `${proto}://${host}/mcp`;
    const streamUrl = `${proto}://${host}/api/extension/stream`;
    const inboxUrl = `${proto}://${host}/api/extension/inbox`;
    logEvent('auth.register', { tenantId, latencyMs: Date.now() - started, status: 200 });
    return Response.json({ token, tenantId, mcpUrl, streamUrl, inboxUrl });
  } catch (err: any) {
    logEvent('auth.register', { latencyMs: Date.now() - started, status: 500, error: err?.code || 'unknown' });
    return new Response(JSON.stringify({ error: 'register failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Reject every other method so a misconfigured client gets a clear hint.
export async function GET() {
  return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } });
}
