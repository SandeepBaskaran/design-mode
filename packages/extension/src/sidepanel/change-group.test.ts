import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectGroupRevertIds, styleChangeGroupKey } from './change-group.ts';

it('keeps consolidation together across elements without merging other operations', () => {
  const a = { elementId: 'a', groupKind: 'consolidate', groupId: 'one' };
  assert.equal(styleChangeGroupKey(a), 'consolidate:one');
  assert.equal(styleChangeGroupKey({ ...a, elementId: 'b' }), 'consolidate:one');
  assert.equal(styleChangeGroupKey({ ...a, groupId: 'two' }), 'consolidate:two');
  assert.equal(styleChangeGroupKey({ ...a, groupId: undefined }), 'a');
  assert.equal(styleChangeGroupKey({ ...a, groupKind: 'preset' }), 'a');
  assert.equal(styleChangeGroupKey({ ...a, groupKind: 'multi-select' }), 'multi-select:one');
  assert.equal(styleChangeGroupKey(a, 'component'), 'a');
});

it('reverts only the consolidated operation across all participating elements', () => {
  const styles = [
    { id: 'a1', elementId: 'a', groupKind: 'consolidate', groupId: 'one' },
    { id: 'b1', elementId: 'b', groupKind: 'consolidate', groupId: 'one' },
    { id: 'a2', elementId: 'a', groupKind: 'consolidate', groupId: 'two' },
    { id: 'plain', elementId: 'a' },
  ];
  const changes = { styles, texts: [], dom: [], comments: [{ id: 'note', elementId: 'a' }] };
  assert.deepEqual(collectGroupRevertIds('consolidate:one', changes), ['a1', 'b1']);
  assert.deepEqual(collectGroupRevertIds('a', changes), ['plain', 'comment-note']);
  assert.deepEqual(collectGroupRevertIds('a', changes, 'component'), ['a1', 'a2', 'plain', 'comment-note']);
});

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
