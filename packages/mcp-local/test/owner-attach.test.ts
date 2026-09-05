import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { WebSocket } from 'ws';
import {
  claimOrAttach,
  createResilientToolDispatch,
  OWNER_IDENTITY,
  probeOwnerHealth,
  proxyToolCall,
  type LocalBridge,
} from '../src/owner-bridge.ts';
import { executeLocalTool } from '../src/tools.ts';
import { state } from '../src/state.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const holdClaim = path.join(here, 'fixtures', 'hold-claim.cjs');
const distBridge = path.join(here, '..', 'dist', 'owner-bridge.js');

function listen(server: net.Server, port: number, host = '127.0.0.1'): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function closeListening(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    (server as http.Server).closeAllConnections?.();
    server.close(() => resolve());
  });
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('no address'));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function waitForJsonLine(child: ChildProcess, timeoutMs = 8_000): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for child JSON. stdout=${buf} stderr=${stderr}`));
    }, timeoutMs);
    let stderr = '';
    const onOut = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        cleanup();
        try {
          resolve(JSON.parse(line));
        } catch (err) {
          reject(err);
        }
      }
    };
    const onErr = (chunk: Buffer) => { stderr += chunk.toString('utf8'); };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`child exited ${code} before JSON. stderr=${stderr}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', onOut);
      child.stderr?.off('data', onErr);
      child.off('exit', onExit);
    };
    child.stdout?.on('data', onOut);
    child.stderr?.on('data', onErr);
    child.on('exit', onExit);
  });
}

