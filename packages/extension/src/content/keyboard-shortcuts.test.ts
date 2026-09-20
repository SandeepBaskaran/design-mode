import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTypingTarget, matchShortcut } from './shortcut-binding.ts';

function shouldIgnoreShortcut(target: unknown, key: string): boolean {
  return isTypingTarget(target) && key !== 'Escape';
}

describe('content shortcut dispatch guards', () => {
  it('lets Escape through while typing but blocks other keys', () => {
    assert.equal(shouldIgnoreShortcut({ tagName: 'INPUT' }, 'i'), true);
    assert.equal(shouldIgnoreShortcut({ tagName: 'INPUT' }, 'Escape'), false);
    assert.equal(shouldIgnoreShortcut({ tagName: 'DIV', isContentEditable: true }, 'c'), true);
  });

  it('still matches Alt+I after the typing guard would allow a page event', () => {
    assert.equal(shouldIgnoreShortcut({ tagName: 'BODY', isContentEditable: false }, 'ˆ'), false);
    assert.equal(
      matchShortcut(
        { key: 'ˆ', code: 'KeyI', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
        { key: 'i', modifiers: ['alt'] },
      ),
      true,
    );
  });
});
