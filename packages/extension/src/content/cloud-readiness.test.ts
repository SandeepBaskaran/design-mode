import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { parseSseFrame, planReconnect } from './cloud-stream.ts';

const source = readFileSync(new URL('./change-tracker.ts', import.meta.url), 'utf8');
const region = (start: string, end: string) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing production region: ${start}`);
  return source.slice(a, b);
};
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function harness(fetch: typeof globalThis.fetch) {
  let time = 1000;
  let next = 0;
  const timers = new Map<number, { fn: () => void; delay: number }>();
  const updates: boolean[] = [];
  const context = vm.createContext({
    fetch, AbortController, TextDecoder, console: { debug() {}, warn() {} }, parseSseFrame, planReconnect,
    Date: { now: () => time },
    setTimeout: (fn: () => void, delay: number) => { timers.set(++next, { fn, delay }); return next; },
    clearTimeout: (id: number) => timers.delete(id),
    browser: { runtime: { id: 'fixture', sendMessage: (m: { connected: boolean }) => { updates.push(m.connected); return Promise.resolve(); } } },
  });
  const extra = region('function setCloudStreamConnected(', 'async function runCloudStream(');
  const script = `let transportMode = 'cloud', cloudToken = 'fixture-token', cloudBaseUrl = 'https://relay.invalid', sseAbort = new AbortController(), cloudStreamConnected = false, cloudLastActivityAt = 0, agentConnected = false;
    ${region('function setAgentConnected(', '// Lets content/index.ts')}
    function dispatchIncoming(msg) { if (msg.type === 'AGENT_PRESENCE') setAgentConnected(!!msg.payload?.connected); }
    ${extra}
    ${region('async function runCloudStream(', '// Send a message to whichever transport')}
    ${region('export function isConnected()', '// Handle a screenshot request')}
    globalThis.api = { runCloudStream, isConnected, agent: () => agentConnected, stop: () => sseAbort?.abort() };`;
  vm.runInContext(transpileModule(script.replace(/\bexport /g, ''), { compilerOptions: { module: ModuleKind.None, target: ScriptTarget.ES2022 } }).outputText, context);
  const api = context.api as { runCloudStream(): Promise<void>; isConnected(): boolean; agent(): boolean; stop(): void };
  return { api, updates, advance: (ms: number) => { time += ms; }, fire: (delay: number) => { const match = [...timers].find(([,t]) => t.delay === delay); assert.ok(match, `No timer for ${delay}ms`); timers.delete(match[0]); match[1].fn(); }, stop: async () => { api.stop(); for (const [id,t] of [...timers]) { timers.delete(id); t.fn(); } await flush(); } };
}
function channel() {
  let output!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { output = controller; } });
  return { response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }), send: (frame: string) => output.enqueue(new TextEncoder().encode(frame)), end: () => output.close() };
}

test('token and a non-aborted worker do not prove relay readiness', () => {
  const h = harness(async () => { throw Error('unused'); });
  assert.equal(h.api.isConnected(), false);
});

test('refused endpoint, 401 and non-SSE response remain disconnected', async () => {
  for (const fetch of [async () => { throw Error('ECONNREFUSED'); }, async () => new Response(null, { status: 401 }), async () => new Response('<html>proxy</html>')]) {
    const h = harness(fetch); const task = h.api.runCloudStream(); await flush();
    assert.equal(h.api.isConnected(), false); assert.equal(h.api.agent(), false);
    await h.stop(); await task;
  }
});

test('SSE needs hello; relay-only readiness is not agent readiness; an unexpected close clears both', async () => {
  const c = channel(); const h = harness(async () => c.response); const task = h.api.runCloudStream(); await flush();
  assert.equal(h.api.isConnected(), false);
  c.send('event: hello\ndata: {"version":"3.1.0"}\n\n'); await flush();
  assert.equal(h.api.isConnected(), true); assert.equal(h.api.agent(), false);
  c.send('event: relay\ndata: {"type":"AGENT_PRESENCE","payload":{"connected":true}}\n\n'); await flush();
  assert.equal(h.api.agent(), true);
  c.end(); await flush();
  assert.equal(h.api.isConnected(), false); assert.equal(h.api.agent(), false);
  await h.stop(); await task;
});

test('a late response from an aborted worker cannot mark a replacement connection ready', async () => {
  let resolve!: (response: Response) => void;
  const h = harness(() => new Promise<Response>(done => { resolve = done; }));
  const task = h.api.runCloudStream(); h.api.stop();
  const c = channel(); c.send('event: hello\ndata: {"version":"3.1.0"}\n\n'); c.end(); resolve(c.response);
  await task; assert.equal(h.api.isConnected(), false); assert.equal(h.api.agent(), false);
});


test('malformed hello and presence without a handshake cannot enable Send', async () => {
  const c = channel(); const h = harness(async () => c.response); const task = h.api.runCloudStream(); await flush();
  c.send('event: hello\ndata: not-json\n\nevent: relay\ndata: {"type":"AGENT_PRESENCE","payload":{"connected":true}}\n\n'); await flush();
  assert.equal(h.api.isConnected(), false); assert.equal(h.api.agent(), false);
  c.end(); await h.stop(); await task;
});

test('silence expires readiness even before a delayed watchdog callback; heartbeat bytes renew it', async () => {
  const c = channel(); const h = harness(async () => c.response); const task = h.api.runCloudStream(); await flush();
  c.send('event: hello\ndata: {"version":"3.1.0"}\n\n'); await flush();
  h.advance(50_000); c.send(': ping\n\n'); await flush();
  h.advance(20_000); assert.equal(h.api.isConnected(), true);
  h.advance(40_000); assert.equal(h.api.isConnected(), false);
  h.fire(60_000); assert.equal(h.api.agent(), false);
  c.end(); await h.stop(); await task;
});

test('healthy routine rollover keeps readiness only for a bounded new-handshake grace; stream retries are GET only', async () => {
  const c = channel(); const methods: unknown[] = []; let calls = 0;
  const h = harness(async (_url, init) => {
    methods.push(init?.method);
    if (++calls === 1) return c.response;
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(Error('aborted'))));
  });
  const task = h.api.runCloudStream(); await flush();
  c.send('event: hello\ndata: {"version":"3.1.0"}\n\nevent: relay\ndata: {"type":"AGENT_PRESENCE","payload":{"connected":true}}\n\n'); await flush();
  h.advance(10_000); c.send('event: reconnect\ndata: {"reason":"max_duration"}\n\n'); c.end(); await flush();
  assert.equal(calls, 2); assert.equal(h.api.isConnected(), true);
  h.fire(5_000); await flush();
  assert.equal(h.api.isConnected(), false); assert.equal(h.api.agent(), false);
  assert.deepEqual(methods, ['GET', 'GET']);
  await h.stop(); await task;
});
