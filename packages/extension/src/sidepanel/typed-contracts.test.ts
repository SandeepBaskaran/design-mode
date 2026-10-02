import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { TIMING_FUNCTION_OPTIONS } from '@shared/constants';

const panelSource = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');

test('motion curve options render stored CSS values and readable labels', () => {
  const start = panelSource.indexOf('  const curve = ');
  const end = panelSource.indexOf('\n\n', start);
  assert.ok(start >= 0 && end > start);
  const compiled = transformSync(panelSource.slice(start, end) + '\ncurve;', { loader: 'ts' }).code;
  const html = runInNewContext(compiled, {
    TIMING_FUNCTION_OPTIONS, dur: '0.3s', timing: 'ease-in', escapeAttr: (value: string) => value,
  });
  assert.match(html, /<option value="ease-in" selected>Ease In<\/option>/);
  assert.match(html, /<option value="linear">Linear<\/option>/);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test('stored MCP modes only admit supported transport modes', () => {
  const start = panelSource.indexOf('  const savedMcpMode = ');
  const end = panelSource.indexOf('\n  if (typeof result?', start);
  assert.ok(start >= 0 && end > start);
  const compiled = transformSync(panelSource.slice(start, end) + '\nmcpMode;', { loader: 'ts' }).code;
  for (const value of ['local', 'cloud', 'self-hosted', 'invalid', '', undefined, 42]) {
    const mode = runInNewContext(compiled, { result: { 'dm-mcp-mode': value }, mcpMode: 'cloud' });
    assert.equal(mode, value === 'local' || value === 'self-hosted' ? value : 'cloud');
  }
});
