import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { state } from './state.js';
import {
  onExtensionConnect,
  onExtensionDisconnect,
  onHandoff,
  onPageNavigated,
  onSessionPage,
  setFeedbackSessionNotifier,
  stopFeedbackSession,
} from './feedback-session.js';

let wss: WebSocketServer | null = null;
let activeConnection: WebSocket | null = null;

interface PendingRequest {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}
const pending = new Map<string, PendingRequest>();

function rejectPending(err: Error) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(err);
  }
  pending.clear();
}

export function sendToExtension(msg: object): boolean {
  if (!activeConnection || activeConnection.readyState !== WebSocket.OPEN) return false;
  activeConnection.send(JSON.stringify(msg));
  return true;
}

setFeedbackSessionNotifier((session) => {
  sendToExtension({ type: 'FEEDBACK_SESSION', payload: session });
});

export function attachWebSocketServer(server: HttpServer, token: string): WebSocketServer {
  wss = new WebSocketServer({
    server,
    verifyClient: ({ req }: { req: IncomingMessage }) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      return url.searchParams.get('token') === token;
    },
  });

  wss.on('connection', (ws) => {
    console.error('[Design Mode] Extension connected');
    activeConnection = ws;
    ws.send(JSON.stringify({ type: 'HELLO', payload: { version: '2.3.1', agentConnected: true } }));
    onExtensionConnect();

    ws.on('message', (data) => {
      if (activeConnection !== ws) return;
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(msg);
      } catch (e) {
        console.error('[Design Mode] Failed to parse message:', e);
      }
    });

    ws.on('close', () => {
      console.error('[Design Mode] Extension disconnected');
      if (activeConnection !== ws) return;
      activeConnection = null;
      onExtensionDisconnect();
      rejectPending(new Error('Extension disconnected'));
    });

    ws.on('error', (err) => {
      console.error('[Design Mode] WebSocket error:', err.message);
    });
  });

  return wss;
}

function handleMessage(msg: any) {
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
    case 'DOM_CHANGED': if (msg.payload) state.addDomChange(msg.payload); break;
    case 'HANDOFF':
      if (msg.payload) {
        state.setHandoff(msg.payload);
        onHandoff();
      }
      break;
    case 'STOP_FEEDBACK':
      sendToExtension({
        type: 'FEEDBACK_SESSION',
        payload: stopFeedbackSession(typeof msg.payload?.sessionId === 'string' ? msg.payload.sessionId : undefined),
      });
      break;
    case 'PAGE_NAVIGATED':
      onPageNavigated(msg.payload?.pageUrl);
      break;
    case 'SESSION_UPDATE':
      if (msg.payload) {
        state.updateSession(msg.payload);
        state.getOrCreateSession(msg.payload.pageUrl, msg.payload.pageTitle);
        state.replaceChanges(msg.payload);
        if (msg.payload.handoff?.requestedAt) {
          state.setHandoff({
            requestedAt: new Date(msg.payload.handoff.requestedAt).getTime(),
            pageUrl: msg.payload.handoff.pageUrl,
            pageTitle: msg.payload.handoff.pageTitle,
          });
        }
        onSessionPage(msg.payload.pageUrl);
      }
      break;
    case 'COMMENT_ADDED': if (msg.payload) state.addComment(msg.payload); break;
    case 'COMMENT_UPDATED': if (msg.payload) state.addComment(msg.payload); break;
    case 'COMMENT_DELETED': if (msg.payload?.id) state.deleteComment(msg.payload.id); break;
    default: break;
  }
}

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
  const ws = activeConnection;
  activeConnection = null;
  rejectPending(new Error('Server shutting down'));
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try { ws.close(); } catch {}
  }
  if (wss) {
    wss.close();
    wss = null;
  }
  onExtensionDisconnect();
}
