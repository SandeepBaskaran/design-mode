import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
const source = readFileSync(new URL('../src/content/index.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/sidepanel/sidepanel.ts', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('async function openConfiguredTransport('), source.indexOf('\nfunction enable()'));
async function run(saved, automatic, fails = false) {
  const calls = [];
  const js = (await transform(body, { loader: 'ts' })).code;
  const fn = new Function('browser', 'on', 'dmIsActiveInstance', 'connectToServer', 'disconnectFromServer', 'DEFAULT_WS_PORT', js + ';return openConfiguredTransport');
  await fn({ storage: { local: { get: async () => { if (fails) throw Error('storage'); return saved; } } } }, true, () => true, x => calls.push(x), () => {}, 9960)(() => true, automatic);
  return calls;
}
test('startup/reopen never dials when saved auto-connect is false', async () => {
  assert.deepEqual(await run({ 'dm-mcp-mode': 'local', 'dm-mcp-auto-connect': false }, true), []);
});
test('explicit mode-change/manual connect remains available with auto-connect false', async () => {
  assert.deepEqual(await run({ 'dm-mcp-mode': 'local', 'dm-mcp-auto-connect': false }, false), [{ mode: 'local', port: 9960 }]);
});
test('default auto-connect retains local startup', async () => {
  assert.equal((await run({ 'dm-mcp-mode': 'local' }, true)).length, 1);
});
test('unreadable settings fail closed rather than overriding consent', async () => {
  assert.deepEqual(await run({}, true, true), []);
});
test('unchanged offline refresh has no toast branch', () => {
  const handler = panel.slice(panel.indexOf("case 'refresh-mcp':"), panel.indexOf("case 'refresh-mcp':") + 1200);
  assert.ok(!handler.includes("else if (mcpState === 'offline')"));
});
