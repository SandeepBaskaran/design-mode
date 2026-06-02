// ============================================================
// POST /api/mcp
// Streamable HTTP MCP transport. Mirrors the tools from
// packages/mcp-local/src/mcp-server.ts but routes every call through
// the per-tenant Redis bus to the extension and awaits its reply.
//
// We implement a minimal JSON-RPC 2.0 handler covering the methods
// hosted MCP clients (Claude Desktop, Cursor) actually use against
// us — `initialize`, `tools/list`, `tools/call`. More methods can
// be wired through the official SDK later; this is intentionally
// small to keep the relay surface auditable.
// ============================================================

import { authenticate } from '../lib/auth.js';
import { awaitResponse, publishInbound } from '../lib/store.js';
import { logEvent } from '../lib/log.js';
import { bumpPresence } from '../lib/presence.js';
import { consumeQuota, consumeBurst, BURST_LIMIT, BURST_WINDOW_S } from '../lib/quota.js';
import { corsHeaders, preflight, withCors } from '../lib/cors.js';
import { randomBytes } from 'node:crypto';

export const config = { runtime: 'nodejs' };

const TOOL_TIMEOUT_MS = 12_000;
const PROTOCOL_VERSION = '2024-11-05';
// Keep in sync with APP_VERSION in packages/shared/src/constants.ts.
const SERVER_VERSION = '1.6.0';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  // Maps the agent's tools/call into a relay message + an extractor that
  // turns the extension's reply into MCP `content` blocks.
  buildRequest: (args: any) => { type: string; payload: any };
  toContent: (reply: any, args: any) => Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'get_changes',
    description: 'Read everything the user has edited in this session: style changes, text changes, DOM changes, and pinned comments, plus a ready-to-paste CSS block.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    buildRequest: () => ({ type: 'CLOUD_GET_CHANGES', payload: {} }),
    toContent: (reply) => [{ type: 'text', text: JSON.stringify(reply ?? {}, null, 2) }],
  },
  {
    name: 'apply_changes',
    description: 'Push CSS changes back to the browser for live preview. Pass an array of element changes — single edits use a one-element array.',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          description: 'Array of element changes (single edit = single-element array)',
          items: {
            type: 'object',
            properties: {
              elementId: { type: 'string' },
              styles: { type: 'object', additionalProperties: { type: 'string' } },
            },
            required: ['elementId', 'styles'],
          },
        },
      },
      required: ['changes'],
    },
    buildRequest: (args) => ({ type: 'CLOUD_APPLY_CHANGES', payload: { changes: args.changes } }),
    toContent: (reply, args) => {
      const totalProps = (args.changes || []).reduce((n: number, c: any) => n + Object.keys(c.styles || {}).length, 0);
      const count = (args.changes || []).length;
      const text = reply?.error
        ? `Error: ${reply.error}`
        : `Applied ${totalProps} style change${totalProps === 1 ? '' : 's'} to ${count} element${count === 1 ? '' : 's'}.`;
      return [{ type: 'text', text }];
    },
  },
  {
    name: 'clear_changes',
    description: 'Clear all tracked changes and comments for the current session.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    buildRequest: () => ({ type: 'CLOUD_CLEAR_CHANGES', payload: {} }),
    toContent: () => [{ type: 'text', text: 'All changes cleared.' }],
  },
  {
    name: 'mark_comment_resolved',
    description: 'Mark a pinned comment resolved (done) or reopen it. Pass the comment `id` from get_changes output. Call this after implementing what the comment asked for so the user sees the loop close in the Changes tab.',
    inputSchema: {
      type: 'object',
      properties: {
        commentId: { type: 'string', description: 'Comment id from get_changes (the `id` field)' },
        resolved: { type: 'boolean', description: 'true = resolve/done, false = reopen' },
      },
      required: ['commentId'],
    },
    buildRequest: (args) => ({ type: 'CLOUD_MARK_COMMENT_RESOLVED', payload: { commentId: args.commentId, resolved: args.resolved !== false } }),
    toContent: (reply, args) => {
      const text = reply?.ok
        ? `Comment ${args.commentId} marked ${args.resolved === false ? 'open' : 'resolved'}.`
        : `No comment found with id ${args.commentId}.`;
      return [{ type: 'text', text }];
    },
  },
  {
    name: 'get_session_summary',
    description: 'Connection status, active sessions, and counts. Quick health check.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    buildRequest: () => ({ type: 'CLOUD_GET_SESSION_SUMMARY', payload: {} }),
    toContent: (reply) => [{ type: 'text', text: JSON.stringify(reply ?? {}, null, 2) }],
  },
  {
    name: 'export_changes',
    description: "Emit the user's style changes in your preferred format: plain CSS, Tailwind utility classes, nested SCSS, or camelCase JSX inline-style objects.",
    inputSchema: {
      type: 'object',
      properties: { format: { type: 'string', enum: ['css', 'tailwind', 'scss', 'jsx'] } },
      required: ['format'],
    },
    buildRequest: (args) => ({ type: 'CLOUD_EXPORT_CHANGES', payload: { format: args.format } }),
    toContent: (reply) => [{ type: 'text', text: typeof reply?.text === 'string' ? reply.text : 'No changes to export.' }],
  },
  {
    name: 'set_change_status',
    description: "Update the status of tracked changes/comments as you work: 'in_progress' when you start implementing them in code, 'resolved' once shipped, or 'todo' to reset. Pass the `id`s from get_changes; omit `ids` to apply to everything. Resolved items dim in the user's Changes tab so they can see what you've handled.",
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'resolved'] },
        ids: { type: 'array', items: { type: 'string' }, description: 'Change or comment ids from get_changes. Omit to apply to all tracked items.' },
      },
      required: ['status'],
    },
    buildRequest: (args) => ({ type: 'CLOUD_SET_CHANGE_STATUS', payload: { status: args.status, ids: args.ids } }),
    toContent: (reply, args) => {
      if (reply?.error) return [{ type: 'text', text: `Error: ${reply.error}` }];
      const n = typeof reply?.count === 'number' ? reply.count : (args.ids?.length ?? 0);
      return [{ type: 'text', text: `Marked ${n} item${n === 1 ? '' : 's'} as ${args.status}.` }];
    },
  },
  {
    name: 'get_screenshot',
    description: 'Capture a PNG screenshot of the page. Pass a unique selector or an elementId to crop, or omit both for the viewport.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        elementId: { type: 'string' },
      },
      additionalProperties: false,
    },
    buildRequest: (args) => ({ type: 'CAPTURE_SCREENSHOT', payload: { selector: args.selector, elementId: args.elementId } }),
    toContent: (reply, args) => {
      if (reply?.error || !reply?.dataUrl) {
        let text = `Screenshot failed: ${reply?.error || 'no data returned'}`;
        if (Array.isArray(reply?.candidates) && reply.candidates.length) {
          text += '\n\nCandidate paths (pick one and call get_screenshot again):';
          for (const c of reply.candidates) text += `\n  - ${c.path}    (${c.label})`;
        }
        return [{ type: 'text', text }];
      }
      const m = reply.dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!m) return [{ type: 'text', text: 'Screenshot returned an unexpected data URL format.' }];
      const target = args.elementId ? `element ${args.elementId}` : args.selector ? `selector ${args.selector}` : 'viewport';
      return [
        { type: 'text', text: `Captured screenshot of ${target}.` },
        { type: 'image', data: m[2], mimeType: m[1] },
      ];
    },
  },
];

