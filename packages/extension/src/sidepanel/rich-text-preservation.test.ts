import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEditableRichTextNodes,
  collectPreservedRichTextNodes,
  isSafeRichTextHref,
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

  it('treats custom and unknown elements as opaque page-owned subtrees', () => {
    assert.equal(shouldPreserveRichTextNode(node('product-icon', { text: 'star' })), true);
    assert.equal(shouldPreserveRichTextNode(node('script', { text: 'unsafe()' })), true);
  });
});
