const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile in memory so tests need no emitted files or additional dependencies.
function fixture() {
  const values = new Map();
  const writes = [];
  const reads = [];
  const inbound = [];
  const logs = [];
  const redis = {
    async get(key) { reads.push(key); return values.get(key) ?? null; },
    async set(key, value, options) {
      writes.push({ key, options });
      if (options?.XX && !values.has(key)) return null;
      values.set(key, value); return 'OK';
    },
    async del(key) { return Number(values.delete(key)); },
    async exists(key) { return Number(values.has(key)); },
    async expire() { return true; },
    async incr(key) {
      const value = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(value));
      return value;
    },
    async rPush(key, raw) { inbound.push({ key, message: JSON.parse(raw) }); return inbound.length; },
    multi() {
      const commands = [];
      return {
        rPush(...args) { commands.push(() => redis.rPush(...args)); return this; },
        expire(...args) { commands.push(() => redis.expire(...args)); return this; },
        async exec() { return Promise.all(commands.map(command => command())); },
      };
    },
  };
  const root = resolve(__dirname, '..');
  const modules = new Map([
    [resolve(root, 'lib/kv.ts'), { kv: async () => redis }],
    [resolve(root, 'lib/log.ts'), { logEvent: (event, fields) => logs.push({ event, ...fields }) }],
  ]);
  function load(file) {
    const filename = resolve(root, file);
    if (modules.has(filename)) return modules.get(filename);
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(dirname(filename));
    mod.require = (id) => id.startsWith('.')
      ? load(resolve(dirname(filename), id.replace(/\.js$/, '.ts')))
      : require(id);
    modules.set(filename, mod.exports);
    mod._compile(compiled, filename);
    return mod.exports;
  }
  return { load, values, writes, reads, inbound, logs, redis };
}

