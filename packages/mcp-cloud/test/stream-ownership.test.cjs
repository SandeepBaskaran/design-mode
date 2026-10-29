const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// In-memory Redis covering the commands the relay uses. EVAL is emulated per
// script; relay-lifecycle.test.cjs runs the real Lua against redis-server.
function fixture() {
  const values = new Map();
  const expiries = new Map();
  const lists = new Map();
  const hooks = { beforeEval: null, afterEval: null, lPush: null };
  const logs = [];
  let scripts;
  const live = key => {
    if (expiries.has(key) && expiries.get(key) <= Date.now()) { values.delete(key); expiries.delete(key); }
    return values.has(key);
  };
  const list = key => { if (!lists.has(key)) lists.set(key, []); return lists.get(key); };
  const redis = {
    async get(key) { return live(key) ? values.get(key) : null; },
    async set(key, value, options) {
      if (options?.XX && !live(key)) return null;
      values.set(key, value);
      if (options?.PX) expiries.set(key, Date.now() + options.PX);
      else if (options?.EX) expiries.set(key, Date.now() + options.EX * 1000);
      else expiries.delete(key);
      return 'OK';
    },
    async del(key) { const had = live(key); values.delete(key); expiries.delete(key); return Number(had); },
    async exists(key) { return Number(live(key)); },
    async expire() { return true; },
    async incr(key) { const n = Number((live(key) && values.get(key)) || 0) + 1; values.set(key, String(n)); return n; },
    async rPush(key, raw) { return list(key).push(raw); },
    async lPush(key, raw) { if (hooks.lPush) await hooks.lPush(); return list(key).unshift(raw); },
    multi() {
      const commands = [];
      const chain = {
        rPush(...args) { commands.push(() => redis.rPush(...args)); return chain; },
        lPush(...args) { commands.push(() => redis.lPush(...args)); return chain; },
        expire(...args) { commands.push(() => redis.expire(...args)); return chain; },
        async exec() { return Promise.all(commands.map(command => command())); },
      };
      return chain;
    },
    async sendCommand(args) {
      assert.equal(args[0], 'EVAL');
      if (hooks.beforeEval) await hooks.beforeEval(args);
      const [, script, , ...rest] = args;
      let result;
      if (script === scripts.CONSUME_SCRIPT) {
        const [owner, queue, id, leaseMs] = rest;
        const current = (await redis.get(owner));
        if (current === null) await redis.set(owner, id, { PX: Number(leaseMs) });
        else if (current !== id) return [0];
        else expiries.set(owner, Date.now() + Number(leaseMs));
        const item = list(queue).shift();
        result = item === undefined ? [1] : [1, item];
      } else if (script === scripts.RELEASE_SCRIPT) {
        const [owner, id] = rest;
        result = (await redis.get(owner)) === id ? await redis.del(owner) : 0;
      } else throw new Error('unknown script');
      if (hooks.afterEval) await hooks.afterEval(args, result);
      return result;
    },
  };
  const root = resolve(__dirname, '..');
  const modules = new Map([
    [resolve(root, 'lib/kv.ts'), { kv: async () => redis }],
    [resolve(root, 'lib/log.ts'), { logEvent: (label, meta) => logs.push({ label, ...meta }) }],
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
  const store = load('lib/store.ts');
  scripts = store;
  return { load, store, values, lists, hooks, redis, logs, queue: tenant => list(`inbound:${tenant}`) };
}

async function collect(store, tenantId, streamId, abort, sink) {
  for await (const msg of store.readInbound({ tenantId, streamId, signal: abort.signal, pollMs: 5 })) sink.push(msg.type);
}

const OWNER_T = '{inbound:t}:owner';
const settle = (ms = 60) => new Promise(r => setTimeout(r, ms));

async function waitFor(check, ms = 1000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met');
    await settle(5);
  }
}

test('a single stream receives every queued request in order', async () => {
  const { store } = fixture();
  await store.claimOwner('t', 'A');
  for (let i = 0; i < 4; i++) await store.publishInbound('t', { type: `R${i}` });
  const got = [];
  const abort = new AbortController();
  const run = collect(store, 't', 'A', abort, got);
  await waitFor(() => got.length === 4);
  abort.abort(); await run;
  assert.deepEqual(got, ['R0', 'R1', 'R2', 'R3']);
});

test('a superseded stream cannot consume and the current stream receives the request', async () => {
  const { store, queue } = fixture();
  await store.claimOwner('t', 'A');
  await store.claimOwner('t', 'B');
  await store.publishInbound('t', { type: 'REQ' });
  assert.deepEqual(await store.consumeInbound('t', 'A'), { owner: false, item: null });
  assert.equal(queue('t').length, 1);
  const { owner, item } = await store.consumeInbound('t', 'B');
  assert.equal(owner, true);
  assert.equal(JSON.parse(item).type, 'REQ');
});

test('regression: a stale stream no longer takes a share of requests (was 6/8 answered)', async () => {
  const { store } = fixture();
  const stale = []; const current = [];
  const abort = new AbortController();
  await store.claimOwner('t', 'stale');
  const a = collect(store, 't', 'stale', abort, stale);
  await store.claimOwner('t', 'current');
  const b = collect(store, 't', 'current', abort, current);
  for (let i = 0; i < 8; i++) { await store.publishInbound('t', { type: `R${i}` }); await settle(8); }
  await waitFor(() => current.length === 8);
  abort.abort(); await Promise.all([a, b]);
  assert.equal(stale.length, 0);
  assert.equal(current.length, 8);
});

test('a missing or expired ownership record is reclaimed by the next poll', async () => {
  const { store, values, redis } = fixture();
  await store.claimOwner('t', 'A');
  await redis.del(OWNER_T);
  assert.equal((await store.consumeInbound('t', 'B')).owner, true);
  assert.equal(values.get(OWNER_T), 'B');
  await redis.set(OWNER_T, 'B', { PX: 1 });
  await settle(5);
  assert.equal((await store.consumeInbound('t', 'A')).owner, true);
  assert.equal(values.get(OWNER_T), 'A');
});

test('the owner refreshes its lease while polling', async () => {
  const { store, redis } = fixture();
  await redis.set(OWNER_T, 'A', { PX: 40 });
  for (let i = 0; i < 4; i++) { await settle(20); assert.equal((await store.consumeInbound('t', 'A')).owner, true); }
  assert.equal(await redis.get(OWNER_T), 'A');
});

test('an older stream cannot release or overwrite a newer owner', async () => {
  const { store, values } = fixture();
  await store.claimOwner('t', 'A');
  await store.claimOwner('t', 'B');
  await store.releaseOwner('t', 'A');
  assert.equal(values.get(OWNER_T), 'B');
  await store.consumeInbound('t', 'A');
  assert.equal(values.get(OWNER_T), 'B');
  await store.releaseOwner('t', 'B');
  assert.equal(values.has(OWNER_T), false);
});

test('Redis errors while polling lose nothing, are logged once per outage, and the stream recovers', async () => {
  const { store, hooks, queue, logs } = fixture();
  await store.claimOwner('t', 'A');
  await store.publishInbound('t', { type: 'REQ' });
  let failures = 3;
  hooks.beforeEval = () => { if (failures-- > 0) throw Object.assign(new Error('injected'), { code: 'ECONNRESET' }); };
  const got = [];
  const abort = new AbortController();
  const run = collect(store, 't', 'A', abort, got);
  await waitFor(() => got.length === 1);
  abort.abort(); await run;
  assert.deepEqual(got, ['REQ']);
  assert.equal(queue('t').length, 0);
  assert.deepEqual(logs.map(l => [l.label, l.error]), [
    ['relay.inbound.consume_error', 'ECONNRESET'],
    ['relay.inbound.consume_recovered', undefined],
  ]);
});

test('a superseded stream polling an empty or owned queue logs nothing', async () => {
  const { store, logs } = fixture();
  await store.claimOwner('t', 'A');
  await store.claimOwner('t', 'B');
  await store.publishInbound('t', { type: 'REQ' });
  const got = [];
  const abort = new AbortController();
  const run = collect(store, 't', 'A', abort, got);
  await settle(80);
  abort.abort(); await run;
  assert.deepEqual(got, []);
  assert.deepEqual(logs, []);
});

async function openStream(f, token, tenant) {
  const auth = f.load('lib/auth.ts');
  if (!(await auth.verifyToken(token))) await auth.storeToken(token, tenant);
  const abort = new AbortController();
  const response = await f.load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
    headers: { authorization: `Bearer ${token}` }, signal: abort.signal,
  }));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames = [];
  let done = false;
  (async () => {
    for (;;) {
      const r = await reader.read().catch(() => ({ done: true }));
      if (r.done) { done = true; return; }
      frames.push(decoder.decode(r.value));
    }
  })();
  return { abort, reader, frames, isDone: () => done, relayed: type => frames.some(f => f.includes(`"type":"${type}"`)) };
}

