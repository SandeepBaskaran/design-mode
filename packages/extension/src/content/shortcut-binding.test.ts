import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindingFromKeyboardEvent,
  isTypingTarget,
  matchShortcut,
  mergeSavedShortcuts,
  needsPhysicalFallback,
  type ShortcutBinding,
  type ShortcutKeyEvent,
} from './shortcut-binding.ts';

function evt(partial: Partial<ShortcutKeyEvent> & Pick<ShortcutKeyEvent, 'key' | 'code'>): ShortcutKeyEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...partial,
  };
}

const altI: ShortcutBinding = { key: 'i', modifiers: ['alt'] };
const altC: ShortcutBinding = { key: 'c', modifiers: ['alt'] };
const alt1: ShortcutBinding = { key: '1', modifiers: ['alt'] };
const ctrlC: ShortcutBinding = { key: 'c', modifiers: ['ctrl'] };
const ctrlI: ShortcutBinding = { key: 'i', modifiers: ['ctrl'] };
const ctrlShiftZ: ShortcutBinding = { key: 'z', modifiers: ['ctrl', 'shift'] };
const escapeSc: ShortcutBinding = { key: 'Escape', modifiers: [] };
const deleteSc: ShortcutBinding = { key: 'Delete', modifiers: [] };

describe('macOS Option glyphs and dead keys', () => {
  it('matches Alt+I when Option rewrites e.key to a dead-key glyph', () => {
    assert.equal(matchShortcut(evt({ key: 'ˆ', code: 'KeyI', altKey: true }), altI), true);
    assert.equal(matchShortcut(evt({ key: 'Dead', code: 'KeyI', altKey: true }), altI), true);
  });

  it('matches the rest of the default Alt letter bindings on US Mac glyphs', () => {
    assert.equal(matchShortcut(evt({ key: '∂', code: 'KeyD', altKey: true }), { key: 'd', modifiers: ['alt'] }), true);
    assert.equal(matchShortcut(evt({ key: 'ç', code: 'KeyC', altKey: true }), altC), true);
    assert.equal(matchShortcut(evt({ key: '®', code: 'KeyR', altKey: true }), { key: 'r', modifiers: ['alt'] }), true);
    assert.equal(matchShortcut(evt({ key: 'π', code: 'KeyP', altKey: true }), { key: 'p', modifiers: ['alt'] }), true);
    assert.equal(matchShortcut(evt({ key: 'ß', code: 'KeyS', altKey: true }), { key: 's', modifiers: ['alt'] }), true);
    assert.equal(matchShortcut(evt({ key: '≈', code: 'KeyX', altKey: true }), { key: 'x', modifiers: ['alt'] }), true);
  });

  it('does not match a different Alt letter when the glyph is transformed', () => {
    assert.equal(matchShortcut(evt({ key: 'ˆ', code: 'KeyI', altKey: true }), altC), false);
  });
});

describe('digits', () => {
  it('matches Alt+1 when Option rewrites the digit to a glyph', () => {
    assert.equal(matchShortcut(evt({ key: '¡', code: 'Digit1', altKey: true }), alt1), true);
    assert.equal(matchShortcut(evt({ key: '™', code: 'Digit2', altKey: true }), { key: '2', modifiers: ['alt'] }), true);
    assert.equal(matchShortcut(evt({ key: '£', code: 'Digit3', altKey: true }), { key: '3', modifiers: ['alt'] }), true);
  });

  it('matches an untransformed digit on e.key', () => {
    assert.equal(matchShortcut(evt({ key: '1', code: 'Digit1', altKey: true }), alt1), true);
  });
});

