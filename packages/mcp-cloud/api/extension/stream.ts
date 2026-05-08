// ============================================================
// GET /api/extension/stream
// Long-lived SSE channel: cloud → extension. The extension opens
// this once and leaves it; the agent's tools/call writes flow
// through inbound:{tenantId} and we forward each as an SSE event.
// Heartbeats every 25s keep proxies happy. Reconnect-friendly
// (extension just opens a new stream on close).
// ============================================================

import { authenticate } from '../../lib/auth.js';
import { readInbound } from '../../lib/store.js';
import { logEvent } from '../../lib/log.js';
import { corsHeaders, preflight, withCors } from '../../lib/cors.js';

export const config = { runtime: 'nodejs' };

export async function GET(req: Request): Promise<Response> {
  let row;
  try { row = await authenticate(req); }
  catch (resp) { return withCors(resp as Response); }

  const started = Date.now();
  const tenantId = row.tenantId;
  const ctrl = new AbortController();
  // Tie our long read to the underlying request lifetime — when the
  // browser closes the SSE, AbortSignal fires and the loop exits.
  req.signal.addEventListener('abort', () => ctrl.abort(), { once: true });

  const encoder = new TextEncoder();
  const heartbeatMs = 25_000;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };
      send('hello', JSON.stringify({ tenantId, version: '0.1.0' }));

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)); }
        catch { /* stream already closed */ }
      }, heartbeatMs);
      heartbeat.unref?.();

      try {
        for await (const msg of readInbound({ tenantId, signal: ctrl.signal })) {
          send('relay', JSON.stringify(msg));
          logEvent('stream.forward', {
            tenantId, type: msg.type,
            byteCount: typeof msg.payload === 'string' ? msg.payload.length : 0,
          });
        }
      } catch (err: any) {
        logEvent('stream.error', { tenantId, error: err?.code || 'unknown' });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
        logEvent('stream.close', { tenantId, latencyMs: Date.now() - started });
      }
    },
    cancel() { ctrl.abort(); },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(),
    },
  });
}

export async function OPTIONS() { return preflight(); }

export async function POST() {
  return new Response('Method Not Allowed', {
    status: 405, headers: { 'Allow': 'GET', ...corsHeaders() },
  });
}