test('two active tabs: the newer stream owns delivery and the older stays open without reconnecting', async () => {
  const f = fixture();
  const older = await openStream(f, 'dm_tab', 't_tabs');
  await settle();
  const newer = await openStream(f, 'dm_tab', 't_tabs');
  await settle();
  for (let i = 0; i < 4; i++) await f.store.publishInbound('t_tabs', { type: `TAB_${i}` });
  await waitFor(() => [0, 1, 2, 3].every(i => newer.relayed(`TAB_${i}`)));
  await settle(100);
  assert.equal([0, 1, 2, 3].some(i => older.relayed(`TAB_${i}`)), false);
  assert.equal(older.isDone(), false, 'a superseded stream must not close, or older clients reconnect and displace the newer tab');
  newer.abort.abort(); await newer.reader.cancel();
  await f.store.publishInbound('t_tabs', { type: 'AFTER_NEWER_CLOSED' });
  await waitFor(() => older.relayed('AFTER_NEWER_CLOSED'));
  older.abort.abort(); await older.reader.cancel();
});

test('a stream that dies right after taking a request puts it back for the next owner', async () => {
  const f = fixture();
  const first = await openStream(f, 'dm_drop', 't_drop');
  await settle();
  f.hooks.afterEval = async (args, result) => {
    if (Array.isArray(result) && result[1]) {
      f.hooks.afterEval = null;
      first.abort.abort();
      await first.reader.cancel();
    }
  };
  await f.store.publishInbound('t_drop', { type: 'IN_FLIGHT' });
  await waitFor(() => first.isDone());
  await settle();
  assert.equal(first.relayed('IN_FLIGHT'), false);
  assert.match(f.queue('t_drop')[0] ?? '', /IN_FLIGHT/);
  const second = await openStream(f, 'dm_drop', 't_drop');
  await waitFor(() => second.relayed('IN_FLIGHT'));
  second.abort.abort(); await second.reader.cancel();
});

