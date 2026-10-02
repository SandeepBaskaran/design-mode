import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile, readFile, chmod, symlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from './relay-fixture.cjs';
import { CLOUD_ENDPOINT, endpoint, loadConfig } from '../src/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const token = 'dm_synthetic_cli_fixture_not_a_real_credential';

async function setup() {
  const relay = fixture();
  await relay.load('lib/auth.ts').storeToken(token, 't_cli');
  const mcp = relay.load('api/mcp.ts');
  const requests: string[] = [];
  let fault = '';
  let leakedRedirect = 0;
  const server = createServer(async (req, res) => {
    if (req.url === '/leak') { leakedRedirect++; res.end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const rpc = body ? JSON.parse(body) : {};
    requests.push(rpc.method ?? 'GET');
    if (fault === 'redirect') { res.writeHead(307, { location: '/leak' }); res.end(); return; }
    if (fault === 'malformed') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ secret: token })); return; }
    if (rpc.method === 'tools/call' && fault === 'disconnect') { req.socket.destroy(); return; }
    if (rpc.method === 'tools/call' && fault === 'timeout') return;
    let response = req.method === 'GET' ? await mcp.GET() : await mcp.POST(new Request(CLOUD_ENDPOINT, {
      method: 'POST', headers: req.headers as Record<string, string>, body,
    }));
    if (fault === 'echo' && rpc.method === 'tools/list') {
      const json = await response.json();
      json.result.tools[0].description = token;
      response = Response.json(json);
    }
    if (fault === 'tool-error' && rpc.method === 'tools/call') {
      response = Response.json({ jsonrpc: '2.0', id: rpc.id, result: { isError: true, content: [{ type: 'text', text: token }] } });
    }
    if (fault === 'paginated' && rpc.method === 'tools/list') {
      const json = await response.json();
      json.result = rpc.params?.cursor === 'next'
        ? { tools: json.result.tools.slice(4) }
        : { tools: json.result.tools.slice(0, 4), nextCursor: 'next' };
      response = Response.json(json);
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/mcp`;
  const artifacts = resolve(root, '.test-artifacts');
  await mkdir(artifacts, { recursive: true });
  const dir = await mkdtemp(resolve(artifacts, 'remote-'));
  const guard = resolve(dir, 'network-guard.cjs');
  await writeFile(guard, `const original = globalThis.fetch;
const canonical = ${JSON.stringify(CLOUD_ENDPOINT)};
const fixture = ${JSON.stringify(url)};
globalThis.fetch = (url, init) => {
  const href = String(url);
  if (href !== canonical && href !== fixture) throw new Error('Non-fixture network blocked');
  return original(href === canonical ? fixture : href, init);
};
const Module = require('node:module');
const path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (!Module.builtinModules.includes(request.replace(/^node:/, '')) && !path.isAbsolute(request)) throw new Error('External dependency forbidden');
  return resolve.call(this, request, ...args);
};
`);
  async function cli(args: string[], env: Record<string, string> = {}, input = '', entry = resolve(root, 'dist/cli.cjs')) {
    const child = spawn(process.env.DM_TEST_NODE ?? process.execPath, [entry, ...args], {
      cwd: dir, env: { PATH: process.env.PATH, HOME: dir, NODE_OPTIONS: `--require=${guard}`, ...env }, stdio: 'pipe',
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    const [code] = await once(child, 'close');
    assert.ok(!stdout.includes(token), 'credential leaked to stdout');
    assert.ok(!stderr.includes(token), 'credential leaked to stderr');
    assert.equal(stderr.replace(/^\(node:\d+\) ExperimentalWarning: The Fetch API is an experimental feature\. This feature could change at any time\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\n$/, ''), '');
    return { code, stdout, json: () => JSON.parse(stdout) };
  }
  const cloud = { DM_CLOUD_TOKEN: token };
  const self = { DM_MODE: 'self-hosted', DM_ENDPOINT: url, DM_SELF_HOSTED_TOKEN: token };
  return { cli, cloud, self, requests, relay, dir, url,
    fault: (value: string) => { fault = value; }, leaked: () => leakedRedirect,
    async close() { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await rm(dir, { recursive: true, force: true }); },
  };
}

test('Cloud defaults to canonical MCP; both remote modes exercise actual route and auth', async () => {
  const f = await setup();
  try {
    for (const env of [f.cloud, f.self]) {
      const before = f.requests.length;
      const list = await f.cli(['tools'], env);
      assert.equal(list.code, 0, list.stdout);
      assert.equal(list.json().tools.length, 8);
      assert.equal(list.json().mode, env === f.cloud ? 'cloud' : 'self-hosted');
      assert.deepEqual(f.requests.slice(before), ['initialize', 'notifications/initialized', 'tools/list']);
      const schema = await f.cli(['schema', 'apply_changes'], env);
      assert.deepEqual(schema.json().tool, list.json().tools.find((tool: { name: string }) => tool.name === 'apply_changes'));
      const status = await f.cli(['status'], env);
      assert.equal(status.code, 0);
      assert.equal(status.json().extensionConnected, null);
      assert.equal(status.json().authenticated, true);
      const unscoped = await f.cli(['call', 'apply_changes', '--stdin'], env, '{"changes":[{"elementId":"test","styles":{"color":"red"}}]}');
      assert.equal(unscoped.code, 1);
      assert.match(unscoped.json().result.content[0].text, /routeKey/);
      const call = await f.cli(['call', 'apply_changes', '--stdin'], env, '{"routeKey":"https://example.test/page","changes":[{"elementId":"test","styles":{"color":"red"}}]}');
      assert.equal(call.code, 0, call.stdout);
      assert.match(call.json().result.content[0].text, /Applied 1 style change/);
      assert.equal((await f.cli(['schema', 'not-on-server'], env)).code, 2);
    }
    assert.equal(f.relay.inbound.filter((message: { type: string }) => message.type === 'CLOUD_APPLY_CHANGES').length, 2);
    f.fault('paginated');
    assert.equal((await f.cli(['tools'], f.self)).json().tools.length, 8);
  } finally { await f.close(); }
});

test('offline help, credentials, explicit mode and protected profile configuration', async () => {
  const f = await setup();
  try {
    const invalidConfig = { DM_CONFIG: resolve(f.dir, 'absent'), DM_MODE: 'invalid' };
    assert.equal((await f.cli(['--help'], invalidConfig)).code, 0);
    assert.equal((await f.cli(['status'])).json().error.code, 'MISSING_CREDENTIAL');
    assert.equal((await f.cli(['--mode', 'wrong', 'status'], f.cloud)).code, 2);
    assert.equal((await f.cli(['status'], { ...f.cloud, DM_ENDPOINT: f.url })).code, 2);
    assert.equal((await f.cli(['--mode', 'self-hosted', 'status'], { ...f.cloud, DM_ENDPOINT: f.url })).code, 2);
    assert.equal((await f.cli(['--token', token], f.cloud)).code, 2);
    assert.equal(f.requests.length, 0);
    const config = resolve(f.dir, 'config.json');
    await writeFile(config, JSON.stringify({ mode: 'self-hosted', selfHosted: { endpoint: f.url, token }, cloud: { token } }), { mode: 0o600 });
    assert.equal((await f.cli(['status'], { DM_CONFIG: config })).json().mode, 'self-hosted');
    assert.equal((await f.cli(['--mode', 'cloud', 'status'], { DM_CONFIG: config, DM_MODE: 'local' })).json().mode, 'cloud');
    assert.equal((await f.cli(['tools'], { DM_CONFIG: config, DM_MODE: 'local' })).json().tools.length, 9);
    await chmod(config, 0o644);
    assert.equal((await f.cli(['status'], { DM_CONFIG: config })).json().error.code, 'INVALID_CONFIG');
    await chmod(config, 0o600);
    const link = resolve(f.dir, 'link.json');
    await symlink(config, link);
    assert.equal((await f.cli(['status'], { DM_CONFIG: link })).code, 2);
    await writeFile(config, '{"cloud":{"token":');
    assert.equal((await f.cli(['status'], { DM_CONFIG: config })).code, 2);
    await writeFile(config, JSON.stringify({ token }));
    assert.equal((await f.cli(['status'], { DM_CONFIG: config })).code, 2);
    assert.equal((await f.cli(['status'], { ...f.self, DM_TIMEOUT_MS: '1' })).code, 2);
    const requests = f.requests.length;
    for (const input of ['secret-json', '[]', 'null', 'x'.repeat(1_000_001)]) {
      assert.equal((await f.cli(['call', 'apply_changes', '--stdin'], f.self, input)).code, 2);
    }
    assert.equal(f.requests.length, requests);
  } finally { await f.close(); }
});

test('endpoint validation excludes cleartext remote, credentials and token query strings', async () => {
  for (const value of ['http://example.test/api/mcp', 'http://127.0.0.2/api/mcp', 'ftp://localhost/api/mcp',
    'https://user:password@example.test/api/mcp', 'https://example.test/api/mcp?token=secret',
    'https://example.test/api/mcp#secret', 'https://example.test/wrong', 'not a URL']) assert.throws(() => endpoint(value));
  for (const value of ['https://example.test/api/mcp', 'http://127.0.0.1:4567/api/mcp', 'http://localhost/api/mcp', 'http://[::1]/api/mcp']) assert.ok(endpoint(value));
  const config = await loadConfig(undefined, { DM_CLOUD_TOKEN: token });
  assert.equal(config.mode, 'cloud');
  assert.equal(config.url.href, CLOUD_ENDPOINT);
});

test('auth, malformed responses, redirects, timeouts and disconnects fail without retry or leaks', async () => {
  const f = await setup();
  try {
    const invalid = await f.cli(['tools'], { ...f.self, DM_SELF_HOSTED_TOKEN: 'dm_unknown_fixture' });
    assert.equal(invalid.code, 1);
    assert.equal(invalid.json().error.code, 'AUTH_FAILED');
    for (const fault of ['redirect', 'malformed']) {
      f.fault(fault);
      const before = f.requests.length;
      const result = await f.cli(['tools'], f.self);
      assert.equal(result.code, 1, result.stdout);
      assert.equal(f.requests.length - before, 1);
    }
    assert.equal(f.leaked(), 0);
    for (const fault of ['disconnect', 'timeout']) {
      f.fault(fault);
      const before = f.requests.filter(method => method === 'tools/call').length;
      const result = await f.cli(['call', 'clear_changes'], { ...f.self, DM_TIMEOUT_MS: '300' });
      assert.equal(result.code, 1, result.stdout);
      if (fault === 'timeout') assert.equal(result.json().error.code, 'TIMEOUT');
      assert.equal(f.requests.filter(method => method === 'tools/call').length - before, 1);
    }
    f.fault('echo');
    assert.match((await f.cli(['tools'], f.self)).stdout, /REDACTED/);
    f.fault('tool-error');
    const error = await f.cli(['call', 'clear_changes'], f.self);
    assert.equal(error.code, 1);
    assert.equal(error.json().result.isError, true);
    assert.match(error.stdout, /REDACTED/);
  } finally { await f.close(); }
});

test('exact npm tarball metadata and standalone executable work in all three modes', async () => {
  const f = await setup();
  try {
    const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', f.dir], { cwd: root, encoding: 'utf8' }));
    assert.equal(pack.name, '@designmode-app/cli');
    assert.deepEqual(pack.files.map((file: { path: string }) => file.path).sort(), ['LICENSE', 'PUBLISHING.md', 'README.md', 'dist/THIRD-PARTY-NOTICES.txt', 'dist/cli.cjs', 'package.json']);
    execFileSync('tar', ['-xzf', resolve(f.dir, pack.filename), '-C', f.dir]);
    const metadata = JSON.parse(await readFile(resolve(f.dir, 'package/package.json'), 'utf8'));
    assert.deepEqual(metadata.bin, { 'designmode-app': 'dist/cli.cjs' });
    assert.deepEqual(metadata.publishConfig, { access: 'public' });
    assert.equal(metadata.private, true);
    const entry = resolve(f.dir, 'package/dist/cli.cjs');
    for (const env of [f.cloud, f.self, { DM_MODE: 'local' }]) {
      const list = await f.cli(['tools'], env, '', entry);
      assert.equal(list.code, 0, list.stdout);
      assert.equal(list.json().tools.length, 'DM_MODE' in env && env.DM_MODE === 'local' ? 9 : 8);
    }
    for (const env of [f.cloud, f.self]) {
      const call = await f.cli(['call', 'get_session_summary'], env, '', entry);
      assert.equal(call.code, 0, call.stdout);
      assert.equal(JSON.parse(call.json().result.content[0].text).extensionConnected, true);
    }
  } finally { await f.close(); }
});
