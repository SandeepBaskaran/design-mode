import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');

test('Motion detects named animations when scroll timelines suppress shorthand serialization', () => {
  const declaration = source.slice(source.indexOf('  const hasAnimation ='), source.indexOf('  const transformIsSet ='));
  for (const [styles, expected] of [
    [{ animation: '', animationName: 'fade' }, true],
    [{ animation: '', animationName: 'none, fade' }, true],
    [{ animation: '', animationName: 'none' }, false],
    [{ animation: 'fade 10s linear', animationName: 'fade' }, true],
    [{ animation: 'none' }, false],
  ] as const) {
    assert.equal(runInNewContext(declaration + ';hasAnimation', { s: styles }), expected);
  }
});

test('z-index commit rejects invalid drafts before applyStyle, including token-like garbage', () => {
  const start = source.indexOf('      const prop = propInput.dataset.dmProp!;', source.indexOf('// Text input change'));
  const end = source.indexOf('      // Non-negative numeric guard', start);
  const js = ts.transpile('(function(){' + source.slice(start, end) + ';applyStyle(prop, val);})()', { target: ts.ScriptTarget.ES2022 });
  for (const [raw, valid] of [['10', true], ['-2', true], ['auto', true], ['', true], ['10.5', false], ['letters', false], ['var(--broken', false], ['var(--z)', true]] as const) {
    const writes: unknown[] = [];
    const attrs: Record<string, string> = {};
    runInNewContext(js, {
      propInput: { dataset: { dmProp: 'zIndex', dmNumeric: '1', dmUnit: '' }, value: raw, setAttribute: (k: string, v: string) => { attrs[k] = v; } },
      CSS: { supports: (p: string, v: string) => { assert.equal(p, 'z-index'); assert.equal(v, raw); return valid; } },
      applyStyle: (...args: unknown[]) => writes.push(args),
    });
    assert.equal(writes.length, valid ? 1 : 0, raw);
    assert.equal(attrs['aria-invalid'], String(!valid), raw);
  }
});

test('z-index arrow stepping does not truncate invalid drafts or expressions', () => {
  const start = source.indexOf("      if (isNumeric && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))");
  const end = source.indexOf('      // Strict numeric filter', start);
  const js = ts.transpile('(function(){' + source.slice(start, end) + '})()', { target: ts.ScriptTarget.ES2022 });
  for (const [raw, expected] of [['10', '11'], ['-2', '-1'], ['auto', '1'], ['10.5', null], ['letters', null], ['var(--z)', null]] as const) {
    const writes: unknown[][] = [];
    runInNewContext(js, { isNumeric: true, propName: 'zIndex', propInput: {value: raw}, unit: '', nudgeAmount: 10, fillOpacityMatch: null,
      e: {key: 'ArrowUp', shiftKey: false, preventDefault() {}}, isNonNegativeNumericProp: () => false,
      applyStyle: (...args: unknown[]) => writes.push(args) });
    assert.deepEqual(writes, expected === null ? [] : [['zIndex', expected]]);
  }
});
