import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { attachWebSocketServer, isExtensionConnected, stopWebSocketServer } from './websocket-server.js';
import { executeLocalTool, type ToolDispatch, type ToolResult } from './tools.js';

export const OWNER_IDENTITY = 'design-mode-mcp';
export const OWNER_HEALTH_PATH = '/.design-mode/health';
export const OWNER_TOOLS_PATH = '/.design-mode/tools';
export const OWNER_HEADER = 'x-design-mode-owner';
export const LOOPBACK_HOST = '127.0.0.1';
const VERSION = '2.2.0';
const BODY_LIMIT = 1_000_000;

export type BridgeRole = 'owner' | 'attacher';

export interface OwnerHealth {
  identity: typeof OWNER_IDENTITY;
  version: string;
  pid: number;
  role: 'owner';
  extensionConnected: boolean;
  webSocketToken: string;
}

export interface LocalBridge {
  role: BridgeRole;
  port: number;
  pid?: number;
  close: () => Promise<void>;
}

function isLoopbackAddress(addr?: string | null): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function isLoopbackHost(hostHeader?: string): boolean {
  if (!hostHeader) return false;
  const raw = hostHeader.toLowerCase();
  if (raw.startsWith('[::1]')) return true;
  const host = raw.split(':')[0];
  return host === '127.0.0.1' || host === 'localhost';
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res: http.ServerResponse, status: number, text: string) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > BODY_LIMIT) {
      throw new Error('payload too large');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function handleOwnerHttp(req: http.IncomingMessage, res: http.ServerResponse, webSocketToken: string) {
  if (!isLoopbackAddress(req.socket.remoteAddress) || !isLoopbackHost(req.headers.host)) {
    sendText(res, 403, 'localhost only');
    return;
  }

  const url = new URL(req.url || '/', `http://${LOOPBACK_HOST}`);

  if (url.pathname === OWNER_HEALTH_PATH && req.method === 'GET') {
    const health: OwnerHealth = {
      identity: OWNER_IDENTITY,
      version: VERSION,
      pid: process.pid,
      role: 'owner',
      extensionConnected: isExtensionConnected(),
      webSocketToken,
    };
    sendJson(res, 200, health);
    return;
  }

  if (url.pathname === OWNER_TOOLS_PATH && req.method === 'POST') {
    if (req.headers[OWNER_HEADER] !== OWNER_IDENTITY) {
      sendText(res, 403, 'owner client required');
      return;
    }
    let body: any;
    try {
      body = await readJson(req);
    } catch {
      sendJson(res, 400, { error: 'invalid json' });
      return;
    }
    const name = body?.name;
    const args = body?.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
      ? body.arguments as Record<string, unknown>
      : {};
    if (typeof name !== 'string' || !name) {
      sendJson(res, 400, { error: 'name required' });
      return;
    }
    const result = await executeLocalTool(name, args);
    sendJson(res, 200, result);
    return;
  }

  sendText(res, 404, 'not found');
}

function listenLoopback(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, LOOPBACK_HOST);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      server.removeAllListeners();
      resolve();
      return;
    }
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

export function foreignOccupantError(port: number): Error {
  return new Error(
    `Port ${port} is occupied by another process that is not Design Mode. ` +
    `Stop that process or set DM_PORT to a free port. Design Mode will not kill it.`
  );
}

export async function probeOwnerHealth(port: number, timeoutMs = 800): Promise<OwnerHealth | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${LOOPBACK_HOST}:${port}${OWNER_HEALTH_PATH}`, {
      signal: ac.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json() as Partial<OwnerHealth>;
    if (body?.identity === OWNER_IDENTITY && body.role === 'owner' &&
        typeof body.pid === 'number' && typeof body.webSocketToken === 'string' && body.webSocketToken) {
      return body as OwnerHealth;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function proxyToolCall(
  port: number,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  try {
    const res = await fetch(`http://${LOOPBACK_HOST}:${port}${OWNER_TOOLS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [OWNER_HEADER]: OWNER_IDENTITY,
      },
      body: JSON.stringify({ name, arguments: args }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        content: [{ type: 'text', text: `Owner tool call failed (${res.status}): ${text}` }],
        isError: true,
      };
    }
    return await res.json() as ToolResult;
  } catch (e: any) {
    return {
      content: [{
        type: 'text',
        text: `Design Mode owner is unreachable on localhost:${port}: ${e?.message || e}`,
      }],
      isError: true,
    };
  }
}

async function startOwner(port: number): Promise<LocalBridge> {
  const webSocketToken = randomBytes(32).toString('base64url');
  const httpServer = http.createServer((req, res) => {
    void handleOwnerHttp(req, res, webSocketToken).catch(() => {
      if (!res.headersSent) sendText(res, 500, 'internal error');
    });
  });
  try {
    await listenLoopback(httpServer, port);
  } catch (err) {
    await closeServer(httpServer);
    throw err;
  }
  attachWebSocketServer(httpServer, webSocketToken);
  return {
    role: 'owner',
    port,
    pid: process.pid,
    close: async () => {
      stopWebSocketServer();
      await closeServer(httpServer);
    },
  };
}

export async function claimOrAttach(port: number): Promise<LocalBridge> {
  try {
    return await startOwner(port);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EADDRINUSE') throw err;
    const health = await probeOwnerHealth(port);
    if (health) {
      return {
        role: 'attacher',
        port,
        pid: health.pid,
        close: async () => {},
      };
    }
    throw foreignOccupantError(port);
  }
}

export function createResilientToolDispatch(
  port: number,
  initialBridge: LocalBridge,
  onBridgeChange?: (bridge: LocalBridge) => void,
): ToolDispatch {
  let bridge = initialBridge;
  return async (name, args = {}) => {
    if (bridge.role === 'attacher' && !(await probeOwnerHealth(port))) {
      try {
        bridge = await claimOrAttach(port);
      } catch (err) {
        return {
          content: [{ type: 'text', text: String((err as Error).message || err) }],
          isError: true,
        };
      }
      onBridgeChange?.(bridge);
    }
    return bridge.role === 'owner'
      ? executeLocalTool(name, args)
      : proxyToolCall(port, name, args);
  };
}
