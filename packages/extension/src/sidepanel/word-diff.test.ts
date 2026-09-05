import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffWords } from './word-diff.ts';

describe('diffWords', () => {
  it('treats replaced words as complete units', () => {
    assert.deepEqual(diffWords('Add to Mozilla', 'Add to Chrome'), [
      { kind: 'eq', text: 'Add to ' },
      { kind: 'del', text: 'Mozilla' },
      { kind: 'add', text: 'Chrome' },
    ]);
  });

  it('keeps punctuation and whitespace readable', () => {
    assert.deepEqual(diffWords('Hello, old world!', 'Hello, new world!'), [
      { kind: 'eq', text: 'Hello, ' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
      { kind: 'eq', text: ' world!' },
    ]);
  });

  it('isolates a changed word inside unchanged markup', () => {
    assert.deepEqual(diffWords('<img src="/chrome.svg">Add to Mozilla', '<img src="/chrome.svg">Add to Chrome'), [
      { kind: 'eq', text: '<img src="/chrome.svg">Add to ' },
      { kind: 'del', text: 'Mozilla' },
      { kind: 'add', text: 'Chrome' },
    ]);
  });
});