test('a lastSeen write cannot resurrect a concurrently revoked token', async () => {
  const f = fixture();
  const auth = f.load('lib/auth.ts');
  await auth.storeToken('dm_race', 't_race');
  const get = f.redis.get;
  let release;
  let read;
  const reached = new Promise(resolve => { read = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.redis.get = async key => {
    const value = await get(key);
    read();
    await gate;
    return value;
  };
  const pending = auth.verifyToken('dm_race');
  await reached;
  assert.equal(await auth.revokeToken('dm_race'), true);
  release();
  await pending;
  f.redis.get = get;
  assert.equal(f.values.size, 0);
  assert.equal(await auth.verifyToken('dm_race'), null);
});

function request(token, body, headers = {}) {
  return new Request('https://relay.test/api', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function tenants(f) {
  const auth = f.load('lib/auth.ts');
  await auth.storeToken('dm_test_A', 't_A');
  await auth.storeToken('dm_test_B', 't_B');
}

async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Expected relay activity did not occur');
}

test('an authenticated tenant cannot satisfy another tenant tool call with a known request ID', async () => {
  const f = fixture();
  await tenants(f);
  const mcp = f.load('api/mcp.ts');
  const inbox = f.load('api/extension/inbox.ts');
  const store = f.load('lib/store.ts');
  let settled = false;
  const pending = mcp.POST(request('dm_test_A', {
    jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_changes' },
  })).then(response => { settled = true; return response; });
  await until(() => f.inbound.some(({ message }) => message.requestId));
  const { requestId } = f.inbound.find(({ message }) => message.requestId).message;
  const spoof = { type: 'REPLY', responseTo: requestId, tenantId: 't_A', payload: { source: 'attacker' } };
  assert.equal((await inbox.POST(request('dm_test_B', spoof))).status, 200);
  const keyA = store.responseKey('t_A', requestId);
  const keyB = store.responseKey('t_B', requestId);
  assert.notEqual(keyA, keyB);
  assert.equal(f.values.has(keyA), false);
  assert.equal(f.values.has(keyB), true);
  // Let the real polling loop observe B's write before A sends its reply.
  const readCount = f.reads.length;
  await until(() => settled || f.reads.slice(readCount).includes(keyA));
  assert.equal(settled, false);
  assert.equal((await inbox.POST(request('dm_test_A', {
    type: 'REPLY', responseTo: requestId, payload: { source: 'owner' },
  }))).status, 200);
  const response = await pending;
  assert.equal(response.status, 200);
  const rpc = await response.json();
  assert.equal(rpc.id, 7);
  assert.deepEqual(JSON.parse(rpc.result.content[0].text), { source: 'owner' });
  assert.equal(f.values.has(keyA), false);
  assert.equal(f.values.has(keyB), true);
  assert.equal((await store.awaitResponse('t_B', requestId, 100)).payload.source, 'attacker');
  assert.equal(f.values.has(keyB), false);
  assert.deepEqual(f.writes.find(write => write.key === keyA).options, { EX: 60 });
});

test('browser failures remain MCP errors instead of success-shaped clear or screenshot results', async () => {
  for (const name of ['clear_changes', 'get_changes', 'apply_changes', 'get_screenshot']) {
    const f = fixture();
    await tenants(f);
    const mcp = f.load('api/mcp.ts');
    const inbox = f.load('api/extension/inbox.ts');
    const pending = mcp.POST(request('dm_test_A', {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: name === 'apply_changes' ? { routeKey: 'https://fixture.test/a', changes: [] } : {} },
    }));
    await until(() => f.inbound.some(({ message }) => message.requestId));
    const { requestId } = f.inbound.find(({ message }) => message.requestId).message;
    await inbox.POST(request('dm_test_A', {
      type: 'RELAY_RESPONSE', responseTo: requestId,
      payload: { error: 'Synthetic browser failure', candidates: [{ path: '#heading', label: 'Heading' }] },
    }));
    const result = (await (await pending).json()).result;
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Synthetic browser failure/);
    assert.doesNotMatch(result.content[0].text, /All changes cleared/);
    if (name === 'get_screenshot') assert.match(result.content[0].text, /#heading/);
  }
});

test('response polling ignores legacy global response keys and times out without an owned reply', async () => {
  const f = fixture();
  const store = f.load('lib/store.ts');
  f.values.set('resp:known-id', JSON.stringify({ type: 'REPLY', payload: 'legacy' }));
  await store.publishResponse('t_B', 'known-id', { type: 'REPLY', payload: 'B' });
  await assert.rejects(store.awaitResponse('t_A', 'known-id', 1), /Timed out/);
  assert.equal(f.values.has('resp:known-id'), true);
  assert.equal((await store.awaitResponse('t_B', 'known-id', 100)).payload, 'B');
});

const LIMIT = 6 * 1024 * 1024;
function sizedBody(bytes, character) {
  const prefix = '{"type":"REPLY","responseTo":"size-test","payload":"';
  const suffix = '"}';
  const room = bytes - Buffer.byteLength(prefix + suffix);
  const width = Buffer.byteLength(character);
  return prefix + character.repeat(Math.floor(room / width)) + 'a'.repeat(room % width) + suffix;
}

for (const character of ['a', 'é', '漢', '😀']) {
  test(`inbox enforces UTF-8 byte boundaries for ${character}`, async () => {
    const f = fixture();
    await tenants(f);
    const inbox = f.load('api/extension/inbox.ts');
    for (const bytes of [LIMIT - 1, LIMIT, LIMIT + 1]) {
      const body = sizedBody(bytes, character);
      assert.equal(Buffer.byteLength(body, 'utf8'), bytes);
      const before = f.writes.length;
      const response = await inbox.POST(request('dm_test_A', body, { 'content-length': '1' }));
      assert.equal(response.status, bytes > LIMIT ? 413 : 200);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      const responseWrites = f.writes.slice(before).filter(({ key }) => key.startsWith('resp:'));
      assert.equal(responseWrites.length, bytes > LIMIT ? 0 : 1);
      if (bytes > LIMIT) {
        assert.deepEqual(await response.json(), { error: 'payload too large' });
        assert.equal(f.logs.find(log => log.event === 'inbox.tooLarge').byteCount, bytes);
      }
    }
  });
}

test('inbox rejects unauthenticated, invalid JSON and malformed messages without storing replies', async () => {
  const f = fixture();
  await tenants(f);
  const inbox = f.load('api/extension/inbox.ts');
  for (const [token, body, status] of [
    ['dm_unknown', { type: 'REPLY', responseTo: 'known' }, 401],
    ['dm_test_A', '{invalid', 400],
    ['dm_test_A', { responseTo: 'known' }, 400],
    ['dm_test_A', { type: 'EVENT', payload: 'unsolicited' }, 200],
  ]) {
    assert.equal((await inbox.POST(request(token, body))).status, status);
  }
  assert.equal(f.writes.some(({ key }) => key.startsWith('resp:')), false);
});
