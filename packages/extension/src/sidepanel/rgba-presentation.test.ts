import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const body = source.match(/function formatColorForDisplay\(value: string\): string \{([\s\S]*?)\n\}/)?.[1];
assert.ok(body);
for (const [value, rgb, opacity, expected] of [
  ['rgb(18, 52, 86)', [18, 52, 86], 1, 'rgba(18, 52, 86, 1)'],
  ['#123456', [18, 52, 86], 1, 'rgba(18, 52, 86, 1)'],
  ['rgba(18, 52, 86, 0.5)', [18, 52, 86], 0.5, 'rgba(18, 52, 86, 0.5)'],
  ['var(--unknown)', null, 1, 'var(--unknown)'],
] as const) {
  test(`RGBA presentation normalizes ${value} without changing alpha`, () => {
    const actual = runInNewContext(`(function(value){${body}})(value)`, {
      value, colorFormat: 'rgba', resolveCssVarToColor: () => null,
      parseColorRgb: () => rgb, splitColorOpacity: () => ({ opacity }),
    });
    assert.equal(actual, expected);
  });
}
