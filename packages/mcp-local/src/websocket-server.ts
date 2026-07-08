// ============================================================
// Design Mode Server — WebSocket bridge to the browser extension.
// One persistent connection per session. Used to (a) ingest change
// events the user makes in the browser, and (b) issue requests TO
// the extension (apply changes, capture screenshot) with promise-
// based responses keyed by requestId.
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { state } from './state.js';

let wss: WebSocketServer | null = null;
let activeConnection: WebSocket | null = null;

// Pending request/response pairs. Each call to `requestFromExtension` parks
// a Promise resolver here keyed by a requestId; the matching response from
// the extension resolves it. Times out after 10s.
interface PendingRequest {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}
const pending = new Map<string, PendingRequest>();

export function startWebSocketServer(port: number): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    wss = new WebSocketServer({ port });

    wss.on('listening', () => resolve(wss!));

    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Kill the existing process: lsof -ti:${port} | xargs kill -9`));
      } else reject(err);
    });

    wss.on('connection', (ws) => {
      console.error('[Design Mode] Extension connected');
      activeConnection = ws;
      ws.send(JSON.stringify({ type: 'HELLO', payload: { version: '1.8.0', agentConnected: true } }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          handleMessage(msg);
        } catch (e) {
          console.error('[Design Mode] Failed to parse message:', e);
        }
      });

      ws.on('close', () => {
        console.error('[Design Mode] Extension disconnected');
        if (activeConnection === ws) activeConnection = null;
        // Reject any in-flight requests cleanly.
        for (const [, p] of pending) {
          clearTimeout(p.timer);
          p.reject(new Error('Extension disconnected'));
        }
        pending.clear();
      });

      ws.on('error', (err) => {
        console.error('[Design Mode] WebSocket error:', err.message);
      });
    });
  });
}

function handleMessage(msg: any) {
  // Response to a previous request — match by responseTo and resolve.
  if (typeof msg.responseTo === 'string') {
    const p = pending.get(msg.responseTo);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.responseTo);
      p.resolve(msg.payload);
    }
    return;
  }
  switch (msg.type) {
    case 'STYLE_CHANGED': if (msg.payload) state.addStyleChange(msg.payload); break;
    case 'TEXT_CHANGED': if (msg.payload) state.addTextChange(msg.payload); break;
    case 'SESSION_UPDATE':
      if (msg.payload) {
        state.updateSession(msg.payload);
        // Also register it in the sessions map so listSessions() /
        // get_session_summary.activeSessions actually reflect the page.
        state.getOrCreateSession(msg.payload.pageUrl, msg.payload.pageTitle);
      }
      break;
    case 'COMMENT_ADDED': if (msg.payload) state.addComment(msg.payload); break;
    case 'COMMENT_UPDATED': if (msg.payload) state.addComment(msg.payload); break;
    case 'COMMENT_DELETED': if (msg.payload?.id) state.deleteComment(msg.payload.id); break;
    default: break;
  }
}

// Fire-and-forget — used by `apply_changes` etc.
export function sendToExtension(msg: object) {
  if (activeConnection?.readyState === WebSocket.OPEN) {
    activeConnection.send(JSON.stringify(msg));
  }
}

// Request/response — used by tools that need data BACK from the extension
// (e.g. `get_screenshot`). Resolves with the payload of the matching
// `responseTo` message. Rejects on timeout (default 10s) or disconnect.
export function requestFromExtension<T = any>(
  type: string,
  payload: object = {},
  timeoutMs: number = 10_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!activeConnection || activeConnection.readyState !== WebSocket.OPEN) {
      reject(new Error('Extension not connected'));
      return;
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error(`Extension request '${type}' timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    activeConnection.send(JSON.stringify({ type, requestId, payload }));
  });
}

export function isExtensionConnected(): boolean {
  return activeConnection?.readyState === WebSocket.OPEN;
}

export function stopWebSocketServer() {
  if (wss) { wss.close(); wss = null; }
  activeConnection = null;
}
