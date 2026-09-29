import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { commentSelector } from './helpers.ts';

interface FakeEl {
  tagName: string;
  className: string;
  id: string;
  parentElement: FakeEl | null;
  children: FakeEl[];
}

function el(tagName: string, className: string, parent: FakeEl | null): FakeEl {
  const node: FakeEl = { tagName: tagName.toUpperCase(), className, id: '', parentElement: parent, children: [] };
  parent?.children.push(node);
  return node;
}

// Two classed, id-less siblings, mirroring the .card pair in test-fixtures/index.html.
function buildPage() {
  const body = el('body', '', null);
  const grid = el('div', 'grid-2', body);
  const first = el('div', 'card', grid);
  const second = el('div', 'card', grid);
  return { body, first, second };
}

// Resolves only the grammar generateSelector emits: `tag.cls.cls:nth-of-type(n)` joined by ` > `.
function resolve(body: FakeEl, selector: string): FakeEl | null {
  let scope: FakeEl[] = [body];
  for (const part of selector.split(' > ')) {
    const m = /^([a-z0-9]+)((?:\.[^.:]+)*)(?::nth-of-type\((\d+)\))?$/.exec(part);
    if (!m) throw new Error(`unsupported selector part: ${part}`);
    const [, tag, classes, nth] = m;
    const wanted = classes.split('.').filter(Boolean);
    const next: FakeEl[] = [];
    for (const parent of scope) {
      const sameTag = parent.children.filter(c => c.tagName.toLowerCase() === tag);
      sameTag.forEach((c, i) => {
        const have = c.className.trim().split(/\s+/);
        if (wanted.every(w => have.includes(w)) && (!nth || i + 1 === Number(nth))) next.push(c);
      });
    }
    scope = next;
    if (!scope.length) return null;
  }
  return scope[0];
}

describe('element comment selector', () => {
  const g = globalThis as Record<string, unknown>;
  let saved: { css: unknown; document: unknown };
  let page: ReturnType<typeof buildPage>;

  beforeEach(() => {
    saved = { css: g.CSS, document: g.document };
    page = buildPage();
    g.CSS = { escape: (s: string) => s };
    g.document = { body: page.body };
  });

  afterEach(() => {
    g.CSS = saved.css;
    g.document = saved.document;
  });

  it('resolves a comment on the second of two similar classed elements back to it after reload', () => {
    const selector = commentSelector(page.second as unknown as HTMLElement, 'dm-2');

    const reloaded = buildPage();
    g.document = { body: reloaded.body };

    assert.equal(resolve(reloaded.body, selector), reloaded.second);
    assert.notEqual(resolve(reloaded.body, selector), reloaded.first);
  });

  it('gives similar siblings distinct selectors that keep the class name', () => {
    const first = commentSelector(page.first as unknown as HTMLElement, 'dm-1');
    const second = commentSelector(page.second as unknown as HTMLElement, 'dm-2');

    assert.notEqual(first, second);
    assert.match(second, /div\.card/);
  });

  it('falls back to the internal element id when the element is gone', () => {
    assert.equal(commentSelector(null, 'dm-9'), 'dm-9');
  });

  it('shows why a bare tag name is not enough: it re-anchors to the first element', () => {
    assert.equal(resolve(page.body, 'div'), page.body.children[0]);
  });
});
