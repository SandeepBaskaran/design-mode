// ============================================================
// GET /api/extension/stream
// Long-lived SSE channel: cloud → extension. The extension opens
// this once and leaves it; the agent's tools/call writes flow
// through inbound:{tenantId} and we forward each as an SSE event.
// Heartbeats every 25s keep proxies happy. Reconnect-friendly
// (extension just opens a new stream on close).
//
// Vercel stops the function at maxDuration (300s, see vercel.json) and
// logs that as a timeout error. To avoid being killed mid-frame we end
// the stream ourselves at ~290s: stop reading the inbox, tell the client
// with `event: reconnect`, then close. The extension reconnects at once.
// ============================================================

import { authenticate, isTokenActive } from '../../lib/auth.js';
import { readInbound } from '../../lib/store.js';
import { logEvent } from '../../lib/log.js';
import { getPresence } from '../../lib/presence.js';
import { corsHeaders, preflight, withCors } from '../../lib/cors.js';

export const config = { runtime: 'nodejs' };

// Must stay below `maxDuration` for this route in vercel.json (300s).
export const STREAM_MAX_MS = 290_000;

// Test hook: a shorter window can be set with DM_STREAM_MAX_MS, but never a
// longer one than the function limit allows.
function streamMaxMs(): number {
  const override = Number(process.env.DM_STREAM_MAX_MS);
  return Number.isFinite(override) && override >= 50 ? Math.min(override, STREAM_MAX_MS) : STREAM_MAX_MS;
}

export async function GET(req: Request): Promise<Response> {
  let row;
  try { row = await authenticate(req); }
  catch (resp) { return withCors(resp as Response); }

  const started = Date.now();
  const tenantId = row.tenantId;
  const ctrl = new AbortController();
  // Tie our long read to the underlying request lifetime — when the
  // browser closes the SSE, AbortSignal fires and the loop exits.
  const onAbort = () => ctrl.abort();
  req.signal.addEventListener('abort', onAbort, { once: true });
  if (req.signal.aborted) ctrl.abort();

  const isAuthorized = async () => {
    if (ctrl.signal.aborted) return false;
    try {
      if (await isTokenActive(row)) return !ctrl.signal.aborted;
    } catch { /* Authorization failures close the stream rather than retrying delivery. */ }
    ctrl.abort();
    return false;
  };

  // Separate from `ctrl`: when the time budget runs out we stop *reading*
  // the inbox (no new LPOP) but keep the stream authorized so a batch that
  // was already popped is still delivered before we say goodbye.
  // (Not AbortSignal.any: package engines still allow Node 18.)
  const deadline = new AbortController();
  const readCtrl = new AbortController();
  const stopReading = () => readCtrl.abort();
  ctrl.signal.addEventListener('abort', stopReading, { once: true });
  deadline.signal.addEventListener('abort', stopReading, { once: true });
  const readSignal = readCtrl.signal;
  const deadlineTimer = setTimeout(() => deadline.abort(), streamMaxMs());
  deadlineTimer.unref?.();

  const encoder = new TextEncoder();
  const heartbeatMs = 25_000;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = async (event: string, data: string) => {
        if (!(await isAuthorized())) return false;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        return true;
      };
      await send('hello', JSON.stringify({ tenantId, version: '3.2.1' }));

      // Initial presence snapshot so the side panel doesn't wait
      // up to 30s for the first poll tick.
      let lastPresence = false;
      try {
        lastPresence = await getPresence(tenantId);
        await send('relay', JSON.stringify({
          type: 'AGENT_PRESENCE',
          payload: { connected: lastPresence },
        }));
      } catch { /* fall through; the poll tick will retry */ }

      const heartbeat = setInterval(async () => {
        try {
          if (await isAuthorized()) controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        }
        catch { /* stream already closed */ }
      }, heartbeatMs);
      heartbeat.unref?.();

      // Edge-triggered presence push. We only emit on transitions so
      // the extension doesn't re-render every 30s for no reason. The
      // /api/mcp handler also publishes a 0→1 edge inline via
      // publishInbound, so most transitions arrive within seconds —
      // this loop is the safety net for missed edges and for the
      // 1→0 timeout transition.
      let lastPoll = lastPresence;
      const presenceTimer = setInterval(async () => {
        try {
          const now = await getPresence(tenantId);
          if (now !== lastPoll && await isAuthorized()) {
            lastPoll = now;
            controller.enqueue(encoder.encode(
              `event: relay\ndata: ${JSON.stringify({
                type: 'AGENT_PRESENCE',
                payload: { connected: now },
              })}\n\n`,
            ));
          }
        } catch { /* next tick retries */ }
      }, 30_000);
      presenceTimer.unref?.();

      try {
        for await (const msg of readInbound({ tenantId, signal: readSignal, isAuthorized })) {
          if (!(await send('relay', JSON.stringify(msg)))) break;
          logEvent('stream.forward', {
            tenantId, type: msg.type,
            byteCount: typeof msg.payload === 'string' ? Buffer.byteLength(msg.payload, 'utf8') : 0,
          });
        }
        // Time budget used up (not a disconnect, revocation or error): tell the
        // client to reconnect immediately instead of letting Vercel kill us.
        if (deadline.signal.aborted && !ctrl.signal.aborted) {
          await send('reconnect', JSON.stringify({ reason: 'max_duration' }));
          logEvent('stream.reconnect', { tenantId, latencyMs: Date.now() - started });
        }
      } catch (err: any) {
        logEvent('stream.error', { tenantId, error: err?.code || 'unknown' });
      } finally {
        clearTimeout(deadlineTimer);
        ctrl.abort();
        req.signal.removeEventListener('abort', onAbort);
        clearInterval(heartbeat);
        clearInterval(presenceTimer);
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
