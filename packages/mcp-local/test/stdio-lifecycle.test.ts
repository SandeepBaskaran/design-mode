import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const distCli = path.join(here, '..', 'dist', 'bin', 'cli.js');

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

// Resolves with the exit code, or null if the process outlived the deadline.
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

function waitForStderr(child: ChildProcess, match: RegExp, timeoutMs = 8_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${match}. stderr=${buf}`)), timeoutMs);
    const onErr = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      if (match.test(buf)) {
        clearTimeout(timer);
        child.stderr?.off('data', onErr);
        resolve();
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

describe('mcp-local stdio lifecycle', { concurrency: false, timeout: 20_000 }, () => {
  before(() => {
    if (!existsSync(distCli)) {
      throw new Error(`build first: ${distCli} is missing (npm run build)`);
    }
  });

  test('exits when the MCP client closes stdin', async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [distCli], {
      env: { ...process.env, DM_PORT: String(port) },
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    await waitForStderr(child, /DESIGN MODE MCP READY/);

    // The client going away is exactly this: our stdin reaches EOF.
    child.stdin?.end();

    const code = await waitForExit(child, 5_000);
    if (code === null) child.kill('SIGKILL');
    assert.equal(code, 0, 'server should exit 0 after stdin EOF');
  });

  test('releases the port on that exit so the next owner can bind', async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [distCli], {
      env: { ...process.env, DM_PORT: String(port) },
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    await waitForStderr(child, /DESIGN MODE MCP READY/);
    assert.equal(await canBind(port), false, 'owner should hold the port while running');

    child.stdin?.end();
    const code = await waitForExit(child, 5_000);
    if (code === null) child.kill('SIGKILL');
    assert.equal(code, 0);

    assert.equal(await canBind(port), true, 'port should be free once the owner exits');
  });

  test('an attacher also exits on stdin EOF, leaving the owner untouched', async () => {
    const port = await getFreePort();
    const owner = spawn(process.execPath, [distCli], {
      env: { ...process.env, DM_PORT: String(port) },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    await waitForStderr(owner, /DESIGN MODE MCP READY/);

    const attacher = spawn(process.execPath, [distCli], {
      env: { ...process.env, DM_PORT: String(port) },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    await waitForStderr(attacher, /attached|Attached/);

    attacher.stdin?.end();
    const attacherCode = await waitForExit(attacher, 5_000);
    if (attacherCode === null) attacher.kill('SIGKILL');
    assert.equal(attacherCode, 0, 'attacher should exit on stdin EOF');

    // The owner must survive its attacher leaving.
    const ownerExited = await waitForExit(owner, 1_000);
    assert.equal(ownerExited, null, 'owner should still be running');

    owner.stdin?.end();
    const ownerCode = await waitForExit(owner, 5_000);
    if (ownerCode === null) owner.kill('SIGKILL');
    assert.equal(ownerCode, 0);
  });
});
