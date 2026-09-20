import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { WebSocket } from 'ws';
import { createProcessShutdown, watchStdinEof, SHUTDOWN_GRACE_MS } from '../src/stdio-lifecycle.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const distCli = path.join(here, '..', 'dist', 'bin', 'cli.js');
const children: ChildProcess[] = [];
const sockets: Array<{ close: () => void }> = [];

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('no port')));
      }
    });
    server.on('error', reject);
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(null);
    }, timeoutMs);
    const onExit = (code: number | null) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    };
    child.once('exit', onExit);
  });
}

function waitForStderr(child: ChildProcess, match: RegExp, timeoutMs = 8_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${match}. stderr=${buf}`)), timeoutMs);
    const onErr = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      if (match.test(buf)) {
        clearTimeout(timer);
        child.stderr?.off('data', onErr);
        resolve(buf);
      }
    };
    child.stderr?.on('data', onErr);
  });
}

function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

function spawnCli(args: string[], env: NodeJS.ProcessEnv, stdio: ('pipe' | 'ignore')[] = ['pipe', 'ignore', 'pipe']): ChildProcess {
  const child = spawn(process.execPath, [distCli, ...args], {
    env,
    stdio,
  });
  children.push(child);
  return child;
}

function killChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode) return;
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

function collectStderr(child: ChildProcess): { text: () => string } {
  let buf = '';
  child.stderr?.on('data', (chunk: Buffer) => { buf += chunk.toString('utf8'); });
  return { text: () => buf };
}

async function openExtensionSocket(port: number): Promise<WebSocket> {
  const res = await fetch(`http://127.0.0.1:${port}/.design-mode/health`);
  assert.equal(res.ok, true);
  const health = await res.json() as { webSocketToken?: string };
  assert.ok(health.webSocketToken);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(health.webSocketToken)}`);
  sockets.push(ws);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 3_000);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
  return ws;
}

function holdHttpKeepAlive(port: number): Promise<{ close: () => void }> {
  const agent = new http.Agent({ keepAlive: true });
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/.design-mode/health',
      agent,
    }, (res) => {
      res.resume();
      res.on('end', () => {
        const handle = {
          close: () => {
            req.destroy();
            agent.destroy();
          },
        };
        sockets.push(handle);
        resolve(handle);
      });
    });
    req.on('error', reject);
  });
}

describe('stdio lifecycle helper', () => {
  test('shutdown completes when its timer is the only remaining event-loop handle', () => {
    const moduleUrl = new URL('../src/stdio-lifecycle.ts', import.meta.url).href;
    const script = `
      const lifecycle = await import(${JSON.stringify(moduleUrl)});
      const createProcessShutdown = lifecycle.createProcessShutdown ?? lifecycle.default?.createProcessShutdown;
      await createProcessShutdown({
        getBridge: () => ({ close: () => new Promise(() => {}) }),
        graceMs: 30,
        exit: () => console.log('shutdown completed'),
      }).shutdown();
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'shutdown completed');
  });

  test('reentry is a no-op while close is in flight', async () => {
    const exits: number[] = [];
    let closeCalls = 0;
    let finishClose: () => void = () => {};
    const { shutdown, isShuttingDown } = createProcessShutdown({
      getBridge: () => ({
        close: () => new Promise<void>((resolve) => {
          closeCalls += 1;
          finishClose = resolve;
        }),
      }),
      exit: (code) => { exits.push(code); },
      graceMs: 5_000,
    });

    const first = shutdown(0);
    while (closeCalls === 0) await new Promise((resolve) => setImmediate(resolve));
    const second = shutdown(1);
    assert.equal(isShuttingDown(), true);
    finishClose();
    await Promise.all([first, second]);
    assert.equal(closeCalls, 1);
    assert.deepEqual(exits, [0]);
  });

  test('falls back to exit when close never settles', async () => {
    const exits: number[] = [];
    const { shutdown } = createProcessShutdown({
      getBridge: () => ({ close: () => new Promise(() => {}) }),
      exit: (code) => { exits.push(code); },
      graceMs: 30,
    });
    await shutdown(0);
    assert.deepEqual(exits, [0]);
  });

  test('does not watch a TTY stdin', () => {
    const calls: string[] = [];
    const stdin = {
      isTTY: true,
      on(event: string) { calls.push(event); return stdin; },
    } as unknown as NodeJS.ReadStream;
    assert.equal(watchStdinEof(stdin, () => {}), false);
    assert.deepEqual(calls, []);
  });

  test('fires immediately when stdin already ended', () => {
    let fired = 0;
    const stdin = {
      isTTY: false,
      readableEnded: true,
      on() { return stdin; },
    } as unknown as NodeJS.ReadStream;
    assert.equal(watchStdinEof(stdin, () => { fired += 1; }), true);
    assert.equal(fired, 1);
  });
});