test('a failed put-back is logged with metadata only', async () => {
  const f = fixture();
  const s = await openStream(f, 'dm_requeue_secret', 't_requeue');
  await settle();
  f.hooks.lPush = () => { throw Object.assign(new Error('write refused'), { code: 'READONLY' }); };
  f.hooks.afterEval = async (args, result) => {
    if (Array.isArray(result) && result[1]) { f.hooks.afterEval = null; s.abort.abort(); await s.reader.cancel(); }
  };
  await f.store.publishInbound('t_requeue', { type: 'SECRET_TYPE', payload: { selector: '#private-selector' } });
  await waitFor(() => f.logs.some(l => l.label === 'stream.requeue_error'));
  const entry = f.logs.find(l => l.label === 'stream.requeue_error');
  assert.deepEqual(entry, { label: 'stream.requeue_error', tenantId: 't_requeue', type: 'SECRET_TYPE', error: 'READONLY' });
  assert.doesNotMatch(JSON.stringify(f.logs), /dm_requeue_secret|private-selector/);
});

test('a revoked token stops its stream before it takes queued requests', async () => {
  const f = fixture();
  const s = await openStream(f, 'dm_revoke', 't_revoke');
  await settle();
  await f.load('lib/auth.ts').revokeToken('dm_revoke');
  await f.store.publishInbound('t_revoke', { type: 'AFTER_REVOKE' });
  await waitFor(() => s.isDone());
  assert.equal(s.relayed('AFTER_REVOKE'), false);
  assert.equal(f.queue('t_revoke').length, 1);
});

test('logEvent never throws, even when the log sink does', () => {
  const filename = resolve(__dirname, '..', 'lib/log.ts');
  const mod = new Module(filename, module);
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  const original = console.log;
  console.log = () => { throw new Error('sink down'); };
  try { assert.doesNotThrow(() => mod.exports.logEvent('stream.requeue_error', { tenantId: 't', error: 'X' })); }
  finally { console.log = original; }
});

// Redis Cluster's key slot: CRC16/XMODEM of the hash tag (first {...} with content) or the whole key, mod 16384.
function keySlot(key) {
  const open = key.indexOf('{');
  const close = open >= 0 ? key.indexOf('}', open + 1) : -1;
  const tagged = close > open + 1 ? key.slice(open + 1, close) : key;
  let crc = 0;
  for (const byte of Buffer.from(tagged)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc % 16384;
}

test('owner and inbound keys share a Redis Cluster slot, so the consume script cannot hit CROSSSLOT', () => {
  const { store } = fixture();
  assert.equal(keySlot('123456789'), 12739, 'CRC16/XMODEM reference vector');
  for (const tenant of ['t', 't_0123456789abcdef', 't_ffffffffffffffff', 't_a1b2c3d4e5f60718']) {
    assert.equal(store.inboundKey(tenant), `inbound:${tenant}`, 'the queue key must keep its deployed name');
    assert.equal(keySlot(store.ownerKey(tenant)), keySlot(store.inboundKey(tenant)), tenant);
  }
  assert.notEqual(keySlot('owner:t_0123456789abcdef'), keySlot('inbound:t_0123456789abcdef'));
});
