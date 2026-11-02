// Redis-free: the stream's 290s clean close, with a tiny in-memory KV.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function fakeKv() {
  const data = new Map(); const lists = new Map();
  return {
    async get(k) { return data.has(k) ? data.get(k) : null; },
    async set(k, v, o) { if (o && o.XX && !data.has(k)) return null; data.set(k, v); return 'OK'; },
    async exists(k) { return data.has(k) || lists.has(k) ? 1 : 0; },
    async del(k) { return data.delete(k) ? 1 : 0; },
    async sendCommand(args) { const l = lists.get(args[1]) || []; const out = l.splice(0, Number(args[2])); return out.length ? out : null; },
    push(k, v) { const l = lists.get(k) || []; l.push(v); lists.set(k, l); },
  };
}

function loadFixture(redis) {
  const root = resolve(__dirname, '..');
  const modules = new Map([
    [resolve(root, 'lib/kv.ts'), { kv: async () => redis }],
    [resolve(root, 'lib/log.ts'), { logEvent(label) { loadFixture.logs.push(label); } }],
  ]);
  function load(file) {
    const filename = resolve(root, file);
    if (modules.has(filename)) return modules.get(filename);
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(dirname(filename));
    mod.require = id => id.startsWith('.') ? load(resolve(dirname(filename), id.replace(/\.js$/, '.ts'))) : require(id);
    modules.set(filename, mod.exports);
    mod._compile(compiled, filename);
    return mod.exports;
  }
  return load;
}
loadFixture.logs = [];

async function readAll(reader, ms = 3000) {
  const dec = new TextDecoder(); let out = '';
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const r = await Promise.race([reader.read(), new Promise(res => setTimeout(() => res({ timeout: true }), deadline - Date.now()))]);
    if (r.timeout) throw new Error('stream did not close: ' + out);
    if (r.done) return out;
    out += dec.decode(r.value);
  }
  throw new Error('stream did not close: ' + out);
}

test('stream ends itself with an `event: reconnect` before the function limit', async () => {
  process.env.DM_STREAM_MAX_MS = '300';
  const redis = fakeKv();
  const load = loadFixture(redis);
  const auth = load('lib/auth.ts');
  await auth.storeToken('dm_local_reconnect', 't_reconnect');
  const abort = new AbortController();
  const response = await load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
    headers: { authorization: 'Bearer dm_local_reconnect' }, signal: abort.signal,
  }));
  assert.equal(response.status, 200);
  const started = Date.now();
  const text = await readAll(response.body.getReader());
  assert.ok(Date.now() - started < 2000);
  assert.match(text, /event: hello/);
  assert.match(text, /event: reconnect\ndata: \{"reason":"max_duration"\}\n\n$/, 'reconnect is the last frame');
  assert.ok(loadFixture.logs.includes('stream.reconnect'));
  assert.ok(!loadFixture.logs.includes('stream.error'));
  abort.abort();
});

test('a message queued before the deadline is delivered, then the stream says reconnect', async () => {
  process.env.DM_STREAM_MAX_MS = '400';
  const redis = fakeKv();
  const load = loadFixture(redis);
  await load('lib/auth.ts').storeToken('dm_local_reconnect2', 't_reconnect2');
  redis.push('inbound:t_reconnect2', JSON.stringify({ type: 'QUEUED' }));
  const response = await load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
    headers: { authorization: 'Bearer dm_local_reconnect2' },
  }));
  const text = await readAll(response.body.getReader());
  assert.ok(text.indexOf('QUEUED') > 0 && text.indexOf('QUEUED') < text.indexOf('event: reconnect'));
});

test('a client disconnect is not a reconnect request', async () => {
  process.env.DM_STREAM_MAX_MS = '5000';
  const redis = fakeKv();
  const load = loadFixture(redis);
  await load('lib/auth.ts').storeToken('dm_local_reconnect3', 't_reconnect3');
  const abort = new AbortController();
  const response = await load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
    headers: { authorization: 'Bearer dm_local_reconnect3' }, signal: abort.signal,
  }));
  const reader = response.body.getReader();
  await reader.read();
  abort.abort();
  const rest = await readAll(reader).catch(() => '');
  assert.doesNotMatch(rest, /reconnect/);
});

test('the time budget can never exceed the Vercel function limit', () => {
  const vercel = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8'));
  const source = readFileSync(resolve(__dirname, '../api/extension/stream.ts'), 'utf8');
  const max = Number(/STREAM_MAX_MS = ([\d_]+)/.exec(source)[1].replace(/_/g, ''));
  assert.ok(max / 1000 <= vercel.functions['api/extension/stream.ts'].maxDuration - 5);
});