function spawnHoldClaim(port: number): ChildProcess {
  return spawn(
    process.execPath,
    [holdClaim],
    {
      cwd: path.join(here, '..'),
      env: { ...process.env, DM_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

async function helloFromExtension(port: number): Promise<any> {
  const health = await probeOwnerHealth(port);
  assert.ok(health?.webSocketToken);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(health.webSocketToken)}`);
  const msg = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws hello timeout')), 3000);
    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
  ws.close();
  return msg;
}

describe('mcp-local owner/attacher', { concurrency: false, timeout: 15_000 }, () => {
  test('foreign HTTP occupant fails clearly and is not killed', async () => {
    const port = await getFreePort();
    let hits = 0;
    const foreign = http.createServer((_req, res) => {
      hits++;
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('not-design-mode');
    });
    await listen(foreign, port);
    await assert.rejects(
      () => claimOrAttach(port),
      (err: unknown) => {
        assert.match((err as Error).message, /not Design Mode/);
        assert.match((err as Error).message, /will not kill/);
        return true;
      },
    );
    const ping = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await ping.text(), 'not-design-mode');
    assert.equal(foreign.listening, true);
    assert.ok(hits >= 1);
    await closeListening(foreign);
  });

  test('foreign TCP occupant fails clearly and keeps the port', async () => {
    const port = await getFreePort();
    const tcp = net.createServer((socket) => socket.destroy());
    await listen(tcp, port);
    await assert.rejects(
      () => claimOrAttach(port),
      (err: unknown) => {
        assert.match((err as Error).message, /not Design Mode/);
        return true;
      },
    );
    assert.equal(tcp.listening, true);
    await closeListening(tcp);
  });

  describe('with a live owner', { concurrency: false }, () => {
    let port = 0;
    let owner: LocalBridge;

    before(async () => {
      port = await getFreePort();
      owner = await claimOrAttach(port);
      assert.equal(owner.role, 'owner');
    });

    after(async () => {
      await owner.close();
      state.clear();
    });

    test('second attach keeps the owner websocket', async () => {
      const health = await probeOwnerHealth(port);
      assert.ok(health);
      assert.equal(health.identity, OWNER_IDENTITY);
      assert.equal(health.pid, process.pid);

      const attached = await claimOrAttach(port);
      assert.equal(attached.role, 'attacher');
      assert.equal(attached.pid, process.pid);
      await attached.close();

      const hello = await helloFromExtension(port);
      assert.equal(hello.type, 'HELLO');
      assert.equal(hello.payload.agentConnected, true);
    });

    test('rejects unauthenticated browser-facing bridge requests', async () => {
      const toolResponse = await fetch(`http://127.0.0.1:${port}/.design-mode/tools`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ name: 'get_changes', arguments: {} }),
      });
      assert.equal(toolResponse.status, 403);

      const healthResponse = await fetch(`http://127.0.0.1:${port}/.design-mode/health`, {
        headers: { origin: 'https://example.com' },
      });
      assert.equal(healthResponse.headers.get('access-control-allow-origin'), null);

      await assert.rejects(
        () => new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(`ws://127.0.0.1:${port}`);
          socket.once('open', () => {
            socket.close();
            resolve();
          });
          socket.once('error', reject);
        }),
      );
    });

    test('attacher tool proxy shares owner state', async () => {
      state.addStyleChange({
        id: 's1',
        elementId: 'dm-1',
        selector: 'h1',
        property: 'color',
        oldValue: 'black',
        newValue: 'red',
        timestamp: Date.now(),
      });

      const local = await executeLocalTool('get_changes');
      const proxied = await proxyToolCall(port, 'get_changes');
      const localReport = JSON.parse((local.content[0] as { text: string }).text);
      const proxiedReport = JSON.parse((proxied.content[0] as { text: string }).text);
      assert.equal(localReport.styleChanges[0].newValue, 'red');
      assert.equal(proxiedReport.styleChanges[0].newValue, 'red');
      assert.equal(proxiedReport.items[0].id, 's1');
    });

    test('child attacher exit leaves the owner alive', async () => {
      assert.equal(existsSync(distBridge), true, 'build mcp-local before tests (dist/owner-bridge.js)');
      const child = spawnHoldClaim(port);
      const reported = await waitForJsonLine(child);
      assert.equal(reported.role, 'attacher');
      assert.notEqual(reported.pid, process.pid);
      assert.equal(reported.ownerPid, process.pid);

      const childDead = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await childDead;

      const afterChild = await probeOwnerHealth(port);
      assert.ok(afterChild);
      assert.equal(afterChild.identity, OWNER_IDENTITY);
      assert.equal(afterChild.pid, process.pid);

      const helloAgain = await helloFromExtension(port);
      assert.equal(helloAgain.type, 'HELLO');
    });
  });

  test('attacher takes ownership after the previous owner exits', async () => {
    const port = await getFreePort();
    const child = spawnHoldClaim(port);
    const reported = await waitForJsonLine(child);
    assert.equal(reported.role, 'owner');

    const attached = await claimOrAttach(port);
    assert.equal(attached.role, 'attacher');
    const promoted: LocalBridge[] = [];
    const dispatch = createResilientToolDispatch(port, attached, (bridge) => { promoted.push(bridge); });

    const childDead = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    await childDead;

    const result = await dispatch('get_changes');
    assert.equal(result.isError, undefined);
    assert.equal(promoted[0]?.role, 'owner');
    assert.equal((await probeOwnerHealth(port))?.pid, process.pid);
    await promoted[0]?.close();
    state.clear();
  });

  test('attacher reports a foreign replacement without breaking stdio', async () => {
    const port = await getFreePort();
    const owner = await claimOrAttach(port);
    const attached = await claimOrAttach(port);
    assert.equal(owner.role, 'owner');
    assert.equal(attached.role, 'attacher');
    const dispatch = createResilientToolDispatch(port, attached);

    await owner.close();
    const foreign = http.createServer((_req, res) => res.end('foreign'));
    await listen(foreign, port);

    const result = await dispatch('get_changes');
    assert.equal(result.isError, true);
    assert.match((result.content[0] as { text: string }).text, /not Design Mode/i);
    assert.equal(foreign.listening, true);
    await closeListening(foreign);
  });
});
