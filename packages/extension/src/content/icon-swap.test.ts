import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findLucideGlyph, lucideIconClass, swapLucideClasses } from './icon-swap.ts';

describe('lucideIconClass', () => {
  it('prefixes a bare name', () => {
    assert.equal(lucideIconClass('search'), 'lucide-search');
  });
  it('keeps an existing lucide- class', () => {
    assert.equal(lucideIconClass('lucide-x'), 'lucide-x');
  });
  it('returns empty for blank input', () => {
    assert.equal(lucideIconClass('  '), '');
  });
});

describe('swapLucideClasses', () => {
  it('replaces the lucide-* name and keeps lucide', () => {
    assert.equal(swapLucideClasses('lucide lucide-search w-4', 'x'), 'lucide w-4 lucide-x');
  });
  it('does not duplicate lucide', () => {
    assert.equal(swapLucideClasses('lucide lucide-x', 'lucide-x'), 'lucide lucide-x');
  });
});

describe('findLucideGlyph', () => {
  const glyphs = [
    { classNames: ['lucide', 'lucide-search'], innerHTML: '<path d="s"/>', viewBox: '0 0 24 24' },
    { classNames: ['lucide', 'lucide-x'], innerHTML: '<path d="x"/>', viewBox: '0 0 24 24' },
  ];
  it('finds a glyph by class or bare name', () => {
    assert.equal(findLucideGlyph(glyphs, 'x')?.innerHTML, '<path d="x"/>');
    assert.equal(findLucideGlyph(glyphs, 'lucide-search')?.innerHTML, '<path d="s"/>');
  });
  it('returns undefined when the icon is not on the page', () => {
    assert.equal(findLucideGlyph(glyphs, 'heart'), undefined);
  });
});
