import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimOrAttach, probeOwnerHealth } from '../../mcp-local/src/owner-bridge.js';
import { state } from '../../mcp-local/src/state.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = resolve(root, 'dist/cli.cjs');

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function cli(args: string[], port: number | string, input = '', executable = entry, extraEnv = {}) {
  const child = spawn(process.execPath, [executable, ...args], {
    cwd: root, env: { ...process.env, DM_PORT: String(port), ...extraEnv }, stdio: 'pipe',
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const [code] = await once(child, 'exit');
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

test('offline help, discovery and canonical schema', async () => {
  const port = await freePort();
  const help = await cli(['--help'], port);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /never starts or replaces/);
  const list = await cli(['tools'], port);
  assert.equal(list.code, 0);
  assert.equal(list.stderr, '');
  assert.equal(list.json().tools.length, 9);
  const schema = await cli(['schema', 'apply_changes'], port);
  assert.equal(schema.code, 0);
  assert.deepEqual(schema.json().tool, list.json().tools.find((t: { name: string }) => t.name === 'apply_changes'));
  assert.deepEqual(schema.json().tool.inputSchema.required, ['changes']);
  assert.equal(await probeOwnerHealth(port), null);
});

test('usage and input errors never echo input', async () => {
  const port = await freePort();
  for (const args of [['bogus'], ['call'], ['tools', 'extra'], ['schema', 'missing'], ['call', 'get_changes', 'secret-value']]) {
    const result = await cli(args, port);
    assert.equal(result.code, 2);
    assert.equal(result.json().ok, false);
    assert.doesNotMatch(result.stdout, /secret-value/);
  }
  for (const input of ['secret-value', '[]', 'null', '"secret-value"', 'x'.repeat(1_000_001)]) {
    const result = await cli(['call', 'apply_changes', '--stdin'], port, input);
    assert.equal(result.code, 2);
    assert.doesNotMatch(result.stdout, /secret-value/);
  }
  assert.equal((await cli(['status'], '9960oops')).code, 2);
});

test('unavailable bridge fails without creating an owner', async () => {
  const port = await freePort();
  assert.equal((await cli(['status'], port)).code, 3);
  const call = await cli(['call', 'get_changes'], port);
  assert.equal(call.code, 3);
  assert.equal(call.json().error.code, 'BRIDGE_UNAVAILABLE');
  assert.equal(await probeOwnerHealth(port), null);
});

test('real owner status, proxy invocation, validation and offline mutation guard', async () => {
  const port = await freePort();
  const owner = await claimOrAttach(port);
  try {
    const status = await cli(['status'], port);
    assert.equal(status.code, 4);
    assert.equal(status.json().bridge, 'running');
    assert.equal(status.json().extensionConnected, false);
    const health = await probeOwnerHealth(port);
    assert.ok(health);
    assert.ok(!status.stdout.includes(health.webSocketToken));
    const summary = await cli(['call', 'get_session_summary'], port);
    assert.equal(summary.code, 0);
    assert.equal(JSON.parse(summary.json().result.content[0].text).extensionConnected, false);
    const invalid = await cli(['call', 'apply_changes', '--stdin'], port, '{"changes":"wrong"}');
    assert.equal(invalid.code, 1);
    assert.equal(invalid.json().result.isError, true);
    const before = state.getFullChangeReport();
    for (const tool of ['clear_changes', 'get_changes', 'get_screenshot']) {
      const result = await cli(['call', tool], port);
      assert.equal(result.code, 4);
      assert.equal(result.json().error.code, 'EXTENSION_OFFLINE');
    }
    assert.deepEqual(state.getFullChangeReport(), before);
    assert.equal((await probeOwnerHealth(port))?.pid, process.pid);
  } finally {
    await owner.close();
  }
});

test('connected synthetic extension receives validated calls exactly once', async () => {
  const port = await freePort();
  const owner = await claimOrAttach(port);
  const health = await probeOwnerHealth(port);
  assert.ok(health);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(health.webSocketToken)}`);
  const received: unknown[] = [];
  socket.on('message', data => {
    const message = JSON.parse(data.toString());
    if (message.type === 'APPLY_CHANGES') {
      received.push(message.payload);
      socket.send(JSON.stringify({ responseTo: message.requestId, payload: { ok: true, totalProps: 1, totalEls: 1 } }));
    }
  });
  try {
    await once(socket, 'open');
    assert.equal((await cli(['status'], port)).code, 0);
    const argumentsObject = { changes: [{ elementId: 'dm-test', styles: { color: 'red' } }] };
    const result = await cli(['call', 'apply_changes', '--stdin'], port, JSON.stringify(argumentsObject));
    assert.equal(result.code, 0);
    assert.match(result.json().result.content[0].text, /Applied 1 style change to 1 element/);
    assert.deepEqual(received, [argumentsObject]);
    const invalid = await cli(['call', 'apply_changes', '--stdin'], port, '{"changes":[{"elementId":42}]}');
    assert.equal(invalid.code, 1);
    assert.equal(received.length, 1);
  } finally {
    socket.close();
    await once(socket, 'close');
    await owner.close();
  }
});

test('npm tarball has an executable standalone entry without workspace imports', async () => {
  const artifacts = resolve(root, '.test-artifacts');
  await mkdir(artifacts, { recursive: true });
  const dir = await mkdtemp(resolve(artifacts, 'pack-'));
  try {
    const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], {
      cwd: root, encoding: 'utf8',
    }));
    assert.equal(packed[0].name, '@designmode/cli');
    assert.ok(packed[0].files.some((file: { path: string; mode: number }) => file.path === 'dist/cli.cjs' && (file.mode & 0o111) !== 0));
    assert.ok(packed[0].files.some((file: { path: string }) => file.path === 'LICENSE'));
    assert.ok(packed[0].files.some((file: { path: string }) => file.path === 'dist/THIRD-PARTY-NOTICES.txt'));
    assert.ok(!packed[0].files.some((file: { path: string }) => file.path.startsWith('src/')));
    execFileSync('tar', ['-xzf', resolve(dir, packed[0].filename), '-C', dir]);
    const guard = resolve(dir, 'no-workspace.cjs');
    await writeFile(guard, `const Module = require('node:module');
const path = require('node:path');
const original = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (!Module.isBuiltin(request) && !path.isAbsolute(request)) throw new Error('External dependency forbidden');
  return original.call(this, request, ...args);
};\n`);
    const result = await cli(['tools'], await freePort(), '', resolve(dir, 'package/dist/cli.cjs'), {
      NODE_OPTIONS: `--require=${guard}`,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.json().tools.length, 9);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
