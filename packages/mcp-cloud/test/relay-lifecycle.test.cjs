const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { resolve, dirname, join } = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const Module = require('node:module');
const ts = require('typescript');
const { createClient } = require('redis');

function loadFixture(redis, timers = globalThis) {
  const root = resolve(__dirname, '..');
  const modules = new Map([
    [resolve(root, 'lib/kv.ts'), { kv: async () => redis }],
    [resolve(root, 'lib/log.ts'), { logEvent() {} }],
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
    mod.require = id => id.startsWith('.')
      ? load(resolve(dirname(filename), id.replace(/\.js$/, '.ts')))
      : require(id);
    modules.set(filename, mod.exports);
    mod.testTimers = timers;
    mod._compile('const { setInterval, clearInterval } = module.testTimers;\n' + compiled, filename);
    return mod.exports;
  }
  return load;
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('local lifecycle test timed out')), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

// Explicit executable opt-in: never use REDIS_URL or a hosted Redis fixture.
test('relay lifecycle against an isolated real Redis', {
  skip: !process.env.REDIS_SERVER_BIN && 'set REDIS_SERVER_BIN to a local redis-server executable',
}, async t => {
  const dir = mkdtempSync(join(process.cwd(), '.security-redis-'));
  const reservation = require('node:net').createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.env.REDIS_SERVER_BIN, [
    '--bind', '127.0.0.1', '--port', String(port),
    '--save', '', '--appendonly', 'no', '--dir', dir,
  ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let startup = '';
  await bounded(new Promise((resolve, reject) => {
    server.on('error', reject);
    server.on('exit', code => reject(new Error(`local Redis exited ${code}`)));
    server.stdout.on('data', chunk => {
      startup += chunk;
      if (startup.includes('ready to accept connections') || startup.includes('Ready to accept connections')) resolve();
    });
  })).catch(error => { server.kill(); rmSync(dir, { recursive: true, force: true }); throw error; });
  const client = createClient({ socket: { host: '127.0.0.1', port, reconnectStrategy: false } });
  client.on('error', () => {});
  try {
    await client.connect();
    await t.test('revocation between GET and lastSeen SET cannot resurrect a token', async () => {
      const load = loadFixture(new Proxy(client, {
        get(target, property) {
          if (property === 'get') return async key => {
            const value = await target.get(key);
            if (key.startsWith('tok:') && value) await target.del(key);
            return value;
          };
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }));
      const auth = load('lib/auth.ts');
      const row = await auth.storeToken('dm_local_race', 't_race');
      const verified = await auth.verifyToken('dm_local_race');
      assert.equal(await client.exists(`tok:${row.tokenHash}`), 0, 'revoked token was resurrected');
      assert.equal(verified, null);
    });
    await t.test('inbound expiry denial fails the write without leaving an immortal queue', async () => {
      await client.sendCommand(['ACL', 'SETUSER', 'queue_writer', 'on', 'nopass', '~inbound:*', '+@all', '-expire']);
      const restricted = createClient({ username: 'queue_writer', socket: { host: '127.0.0.1', port, reconnectStrategy: false } });
      restricted.on('error', () => {});
      await restricted.connect();
      try {
        const store = loadFixture(restricted)('lib/store.ts');
        let failure;
        try { await store.publishInbound('t_expiry_failure', { type: 'TEST' }); }
        catch (error) { failure = error; }
        const ttl = await client.ttl('inbound:t_expiry_failure');
        assert.equal(ttl, -2, `failed publication left a queue with TTL ${ttl}`);
        assert.ok(failure, 'expiry denial must reject publication');
      } finally { await restricted.quit(); }
    });
    await t.test('successful inbound enqueue has the existing 60 second expiry', async () => {
      const store = loadFixture(client)('lib/store.ts');
      await store.publishInbound('t_expiry_success', { type: 'TEST' });
      assert.equal(await client.lLen('inbound:t_expiry_success'), 1);
      const ttl = await client.ttl('inbound:t_expiry_success');
      assert.ok(ttl > 0 && ttl <= 60);
    });
    await t.test('an already open SSE closes after revocation and does not forward later messages', async () => {
      const load = loadFixture(client);
      const auth = load('lib/auth.ts');
      const store = load('lib/store.ts');
      await auth.storeToken('dm_local_stream', 't_stream');
      const abort = new AbortController();
      const response = await load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
        headers: { authorization: 'Bearer dm_local_stream' }, signal: abort.signal,
      }));
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      try {
        assert.match(new TextDecoder().decode((await bounded(reader.read())).value), /event: hello/);
        assert.match(new TextDecoder().decode((await bounded(reader.read())).value), /AGENT_PRESENCE/);
        await store.publishInbound('t_stream', { type: 'BEFORE_REVOKE' });
        assert.match(new TextDecoder().decode((await bounded(reader.read())).value), /BEFORE_REVOKE/);
        await auth.revokeToken('dm_local_stream');
        await store.publishInbound('t_stream', { type: 'AFTER_REVOKE' });
        const next = await bounded(reader.read());
        assert.equal(next.done, true, new TextDecoder().decode(next.value));
        assert.equal(await client.lLen('inbound:t_stream'), 1);
      } finally { abort.abort(); await reader.cancel(); }
    });
    await t.test('revocation after LPOP prevents forwarding its already-drained batch', async () => {
      let revokeAfterPop = false;
      let row;
      const load = loadFixture(new Proxy(client, {
        get(target, property) {
          if (property === 'sendCommand') return async args => {
            const value = await target.sendCommand(args);
            if (revokeAfterPop && args[0] === 'LPOP' && value) {
              await target.del(`tok:${row.tokenHash}`);
            }
            return value;
          };
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }));
      const auth = load('lib/auth.ts');
      const store = load('lib/store.ts');
      row = await auth.storeToken('dm_local_batch', 't_batch');
      const abort = new AbortController();
      const response = await load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
        headers: { authorization: 'Bearer dm_local_batch' }, signal: abort.signal,
      }));
      const reader = response.body.getReader();
      try {
        await bounded(reader.read());
        await bounded(reader.read());
        revokeAfterPop = true;
        await store.publishInbound('t_batch', { type: 'DRAINED_BEFORE_REVOKE' });
        assert.equal((await bounded(reader.read())).done, true);
      } finally { abort.abort(); await reader.cancel(); }
    });
    await t.test('a failed ongoing authorization lookup closes the stream', async () => {
      let failAuthorization = false;
      const load = loadFixture(new Proxy(client, {
        get(target, property) {
          if (property === 'exists') return async key => {
            if (failAuthorization && key.startsWith('tok:')) throw new Error('injected connection loss');
            return target.exists(key);
          };
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }));
      await load('lib/auth.ts').storeToken('dm_local_failure', 't_failure');
      const abort = new AbortController();
      const response = await load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
        headers: { authorization: 'Bearer dm_local_failure' }, signal: abort.signal,
      }));
      const reader = response.body.getReader();
      try {
        await bounded(reader.read());
        await bounded(reader.read());
        failAuthorization = true;
        assert.equal((await bounded(reader.read())).done, true);
      } finally { abort.abort(); await reader.cancel(); }
    });
    for (const mode of ['cancel', 'abort', 'heartbeat', 'presence']) {
      await t.test(`${mode} closes cleanly and clears both stream timers`, async () => {
        const intervals = new Map();
        const timers = {
          setInterval(fn, ms) { const id = { unref() {} }; intervals.set(id, { fn, ms }); return id; },
          clearInterval(id) { intervals.delete(id); },
        };
        let reads = 0;
        const load = loadFixture(new Proxy(client, {
          get(target, property) {
            const value = target[property];
            if (['exists', 'get', 'sendCommand'].includes(property)) return (...args) => {
              reads++;
              return value.apply(target, args);
            };
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }), timers);
        const token = `dm_local_${mode}`;
        const tenant = `t_timer_${mode}`;
        const auth = load('lib/auth.ts');
        await auth.storeToken(token, tenant);
        const abort = new AbortController();
        const request = new Request('http://relay.test/api/extension/stream', {
          headers: { authorization: `Bearer ${token}` }, signal: abort.signal,
        });
        let listeners = 0;
        const add = request.signal.addEventListener.bind(request.signal);
        const remove = request.signal.removeEventListener.bind(request.signal);
        request.signal.addEventListener = (...args) => { if (args[0] === 'abort') listeners++; return add(...args); };
        request.signal.removeEventListener = (...args) => { if (args[0] === 'abort') listeners--; return remove(...args); };
        const response = await load('api/extension/stream.ts').GET(request);
        const reader = response.body.getReader();
        try {
          await bounded(reader.read());
          await bounded(reader.read());
          await new Promise(resolve => setTimeout(resolve, 20));
          assert.equal(intervals.size, 2);
          if (mode === 'cancel') await bounded(reader.cancel());
          else if (mode === 'abort') abort.abort();
          else {
            if (mode === 'presence') await client.set(`presence:${tenant}`, '1', { EX: 60 });
            await auth.revokeToken(token);
            const tick = [...intervals.values()].find(timer => timer.ms === (mode === 'heartbeat' ? 25000 : 30000));
            await bounded(tick.fn());
          }
          assert.equal((await bounded(reader.read())).done, true);
          await new Promise(resolve => setTimeout(resolve, 300));
          assert.equal(intervals.size, 0);
          assert.equal(listeners, 0);
          const settledReads = reads;
          await new Promise(resolve => setTimeout(resolve, 300));
          assert.equal(reads, settledReads, 'Redis polling continues after stream closure');
        } finally { abort.abort(); await reader.cancel(); }
      });
    }
    await t.test('idle revoked SSE closes without requiring another inbound message', async () => {
      const load = loadFixture(client);
      const auth = load('lib/auth.ts');
      await auth.storeToken('dm_local_idle', 't_idle');
      const abort = new AbortController();
      const response = await load('api/extension/stream.ts').GET(new Request('http://relay.test/api/extension/stream', {
        headers: { authorization: 'Bearer dm_local_idle' }, signal: abort.signal,
      }));
      const reader = response.body.getReader();
      try {
        await bounded(reader.read());
        await bounded(reader.read());
        await auth.revokeToken('dm_local_idle');
        assert.equal((await bounded(reader.read())).done, true);
      } finally { abort.abort(); await reader.cancel(); }
    });
  } finally {
    if (client.isOpen) await client.quit();
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
