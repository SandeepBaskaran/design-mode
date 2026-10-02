import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeRichTextHref, normalizeRichTextHref } from '../rich-text-preservation.ts';

describe('rich-text link validation', () => {
  it('normalises absolute URLs and preserves supported relative destinations', () => {
    assert.equal(normalizeRichTextHref(' HTTPS://Example.com/a b '), 'https://example.com/a%20b');
    for (const value of ['/docs', './docs', '../docs', '#details', '/docs?q=a&b=c']) {
      assert.equal(normalizeRichTextHref(value), value);
      assert.equal(isSafeRichTextHref(value), true);
    }
  });

  it('distinguishes clearing a link from invalid input', () => {
    assert.equal(normalizeRichTextHref('   '), '');
    assert.equal(isSafeRichTextHref(''), false);
    assert.equal(normalizeRichTextHref('javascript:alert(1)'), null);
  });

  it('rejects active schemes, malformed URLs and browser-normalised bypasses', () => {
    for (const value of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,test',
      'vbscript:msgbox(1)', '//evil.example', '/\\evil.example',
      'https:\\evil.example', 'https://', 'https://[invalid',
      '/\t/evil.example', '/\n/evil.example', '\u0000https://example.com',
      'java\rscript:alert(1)', '<img src=x onerror=alert(1)>',
    ]) {
      assert.equal(normalizeRichTextHref(value), null, JSON.stringify(value));
      assert.equal(isSafeRichTextHref(value), false, JSON.stringify(value));
    }
  });

  it('does not decode encoded text into an executable scheme', () => {
    assert.equal(normalizeRichTextHref('javascript&#58;alert(1)'), null);
    assert.equal(normalizeRichTextHref('/%2fexample.com'), '/%2fexample.com');
    assert.equal(normalizeRichTextHref('#<img src=x>'), '#<img src=x>');
  });
});