describe('modifiers', () => {
  it('supports explicit Meta bindings without accepting plain keys or Control', () => {
    const sc: ShortcutBinding = { key: 'i', modifiers: ['meta'] };
    assert.equal(matchShortcut(evt({ key: 'i', code: 'KeyI', metaKey: true }), sc), true);
    assert.equal(matchShortcut(evt({ key: 'i', code: 'KeyI', ctrlKey: true }), sc), false);
    assert.equal(matchShortcut(evt({ key: 'i', code: 'KeyI' }), sc), false);
  });
  it('treats Meta as Ctrl so Cmd+Z matches the ctrl binding', () => {
    assert.equal(matchShortcut(evt({ key: 'z', code: 'KeyZ', metaKey: true }), { key: 'z', modifiers: ['ctrl'] }), true);
    assert.equal(matchShortcut(evt({ key: 'z', code: 'KeyZ', ctrlKey: true }), { key: 'z', modifiers: ['ctrl'] }), true);
  });

  it('requires shift when the binding includes it', () => {
    assert.equal(matchShortcut(evt({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), ctrlShiftZ), true);
    assert.equal(matchShortcut(evt({ key: 'z', code: 'KeyZ', ctrlKey: true }), ctrlShiftZ), false);
  });

  it('rejects Alt+I without Alt and rejects extra Shift', () => {
    assert.equal(matchShortcut(evt({ key: 'i', code: 'KeyI' }), altI), false);
    assert.equal(matchShortcut(evt({ key: 'i', code: 'KeyI', altKey: true, shiftKey: true }), altI), false);
  });

  it('keeps Escape and Delete on e.key', () => {
    assert.equal(matchShortcut(evt({ key: 'Escape', code: 'Escape' }), escapeSc), true);
    assert.equal(matchShortcut(evt({ key: 'Delete', code: 'Delete' }), deleteSc), true);
    assert.equal(needsPhysicalFallback(evt({ key: 'Escape', code: 'Escape' })), false);
  });
});

describe('non-QWERTY logical precedence', () => {
  it('matches Dvorak Ctrl+C by e.key even though code is KeyI', () => {
    const dvorakC = evt({ key: 'c', code: 'KeyI', ctrlKey: true });
    assert.equal(matchShortcut(dvorakC, ctrlC), true);
    assert.equal(matchShortcut(dvorakC, ctrlI), false);
  });

  it('matches Dvorak Ctrl+I by e.key even though code is KeyC', () => {
    const dvorakI = evt({ key: 'i', code: 'KeyC', ctrlKey: true });
    assert.equal(matchShortcut(dvorakI, ctrlI), true);
    assert.equal(matchShortcut(dvorakI, ctrlC), false);
  });

  it('does not use physical fallback when e.key is still ASCII', () => {
    assert.equal(needsPhysicalFallback(evt({ key: 'c', code: 'KeyI', ctrlKey: true })), false);
  });
});

describe('typing / contentEditable safety', () => {
  it('does not dispatch or record composing and AltGr text input', () => {
    const composing = evt({ key: 'i', code: 'KeyI', altKey: true, isComposing: true });
    assert.equal(matchShortcut(composing, altI), false);
    assert.equal(bindingFromKeyboardEvent(composing), null);
    const altGr = evt({ key: '@', code: 'KeyQ', ctrlKey: true, altKey: true, getModifierState: key => key === 'AltGraph' });
    assert.equal(matchShortcut(altGr, { key: 'q', modifiers: ['ctrl', 'alt'] }), false);
    assert.equal(bindingFromKeyboardEvent(altGr), null);
  });

  it('keeps Option working when a browser labels Option as AltGraph', () => {
    const option = evt({ key: 'ˆ', code: 'KeyI', altKey: true, getModifierState: key => key === 'AltGraph' });
    assert.equal(matchShortcut(option, altI), true);
  });

  it('does not replace ordinary international characters with physical US keys', () => {
    const key = evt({ key: 'é', code: 'Digit2' });
    assert.equal(matchShortcut(key, { key: '2', modifiers: [] }), false);
    assert.deepEqual(bindingFromKeyboardEvent(key), { key: 'é', modifiers: [] });
  });

  it('treats input, textarea, select, and contentEditable as typing targets', () => {
    assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
    assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
    assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
    assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
    assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: false }), false);
    assert.equal(isTypingTarget(null), false);
  });
});

describe('custom recorder roundtrip', () => {
  it('stores a logical letter + physical code for Option-transformed keys', () => {
    const binding = bindingFromKeyboardEvent(evt({ key: 'ˆ', code: 'KeyI', altKey: true }));
    assert.deepEqual(binding, { key: 'i', modifiers: ['alt'], code: 'KeyI' });
    assert.equal(matchShortcut(evt({ key: 'ˆ', code: 'KeyI', altKey: true }), binding!), true);
    assert.equal(matchShortcut(evt({ key: 'Dead', code: 'KeyI', altKey: true }), binding!), true);
  });

  it('round-trips Option+digit without persisting the glyph', () => {
    const binding = bindingFromKeyboardEvent(evt({ key: '¡', code: 'Digit1', altKey: true }));
    assert.deepEqual(binding, { key: '1', modifiers: ['alt'], code: 'Digit1' });
    assert.equal(matchShortcut(evt({ key: '¡', code: 'Digit1', altKey: true }), binding!), true);
  });

  it('keeps legacy saved shapes (key + modifiers, no code) matching on macOS', () => {
    const legacy: ShortcutBinding = { key: 'i', modifiers: ['alt'] };
    assert.equal(matchShortcut(evt({ key: 'ˆ', code: 'KeyI', altKey: true }), legacy), true);
  });

  it('does not record modifier-only keydowns', () => {
    assert.equal(bindingFromKeyboardEvent(evt({ key: 'Alt', code: 'AltLeft', altKey: true })), null);
    assert.equal(bindingFromKeyboardEvent(evt({ key: 'Meta', code: 'MetaLeft', metaKey: true })), null);
  });

  it('records untransformed Ctrl+C as a legacy shape without code', () => {
    const binding = bindingFromKeyboardEvent(evt({ key: 'c', code: 'KeyC', ctrlKey: true }));
    assert.deepEqual(binding, { key: 'c', modifiers: ['ctrl'] });
    const dvorakC = evt({ key: 'c', code: 'KeyI', ctrlKey: true });
    assert.equal(matchShortcut(dvorakC, binding!), true);
    assert.equal(matchShortcut(dvorakC, { key: 'i', modifiers: ['ctrl'] }), false);
  });
});

describe('saved shortcut recovery', () => {
  const defaults = [
    { ...altI, action: 'toggle-inspect', label: 'Inspect', category: 'General' },
    { ...altC, action: 'add-annotation', label: 'Comment', category: 'Annotations' },
  ];

  it('retains defaults when storage is absent, empty or malformed', () => {
    for (const saved of [undefined, null, [], {}, [null], [{ action: 'toggle-inspect', key: null, modifiers: [] }]]) {
      assert.deepEqual(mergeSavedShortcuts(defaults, saved), defaults);
    }
  });

  it('merges valid overrides without losing unspecified actions', () => {
    const resolved = mergeSavedShortcuts(defaults, [{ action: 'toggle-inspect', key: 'k', modifiers: ['alt'], code: 'KeyK' }]);
    assert.equal(resolved.length, defaults.length);
    assert.equal(resolved[0].key, 'k');
    assert.equal(resolved[0].code, 'KeyK');
    assert.deepEqual(resolved[1], defaults[1]);
  });

  it('ignores invalid modifiers and unknown actions', () => {
    assert.deepEqual(mergeSavedShortcuts(defaults, [
      { action: 'toggle-inspect', key: 'i', modifiers: ['invalid'] },
      { action: 'unknown', key: 'c', modifiers: ['alt'] },
    ]), defaults);
  });
});
