import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonc } from '../src/jsonc.ts';
import { mergeMcpConfig } from '../src/setup.ts';

test('JSONC accepts BOM, comments and trailing commas without changing strings', () => {
  const text = '\uFEFF{\n// comment\n"url":"https://example.test/a,}",/* block */"values":[1,2,],"quoted":"\\\"//literal",}';
  assert.deepEqual(parseJsonc(text), { url: 'https://example.test/a,}', values: [1, 2], quoted: '"//literal' });
});

test('JSONC rejects broken objects, unterminated comments and array holes', () => {
  for (const text of ['{,}', '[,]', '[1,,]', '{"a":,}', '{"a":1/*', '{"a":1 "b":2}', '{/* "a":1}']) {
    assert.throws(() => parseJsonc(text));
  }
});

test('forced setup preserves environment and server options, removes incompatible HTTP transport', () => {
  const current = { mcpServers: { 'design-mode': { command: 'old', args: [], type: 'http', url: 'https://example.test', headers: {}, env: { MODE: 'dev' }, disabled: false }, other: { command: 'other' } } };
  const entry = { command: '/node', args: ['/cli.js'] };
  assert.equal(mergeMcpConfig(current, entry, false).action, 'collision');
  const merged = mergeMcpConfig(current, entry, true);
  assert.deepEqual(merged.next, { mcpServers: { 'design-mode': { ...entry, env: { MODE: 'dev' }, disabled: false }, other: { command: 'other' } } });
  assert.equal(mergeMcpConfig(merged.next, entry, false).action, 'unchanged');
  assert.equal(current.mcpServers['design-mode'].command, 'old');
});

test('malformed MCP sections are not silently discarded', () => {
  for (const value of [null, false, 0, '', []]) {
    assert.equal(mergeMcpConfig({ mcpServers: value }, { command: '/node' }, true).action, 'collision');
  }
});
