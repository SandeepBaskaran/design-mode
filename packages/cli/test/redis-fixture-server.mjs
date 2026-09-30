import { createServer } from 'node:http';

export function createRedisFixtureServer({ mcp, stream, inbox, activeStreams, getFault }) {
  const server = createServer(async (req, res) => {
    if (req.url === '/fixture') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Redis transport fixture</title><h1 id="heading">Synthetic release fixture</h1>'); return; }
    const ctrl = new AbortController(); res.on('close', () => ctrl.abort());
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks).toString();
      const rpc = body ? JSON.parse(body) : {};
      if (req.url === '/api/mcp' && rpc.method === 'tools/call' && getFault() === 'disconnect') { req.socket.destroy(); return; }
      if (req.url === '/api/mcp' && rpc.method === 'tools/call' && getFault() === 'timeout') return;
      const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, ...(body ? { body } : {}), signal: ctrl.signal });
      const route = req.url === '/api/mcp' ? mcp : req.url === '/api/extension/stream' ? stream : req.url === '/api/extension/inbox' ? inbox : null;
      if (!route) { res.writeHead(404); res.end(); return; }
      const response = await route[req.method](request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.flushHeaders();
      if (req.url === '/api/extension/stream') { activeStreams.add(res); res.on('close', () => activeStreams.delete(res)); }
      if (response.body) for await (const chunk of response.body) { if (res.destroyed) break; res.write(chunk); }
      res.end();
    } catch {
      if (!res.destroyed) {
        if (res.headersSent) res.destroy();
        else { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Internal server error'); }
      }
    }
  });
  return server;
}
