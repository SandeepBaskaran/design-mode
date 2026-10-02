import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const expression = source.match(/function renderActionRow\(\): string \{\s*const dis = ([^;]+);/)?.[1];
assert.ok(expression);
for (const [tagName, expected] of [[null, true], ['BODY', true], ['HTML', true], ['button', false], ['h1', false]] as const) {
  test(`action row selection gate: ${tagName}`, () => {
    const disabled = runInNewContext(expression, {
      info: tagName ? { tagName } : null,
      classifyTag: (tag: string) => ['body', 'html'].includes(tag) ? 'page' : 'text',
    });
    assert.equal(disabled, expected);
  });
}
