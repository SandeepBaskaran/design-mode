import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEditableRichTextNodes,
  collectPreservedRichTextNodes,
  isSafeRichTextHref,
  replaceRichTextHtml,
  sanitizeRichTextHref,
  shouldCommitRichTextKey,
  shouldPreserveRichTextNode,
  type RichTextNodeLike,
} from '../rich-text-preservation.ts';

interface FakeNode extends RichTextNodeLike {
  attributes: Array<{ name: string }>;
  children: FakeNode[];
}

function node(
  tagName: string,
  options: { text?: string; attributes?: string[]; children?: FakeNode[] } = {},
): FakeNode {
  const children = options.children ?? [];
  return {
    tagName: tagName.toUpperCase(),
    attributes: (options.attributes ?? []).map(name => ({ name })),
    children,
    textContent: (options.text ?? '') + children.map(child => child.textContent || '').join(''),
  };
}

describe('rich-text live island replacement', () => {
  function island(markup: string, tag = 'span') {
    return { ...node(tag, { attributes: ['class'] }), outerHTML: markup,
      replacedBy: undefined as unknown,
      replaceWith(original: unknown) { this.replacedBy = original; },
    };
  }

  for (const scenario of ['duplicates', 'changed', 'nested', 'formatted'] as const) {
    it(`reuses only exact opaque islands: ${scenario}`, (t) => {
      const first = island('<span class="icon"></span>');
      const second = island(first.outerHTML);
      const replacement = island(scenario === 'changed' ? '<span class="other"></span>' : first.outerHTML);
      const duplicate = island(first.outerHTML);
      const excess = island(first.outerHTML);
      const before = scenario === 'nested' ? [node('strong', { children: [first] })]
        : scenario === 'formatted' ? [node('strong', { text: 'Before' })] : [first, second];
      const after = scenario === 'nested' ? [node('em', { children: [replacement] })]
        : scenario === 'formatted' ? [node('strong', { text: 'After' })]
          : scenario === 'duplicates' ? [replacement, duplicate, excess] : [replacement];
      const fragment = { children: after };
      const template = { innerHTML: '', content: fragment };
      const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
      Object.defineProperty(globalThis, 'document', { configurable: true, value: {
        createElement(tag: string) { assert.equal(tag, 'template'); return template; },
      } });
      t.after(() => {
        if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
        else Reflect.deleteProperty(globalThis, 'document');
      });
      let installed: unknown;
      replaceRichTextHtml({ children: before, replaceChildren(value: unknown) { installed = value; } } as unknown as Element, 'submitted');
      assert.equal(template.innerHTML, 'submitted');
      assert.equal(installed, fragment);
      assert.equal(replacement.replacedBy, scenario === 'changed' || scenario === 'formatted' ? undefined : first);
      assert.equal(duplicate.replacedBy, scenario === 'duplicates' ? second : undefined);
      assert.equal(excess.replacedBy, undefined, 'one original cannot be reused twice');
    });
  }
});

