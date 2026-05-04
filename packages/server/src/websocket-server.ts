// ============================================================
// Design Mode Server — WebSocket Server (Phase 8 Enhanced)
// Receives real-time updates from the Chrome extension
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { state } from './state.js';

let wss: WebSocketServer | null = null;
let activeConnection: WebSocket | null = null;

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
      ws.send(JSON.stringify({ type: 'HELLO', payload: { version: '1.0.0' } }));

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
      });

      ws.on('error', (err) => {
        console.error('[Design Mode] WebSocket error:', err.message);
      });
    });
  });
}

function handleMessage(msg: any) {
  switch (msg.type) {
    case 'STYLE_CHANGED': if (msg.payload) state.addStyleChange(msg.payload); break;
    case 'TEXT_CHANGED': if (msg.payload) state.addTextChange(msg.payload); break;
    case 'SESSION_UPDATE': if (msg.payload) state.updateSession(msg.payload); break;
    case 'COMMENT_ADDED': if (msg.payload) state.addComment(msg.payload); break;
    case 'COMMENT_UPDATED': if (msg.payload) state.addComment(msg.payload); break;
    case 'COMMENT_DELETED': if (msg.payload?.id) state.deleteComment(msg.payload.id); break;
    // Phase 1/8: Annotations
    case 'ANNOTATION_CREATED': if (msg.payload) state.addAnnotation(msg.payload); break;
    case 'ANNOTATION_UPDATED': if (msg.payload) state.addAnnotation(msg.payload); break;
    case 'ANNOTATION_DELETED': if (msg.payload?.id) state.deleteAnnotation(msg.payload.id); break;
    default: break;
  }
}

export function sendToExtension(msg: object) {
  if (activeConnection?.readyState === WebSocket.OPEN) {
    activeConnection.send(JSON.stringify(msg));
  }
}

export function isExtensionConnected(): boolean {
  return activeConnection?.readyState === WebSocket.OPEN;
}

export function stopWebSocketServer() {
  if (wss) { wss.close(); wss = null; }
  activeConnection = null;
}
