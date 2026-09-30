import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createRedisFixtureServer } from './redis-fixture-server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(process.env.DM_EVIDENCE_OUT || resolve(root, 'docs/certification/cli-release'));
mkdirSync(out, { recursive: true });
const scratch = mkdtempSync(resolve(root, 'packages/cli/.test-artifacts/redis-browser-'));
const rows = [];
const token = 'dm_synthetic_redis_browser_release_fixture';
const nodes = (process.env.DM_TEST_NODES || process.execPath).split(',');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) { for (let n = 0; n < 100; n++) { if (await fn()) return; await wait(100); } throw new Error('Readiness deadline'); }
async function freePort() { const s = createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
const record = (name, detail = {}) => { rows.push({ name, ...detail, pass: true }); console.log('PASS', name); };
let redisProcess, redis, server, context, owner;
const activeStreams = new Set();
let fault = '';
try {
  const redisPort = await freePort();
  const redisBin = resolve(process.env.DM_REDIS_SERVER || '.release-local/redis-7.2.7/src/redis-server');
  redisProcess = spawn(redisBin, ['--bind', '127.0.0.1', '--port', String(redisPort), '--save', '', '--appendonly', 'no', '--dir', scratch], { stdio: ['ignore', 'pipe', 'pipe'] });
  await until(async () => { try { return execFileSync(redisBin.replace(/redis-server$/, 'redis-cli'), ['-p', String(redisPort), 'PING'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'PONG'; } catch { return false; } });
  process.env.REDIS_URL = `redis://127.0.0.1:${redisPort}`;
  const { kv } = await import('../../mcp-cloud/lib/kv.ts'); redis = await kv();
  const auth = await import('../../mcp-cloud/lib/auth.ts'); await auth.storeToken(token, 't_release_fixture');
  const mcp = await import('../../mcp-cloud/api/mcp.ts');
  const stream = await import('../../mcp-cloud/api/extension/stream.ts');
  const inbox = await import('../../mcp-cloud/api/extension/inbox.ts');
  record('real Redis ready', { version: execFileSync(redisBin, ['--version'], { encoding: 'utf8' }).trim() });
  server = createRedisFixtureServer({ mcp, stream, inbox, activeStreams, getFault: () => fault });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], { cwd: resolve(root, 'packages/cli'), encoding: 'utf8' }));
  execFileSync('tar', ['-xzf', resolve(scratch, pack.filename), '-C', scratch]);
  const entry = resolve(scratch, 'package/dist/cli.cjs');
  record('exact private scoped tarball', { name: pack.name, sha256: createHash('sha256').update(readFileSync(resolve(scratch, pack.filename))).digest('hex') });
  const guard = resolve(scratch, 'guard.cjs');
  writeFileSync(guard, `const original = globalThis.fetch; globalThis.fetch = (url, init) => { const u = String(url); if(u === 'https://mcp.designmode.app/api/mcp') return original('${base}/api/mcp', init); if(!u.startsWith('${base}/') && !/^http:\\/\\/127\\.0\\.0\\.1:\\d+\\//.test(u)) throw new Error('External network forbidden'); return original(url, init); };`);
  const { claimOrAttach, probeOwnerHealth } = await import('../../mcp-local/src/owner-bridge.ts');
  const localPort = await freePort(); owner = await claimOrAttach(localPort);
  async function cli(node, mode, args, input = '', extra = {}) {
    const env = { PATH: process.env.PATH, HOME: scratch, NODE_OPTIONS: `--require=${guard}`, DM_MODE: mode, DM_PORT: String(localPort), ...(mode === 'cloud' ? { DM_CLOUD_TOKEN: token } : mode === 'self-hosted' ? { DM_SELF_HOSTED_TOKEN: token, DM_ENDPOINT: base + '/api/mcp' } : {}), ...extra };
    const p = spawn(node, [entry, ...args], { cwd: scratch, env, stdio: 'pipe' });
    let stdout = '', stderr = ''; p.stdout.on('data', c => stdout += c); p.stderr.on('data', c => stderr += c); p.stdin.on('error', () => {}); p.stdin.end(input);
    const [code] = await once(p, 'close'); assert.ok(!stdout.includes(token) && !stderr.includes(token));
    return { code, body: JSON.parse(stdout), stderr };
  }
  const dist = resolve(root, 'packages/extension/dist');
  context = await chromium.launchPersistentContext(resolve(scratch, 'chrome-profile'), { headless: true, executablePath: process.env.CHROME_BINARY, args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=localhost;127.0.0.1'] });
  await context.route('**/*', r => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) || u.protocol === 'chrome-extension:' ? r.continue() : r.abort(); });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await sw.evaluate(({ token, base, localPort }) => chrome.storage.local.set({ 'dm-mcp-mode': 'self-hosted', 'dm-mcp-cloud-token': token, 'dm-mcp-cloud-url': base, 'dm-mcp-port': localPort, 'dm-mcp-auto-connect': true }), { token, base, localPort });
  await page.goto(base + '/fixture');
  const tabId = await sw.evaluate(async base => (await chrome.tabs.query({})).find(t => t.url?.startsWith(base + '/fixture')).id, base);
  const panel = await context.newPage(); await panel.goto(sw.url().replace('/background.js', '/sidepanel/index.html?tab=' + tabId));
  await until(() => activeStreams.size > 0);
  record('installed extension SSE authenticated', { browser: await page.evaluate(() => navigator.userAgent) });
  for (const mode of ['self-hosted', 'cloud', 'local']) {
    await sw.evaluate(async ({ mode, tabId }) => { await chrome.storage.local.set({ 'dm-mcp-mode': mode }); await chrome.tabs.sendMessage(tabId, { type: 'RECONFIGURE_TRANSPORT' }); }, { mode, tabId });
    await wait(1200);
    if (mode !== 'local') assert.equal(activeStreams.size, 1, 'mode changes must not duplicate SSE workers');
    for (const node of nodes) {
      const version = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim();
      const list = await cli(node, mode, ['tools']); assert.equal(list.code, 0); assert.equal(list.body.tools.length, mode === 'local' ? 9 : 8);
      const summary = await cli(node, mode, ['call', 'get_session_summary']); assert.equal(summary.code, 0, JSON.stringify(summary));
      assert.equal(JSON.parse(summary.body.result.content[0].text).extensionConnected, true);
      await page.locator('#heading').click(); await wait(200);
      const elementId = await page.locator('#heading').getAttribute('data-dm-id'); assert.ok(elementId);
      const apply = await cli(node, mode, ['call', 'apply_changes', '--stdin'], JSON.stringify({ changes: [{ elementId, styles: { color: 'rgb(123, 45, 67)' } }] })); assert.equal(apply.code, 0, JSON.stringify(apply));
      await until(async () => await page.locator('#heading').evaluate(el => getComputedStyle(el).color) === 'rgb(123, 45, 67)');
      const changes = await cli(node, mode, ['call', 'get_changes']); assert.equal(changes.code, 0); assert.match(JSON.stringify(changes.body), /123, 45, 67/);
      const error = await cli(node, mode, ['call', 'get_screenshot', '--stdin'], '{"selector":"#does-not-exist"}');
      record('browser error observation', { mode, version, exit: error.code, isError: error.body.result?.isError ?? false });
      assert.equal(error.code, 1, 'browser-reported failure must exit nonzero');
      if (mode !== 'local') {
        const bad = await cli(node, mode, ['tools'], '', mode === 'cloud' ? { DM_CLOUD_TOKEN: 'dm_invalid_synthetic' } : { DM_SELF_HOSTED_TOKEN: 'dm_invalid_synthetic' }); assert.equal(bad.body.error.code, 'AUTH_FAILED');
        for (const f of ['disconnect', 'timeout']) { fault = f; const result = await cli(node, mode, ['call', 'get_session_summary'], '', { DM_TIMEOUT_MS: '500' }); assert.equal(result.code, 1); if (f === 'timeout') assert.equal(result.body.error.code, 'TIMEOUT'); fault = ''; }
        for (const stream of activeStreams) stream.destroy(); await until(() => activeStreams.size > 0);
        const recovered = await cli(node, mode, ['call', 'get_session_summary']); assert.equal(recovered.code, 0);
        record('remote auth rejection, disconnect, timeout and SSE recovery', { mode, version });
      } else {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Debugger.enable');
        await cdp.send('Debugger.pause');
        try {
          const stalled = await cli(node, mode, ['call', 'get_screenshot']);
          assert.equal(stalled.code, 1);
          assert.equal(stalled.body.result.isError, true);
          assert.match(JSON.stringify(stalled.body), /timed out/i);
          record('local paused-browser request timeout', { version });
        } finally { await cdp.send('Debugger.resume'); await cdp.detach(); }
      }
      record('packaged CLI browser request-response', { mode, version, domColor: await page.locator('#heading').evaluate(el => getComputedStyle(el).color) });
    }
  }
  await page.screenshot({ path: resolve(out, 'redis-browser.png') });
  await page.goto('about:blank');
  await until(async () => !(await probeOwnerHealth(localPort))?.extensionConnected);
  for (const node of nodes) {
    const offline = await cli(node, 'local', ['call', 'get_changes']);
    assert.equal(offline.code, 4);
    assert.equal(offline.body.error.code, 'EXTENSION_OFFLINE');
    record('local disconnected browser rejected', { version: execFileSync(node, ['--version'], { encoding: 'utf8' }).trim() });
  }
} catch (error) { rows.push({ pass: false, error: String(error), stack: error.stack }); console.error(error); process.exitCode = 1; }
finally {
  if (context) await context.close();
  if (owner) await owner.close();
  if (server) { for (const s of activeStreams) s.destroy(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
  if (redis) await redis.quit();
  if (redisProcess) { redisProcess.kill('SIGTERM'); await once(redisProcess, 'close'); }
  writeFileSync(resolve(out, 'redis-browser-results.json'), JSON.stringify(rows, null, 2));
  rmSync(scratch, { recursive: true, force: true });
}
