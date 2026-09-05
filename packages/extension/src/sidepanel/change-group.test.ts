import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectGroupRevertIds } from './change-group.ts';

describe('collectGroupRevertIds', () => {
  it('includes persisted comment ids for a comment-only group', () => {
    assert.deepEqual(collectGroupRevertIds('hero', {
      styles: [],
      texts: [],
      dom: [],
      comments: [{ id: 'note-1', elementId: 'hero' }],
    }), ['comment-note-1']);
  });

  it('uses the same selector fallback across every change kind', () => {
    assert.deepEqual(collectGroupRevertIds('.card', {
      styles: [{ id: 'style-1', selector: '.card' }],
      texts: [{ id: 'text-1', selector: '.card' }],
      dom: [{ id: 'dom-1', selector: '.card' }],
      comments: [{ id: 'note-1', selector: '.card' }],
    }), ['style-1', 'text-1', 'dom-1', 'comment-note-1']);
  });
});