describe('rich-text structural preservation', () => {
  it('commits Return without inserting a line break', () => {
    assert.equal(shouldCommitRichTextKey({ key: 'Enter', shiftKey: false, isComposing: false }), true);
    assert.equal(shouldCommitRichTextKey({ key: 'Enter', shiftKey: true, isComposing: false }), false);
    assert.equal(shouldCommitRichTextKey({ key: 'Enter', shiftKey: false, isComposing: true }), false);
  });

  it('preserves native media and its wrapper when the wrapper is an attributed icon island', () => {
    const svg = node('svg');
    const icon = node('span', { attributes: ['class', 'aria-hidden'], children: [svg] });
    const root = node('button', { text: 'Buy now', children: [icon] });

    assert.deepEqual(collectPreservedRichTextNodes(root), [icon]);
    assert.deepEqual(collectEditableRichTextNodes(root), []);
  });

  it('preserves empty class-based icon spans and icon-font elements', () => {
    assert.equal(shouldPreserveRichTextNode(node('span', { attributes: ['class'] })), true);
    assert.equal(shouldPreserveRichTextNode(node('i', { attributes: ['class', 'aria-hidden'] })), true);
  });

  it('preserves attributed child text spans so editing a parent cannot delete the child layer', () => {
    const label = node('span', { text: 'Continue', attributes: ['class', 'data-label'] });
    const root = node('button', { children: [label] });

    assert.deepEqual(collectPreservedRichTextNodes(root), [label]);
    assert.deepEqual(collectEditableRichTextNodes(root), []);
  });

  it('preserves an attributed text and media wrapper as one child layer', () => {
    const svg = node('svg');
    const wrapper = node('span', { text: 'Continue', attributes: ['class'], children: [svg] });
    const root = node('button', { children: [wrapper] });

    assert.deepEqual(collectPreservedRichTextNodes(root), [wrapper]);
    assert.deepEqual(collectEditableRichTextNodes(root), []);
  });

  it('preserves a nested CSS-image logo rotator as one opaque span', () => {
    const marks = Array.from({ length: 7 }, () =>
      node('span', { attributes: ['class', 'style'] }),
    );
    const logos = marks.map(mark => node('span', { attributes: ['class', 'style'], children: [mark] }));
    const rotator = node('span', { attributes: ['class', 'aria-hidden'], children: logos });
    const root = node('span', { text: "all your agent's work", children: [rotator] });

    assert.deepEqual(collectPreservedRichTextNodes(root), [rotator]);
    assert.deepEqual(collectEditableRichTextNodes(root), []);
  });

  it('keeps semantic and execCommand strikethrough editable', () => {
    for (const tag of ['s', 'strike']) {
      const formatted = node(tag, { text: 'Formatted text' });
      const root = node('p', { children: [formatted] });
      assert.equal(shouldPreserveRichTextNode(formatted), false);
      assert.deepEqual(collectEditableRichTextNodes(root), [formatted]);
      assert.deepEqual(collectPreservedRichTextNodes(root), []);
    }
  });

  it('keeps ordinary formatting and line breaks editable', () => {
    assert.equal(shouldPreserveRichTextNode(node('strong', { text: 'Bold' })), false);
    assert.equal(shouldPreserveRichTextNode(node('span', { text: 'Plain text' })), false);
    assert.equal(shouldPreserveRichTextNode(node('br')), false);
  });

  it('accepts document-safe link destinations and rejects active protocols', () => {
    assert.equal(isSafeRichTextHref('https://designmode.app'), true);
    assert.equal(isSafeRichTextHref('/docs'), true);
    assert.equal(isSafeRichTextHref('#details'), true);
    assert.equal(isSafeRichTextHref('javascript:alert(1)'), false);
    assert.equal(isSafeRichTextHref('//host.example/path'), false);
  });

  it('rejects browser-normalized protocol-relative links and active scheme variants', () => {
    for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', '//host.test', '/\\host.test', '/\n/host.test']) {
      assert.equal(isSafeRichTextHref(value), false, JSON.stringify(value));
    }
    for (const value of ['https://designmode.app/a?x=1&y=2', 'HTTP://example.test', '/docs', './docs', '../docs', '#details']) {
      assert.equal(isSafeRichTextHref(value), true, value);
    }
  });

  it('returns encoded URL data without changing existing escapes or URL delimiters', () => {
    const cases = [
      ['  /docs/a b?q=one two&next=%2Fhome#part  ', '/docs/a%20b?q=one%20two&next=%2Fhome#part'],
      ['https://example.test/"<tag>?a=1&b=2', 'https://example.test/%22%3Ctag%3E?a=1&b=2'],
      ['./café/你好', './caf%C3%A9/%E4%BD%A0%E5%A5%BD'],
      ['#a b', '#a%20b'],
      ['/a%20b/%2f/%25/%252f', '/a%20b/%2f/%25/%252f'],
      ['/bad%escape/%', '/bad%25escape/%25'],
      ['http://[::1]:3000/docs', 'http://[::1]:3000/docs'],
      ['https://[2001:db8::1]/a b?q=%5Bvalue%5D', 'https://[2001:db8::1]/a%20b?q=%5Bvalue%5D'],
    ];
    for (const [raw, expected] of cases) {
      const actual = sanitizeRichTextHref(raw);
      assert.equal(actual, expected, raw);
      assert.equal(sanitizeRichTextHref(actual!), expected, 'idempotent: ' + raw);
    }
  });

  it('fails closed on active schemes, normalization tricks and malformed Unicode', () => {
    for (const raw of ['', ' ', 'javascript:alert(1)', ' JAVASCRIPT:alert(1) ',
      'java\tscript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<svg onload=alert(1)>',
      'vbscript:msgbox(1)', 'file:///tmp/a', 'blob:https://example.test/id',
      '//evil.test', '/\\evil.test', '/\n/evil.test', '\\evil.test',
      'javascript%3Aalert(1)', 'javascript&#58;alert(1)', '/x\u0000y', '/x\u007fy', '/\ud800']) {
      assert.equal(sanitizeRichTextHref(raw), null, JSON.stringify(raw));
    }
    for (let control = 0; control < 32; control++) {
      assert.equal(sanitizeRichTextHref('/a' + String.fromCharCode(control) + 'b'), null);
    }
  });

  it('treats custom and unknown elements as opaque page-owned subtrees', () => {
    assert.equal(shouldPreserveRichTextNode(node('product-icon', { text: 'star' })), true);
    assert.equal(shouldPreserveRichTextNode(node('script', { text: 'unsafe()' })), true);
  });
});
