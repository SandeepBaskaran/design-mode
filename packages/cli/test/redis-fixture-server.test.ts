import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createRedisFixtureServer } from './redis-fixture-server.mjs';

async function fixture(t, route = {}, getFault = () => '') {
  const activeStreams = new Set();
  const server = createRedisFixtureServer({ mcp: route, stream: route, inbox: route, activeStreams, getFault });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  return { base: `http://127.0.0.1:${server.address().port}`, activeStreams };
}

test('malformed JSON returns a generic error without reflecting request content', async t => {
  const { base } = await fixture(t);
  const response = await fetch(`${base}/api/mcp`, { method: 'POST', body: 'private-fixture-marker' });
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'Internal server error');
});

test('route exceptions do not expose exception messages or filesystem paths', async t => {
  const { base } = await fixture(t, { POST() { throw new Error('fixture-secret at /private/test/config.json'); } });
  const response = await fetch(`${base}/api/mcp`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'Internal server error');
});

test('successful routing, fixture HTML and unknown-route responses are preserved', async t => {
  const { base } = await fixture(t, { async POST(request) { return Response.json(await request.json(), { status: 201 }); } });
  for (const path of ['/api/mcp', '/api/extension/inbox']) {
    const response = await fetch(base + path, { method: 'POST', body: '{"ok":true}' });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
  }
  const page = await fetch(base + '/fixture');
  assert.equal(page.headers.get('content-type'), 'text/html');
  assert.match(await page.text(), /Synthetic release fixture/);
  assert.equal((await fetch(base + '/missing')).status, 404);
});

test('errors after streaming headers terminate the response without diagnostic disclosure', async t => {
  const { base, activeStreams } = await fixture(t, {
    GET() {
      return new Response(new ReadableStream({
        pull() { throw new Error('private-stream-marker'); },
      }), { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  await assert.rejects(async () => {
    const response = await fetch(base + '/api/extension/stream');
    await response.text();
  });
  assert.equal(activeStreams.size, 0);
  assert.equal((await fetch(base + '/fixture')).status, 200);
});

test('disconnect and timeout fault injection remain effective', async t => {
  let fault = 'disconnect';
  const { base } = await fixture(t, { POST() { return Response.json({ ok: true }); } }, () => fault);
  await assert.rejects(fetch(base + '/api/mcp', { method: 'POST', body: '{"method":"tools/call"}' }));
  fault = 'timeout';
  await assert.rejects(fetch(base + '/api/mcp', { method: 'POST', body: '{"method":"tools/call"}', signal: AbortSignal.timeout(100) }));
  fault = '';
  assert.equal((await fetch(base + '/api/mcp', { method: 'POST', body: '{"method":"tools/call"}' })).status, 200);
});
