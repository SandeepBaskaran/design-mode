import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import type { TextChange } from './change-tracker';

const code = transformSync(readFileSync(new URL('./enhanced-export.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;

function prompt(changes: TextChange[]): string {
  const dependencies: Record<string, unknown> = {
    './helpers': { getElementById: () => null },
    './change-tracker': {
      getStyleChanges: () => [], getTextChanges: () => changes, getDomChanges: () => [],
    },
    './source-detection': {},
    './root-var-store': { getTokenEdits: () => [] },
    './token-engine': { getTokenIndex: () => ({ tokens: [] }) },
  };
  const module = { exports: {} as { exportMarkdown: () => string } };
  runInNewContext(code, {
    module,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    document: { title: 'Link fixture' },
    window: { location: { href: 'https://example.test/active' } },
  });
  return module.exports.exportMarkdown();
}

function change(overrides: Partial<TextChange> = {}): TextChange {
  return {
    id: 'link-edit', elementId: 'link', selector: 'a.link', timestamp: 1,
    oldText: '/before', newText: '/after', attributeName: 'href', ...overrides,
  };
}

test('active-route prompt labels href edits as attributes, retaining exact before and after values', () => {
  for (const [oldText, newText] of [
    ['/before', '/after'],
    ['', '/added'],
    ['/removed', ''],
    [' /before?q="quoted" ', ' /after?q="quoted" '],
  ]) {
    const result = prompt([change({ oldText, newText, breakpoint: 'mobile', viewportWidth: 390 })]);
    assert.ok(result.includes(`- a.link href: ${JSON.stringify(oldText)} → ${JSON.stringify(newText)} _(mobile · 390px)_`));
    assert.ok(!result.includes('a.link text'));
    assert.ok(!result.includes('Text edits use git word-diff'));
  }
});

test('mixed attribute and text edits preserve chronology, text word-diff and rewrite formatting', () => {
  const result = prompt([
    change({ timestamp: 3 }),
    change({ id: 'text-diff', attributeName: undefined, oldText: 'Read the old guide', newText: 'Read the new guide', timestamp: 1 }),
    change({ id: 'text-rewrite', attributeName: undefined, oldText: 'Before', newText: 'After', timestamp: 2 }),
  ]);
  assert.ok(result.includes('- a.link text: Read the [-old-]{+new+} guide'));
  assert.ok(result.includes('- a.link text → "After"'));
  assert.ok(result.includes('Text edits use git word-diff'));
  assert.ok(result.indexOf('a.link text:') < result.indexOf('a.link text →'));
  assert.ok(result.indexOf('a.link text →') < result.indexOf('a.link href:'));
});