describe('mcp-local stdio lifecycle', { concurrency: false, timeout: 20_000 }, () => {
  before(() => {
    if (!existsSync(distCli)) {
      throw new Error(`build first: ${distCli} is missing (npm run build)`);
    }
  });

  after(() => {
    for (const sock of sockets.splice(0)) {
      try { sock.close(); } catch { /* ignore */ }
    }
    for (const child of children.splice(0)) {
      killChild(child);
    }
  });

  test('exits when the MCP client closes stdin', async () => {
    const port = await getFreePort();
    const child = spawnCli([], { ...process.env, DM_PORT: String(port) });
    try {
      await waitForStderr(child, /DESIGN MODE MCP READY/);
      child.stdin?.end();
      const code = await waitForExit(child, 5_000);
      assert.equal(code, 0, 'server should exit 0 after stdin EOF');
    } finally {
      killChild(child);
    }
  });

  test('releases the port on that exit so the next owner can bind', async () => {
    const port = await getFreePort();
    const child = spawnCli([], { ...process.env, DM_PORT: String(port) });
    try {
      await waitForStderr(child, /DESIGN MODE MCP READY/);
      assert.equal(await canBind(port), false, 'owner should hold the port while running');
      child.stdin?.end();
      const code = await waitForExit(child, 5_000);
      assert.equal(code, 0);
      assert.equal(await canBind(port), true, 'port should be free once the owner exits');
    } finally {
      killChild(child);
    }
  });

  test('an attacher also exits on stdin EOF, leaving the owner untouched', async () => {
    const port = await getFreePort();
    const owner = spawnCli([], { ...process.env, DM_PORT: String(port) });
    try {
      await waitForStderr(owner, /DESIGN MODE MCP READY/);
      const attacher = spawnCli([], { ...process.env, DM_PORT: String(port) });
      try {
      await waitForStderr(attacher, /attached|Attached/);
      attacher.stdin?.end();
      const attacherCode = await waitForExit(attacher, 5_000);
      assert.equal(attacherCode, 0, 'attacher should exit on stdin EOF');
      const ownerExited = await waitForExit(owner, 1_000);
      assert.equal(ownerExited, null, 'owner should still be running');
      owner.stdin?.end();
      const ownerCode = await waitForExit(owner, 5_000);
      assert.equal(ownerCode, 0);
      } finally {
        killChild(attacher);
      }
    } finally {
      killChild(owner);
    }
  });

  test('EOF with an open WebSocket and HTTP keepalive still exits and releases the port', async () => {
    const port = await getFreePort();
    const child = spawnCli([], { ...process.env, DM_PORT: String(port) });
    let ws: WebSocket | undefined;
    let keepalive: { close: () => void } | undefined;
    try {
      await waitForStderr(child, /DESIGN MODE MCP READY/);
      ws = await openExtensionSocket(port);
      keepalive = await holdHttpKeepAlive(port);
      assert.equal(await canBind(port), false);
      child.stdin?.end();
      const code = await waitForExit(child, SHUTDOWN_GRACE_MS + 3_000);
      assert.equal(code, 0, 'owner must not hang on open WS/HTTP keepalive');
      assert.equal(await canBind(port), true, 'port should be free after bounded shutdown');
    } finally {
      try { ws?.close(); } catch { /* ignore */ }
      try { keepalive?.close(); } catch { /* ignore */ }
      killChild(child);
    }
  });

  test('immediate EOF (/dev/null) exits without a KEEP_ALIVE flag', async () => {
    const port = await getFreePort();
    const child = spawnCli([], { ...process.env, DM_PORT: String(port) }, ['ignore', 'ignore', 'pipe']);
    try {
      const code = await waitForExit(child, 8_000);
      assert.equal(code, 0, 'stdin from /dev/null should exit intentionally');
      assert.equal(await canBind(port), true);
    } finally {
      killChild(child);
    }
  });

  test('SIGINT shuts the owner down and releases the port', async () => {
    const port = await getFreePort();
    const child = spawnCli([], { ...process.env, DM_PORT: String(port) });
    try {
      await waitForStderr(child, /DESIGN MODE MCP READY/);
      assert.equal(child.kill('SIGINT'), true);
      const code = await waitForExit(child, 5_000);
      assert.equal(code, 0);
      assert.equal(await canBind(port), true);
    } finally {
      killChild(child);
    }
  });

  test('SIGTERM shuts the owner down and releases the port', async () => {
    const port = await getFreePort();
    const child = spawnCli([], { ...process.env, DM_PORT: String(port) });
    try {
      await waitForStderr(child, /DESIGN MODE MCP READY/);
      assert.equal(child.kill('SIGTERM'), true);
      const code = await waitForExit(child, 5_000);
      assert.equal(code, 0);
      assert.equal(await canBind(port), true);
    } finally {
      killChild(child);
    }
  });

  test('setup --help with piped stdin does not start the MCP server', async () => {
    const port = await getFreePort();
    const child = spawnCli(['setup', '--help'], { ...process.env, DM_PORT: String(port) });
    const stderr = collectStderr(child);
    try {
      child.stdin?.end();
      const code = await waitForExit(child, 5_000);
      assert.equal(code, 0);
      assert.match(stderr.text(), /Usage: design-mode-mcp setup/);
      assert.doesNotMatch(stderr.text(), /DESIGN MODE MCP READY/);
      assert.equal(await canBind(port), true, 'setup must not claim a port');
    } finally {
      killChild(child);
    }
  });

  test('doctor --help with piped stdin does not start the MCP server', async () => {
    const port = await getFreePort();
    const child = spawnCli(['doctor', '--help'], { ...process.env, DM_PORT: String(port) });
    const stderr = collectStderr(child);
    try {
      child.stdin?.end();
      const code = await waitForExit(child, 5_000);
      assert.equal(code, 0);
      assert.match(stderr.text(), /Usage: design-mode-mcp doctor/);
      assert.doesNotMatch(stderr.text(), /DESIGN MODE MCP READY/);
      assert.equal(await canBind(port), true);
    } finally {
      killChild(child);
    }
  });
});
