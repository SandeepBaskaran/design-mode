import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CodeQL js/xss-through-dom (#4): the rich-text editor is user-editable (paste, link URL
// field), so nothing read back from it may reach the page without being sanitised.
const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');

describe('rich-text editor output is sanitised before it reaches the page', () => {
  it('never passes raw editor.innerHTML to applyHtml', () => {
    const calls = [...source.matchAll(/applyHtml\([^;]*editor\.innerHTML[^;]*\)/g)].map(m => m[0]);
    assert.ok(calls.length >= 4, 'expected the four rich-text commit paths');
    for (const call of calls) assert.match(call, /sanitizeRichText(?:Editor)?Html\(editor\.innerHTML\)/, call);
  });

  it('writes link hrefs only from sanitizeRichTextHref output', () => {
    assert.doesNotMatch(source, /link\.setAttribute\('href', value\)/);
    assert.match(source, /link\.setAttribute\('href', safeHref\)/);
    assert.match(source, /const safeHref = value \? sanitizeRichTextHref\(value\) : ''/);
  });
});