function rpcResult(id: any, result: any) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: any, code: number, message: string, data?: any) {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } };
}

async function handleToolCall(tenantId: string, name: string, args: any): Promise<any> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool '${name}'.` }], isError: true };
  }
  const requestId = `req-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const built = tool.buildRequest(args || {});
  await publishInbound(tenantId, { type: built.type, requestId, payload: built.payload });
  try {
    const reply = await awaitResponse(requestId, TOOL_TIMEOUT_MS);
    return { content: tool.toContent(reply.payload, args || {}) };
  } catch {
    return {
      content: [{ type: 'text', text: 'Browser offline. Open the Design Mode side panel and try again.' }],
      isError: true,
    };
  }
}

async function handle(req: Request): Promise<Response> {
  let row;
  try { row = await authenticate(req); }
  catch (resp) { return withCors(resp as Response); }

  // Mark this tenant's agent as active. On a 0→1 edge, push a
  // presence event to the extension SSE stream so the side panel
  // flips to "connected" immediately instead of waiting for the
  // 30s poll in stream.ts.
  try {
    const wasNew = await bumpPresence(row.tenantId);
    if (wasNew) {
      await publishInbound(row.tenantId, {
        type: 'AGENT_PRESENCE',
        payload: { connected: true },
      });
    }
  } catch (err: any) {
    logEvent('mcp.presence.error', { tenantId: row.tenantId, error: err?.message || 'unknown' });
  }

  let body: any;
  try { body = await req.json(); }
  catch {
    return withCors(Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 }));
  }

  const id = body?.id ?? null;
  const method = body?.method;

  const started = Date.now();
  let response: any;

  switch (method) {
    case 'initialize':
      response = rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: 'design-mode', version: SERVER_VERSION },
        capabilities: { tools: {} },
      });
      break;
    case 'tools/list':
      response = rpcResult(id, {
        tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
      break;
    case 'tools/call': {
      // Burst guard first — a runaway loop gets a friendly slow-down
      // without burning the day's quota on rejected calls.
      const burstOk = await consumeBurst(row.tenantId);
      if (!burstOk) {
        logEvent('mcp.burst.exceeded', { tenantId: row.tenantId, status: 200 });
        response = rpcResult(id, {
          content: [{
            type: 'text',
            text: `Slow down — too many tool calls in a short window (max ${BURST_LIMIT} per ${BURST_WINDOW_S}s). Retry in a few seconds.`,
          }],
          isError: true,
        });
        break;
      }
      // Quota gate runs BEFORE the relay so a capped tenant doesn't even
      // wake the extension. INCR is atomic, so two concurrent calls at
      // the boundary will see different counts — the second gets the
      // friendly error.
      const quota = await consumeQuota(row.tenantId);
      if (!quota.allowed) {
        const resetIso = new Date(quota.resetAt).toISOString();
        logEvent('mcp.quota.exceeded', { tenantId: row.tenantId, status: 200 });
        response = rpcResult(id, {
          content: [{
            type: 'text',
            text: `Daily limit reached: ${quota.used - 1}/${quota.limit} tool calls used today. Resets at ${resetIso}.`,
          }],
          isError: true,
        });
        break;
      }
      const params = body.params || {};
      const result = await handleToolCall(row.tenantId, params.name, params.arguments);
      response = rpcResult(id, result);
      break;
    }
    case 'ping':
      response = rpcResult(id, {});
      break;
    case 'notifications/initialized':
      // No reply expected for notifications.
      logEvent('mcp.notification', { tenantId: row.tenantId, type: method });
      return new Response(null, { status: 204, headers: corsHeaders() });
    default:
      response = rpcError(id, -32601, `Method not found: ${method}`);
  }

  logEvent('mcp.call', { tenantId: row.tenantId, type: method, latencyMs: Date.now() - started, status: 200 });
  return withCors(Response.json(response));
}

export const POST = handle;

export async function OPTIONS() { return preflight(); }

export async function GET() {
  return new Response('Method Not Allowed — use POST for JSON-RPC.', {
    status: 405, headers: { 'Allow': 'POST', ...corsHeaders() },
  });
}
