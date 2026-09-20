import type { KeyboardShortcut } from '@shared/types';

export type ShortcutModifier = 'ctrl' | 'alt' | 'shift' | 'meta';

export type ShortcutBinding = {
  key: string;
  modifiers: ShortcutModifier[];
  code?: string;
};

export type ShortcutKeyEvent = {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  getModifierState?: (key: string) => boolean;
};

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph']);

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return !!el.isContentEditable;
}

export function logicalKeyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return null;
}

function isAsciiAlphanumeric(key: string): boolean {
  return key.length === 1 && /[a-z0-9]/i.test(key);
}

// Logical letters take priority so non-QWERTY layouts do not trigger a different shortcut.
export function needsPhysicalFallback(e: Pick<ShortcutKeyEvent, 'key'>): boolean {
  if (e.key === 'Dead' || e.key === 'Unidentified') return true;
  if (e.key.length !== 1) return false;
  return !isAsciiAlphanumeric(e.key);
}

function modifiersMatch(e: ShortcutKeyEvent, modifiers: readonly string[]): boolean {
  const mods = modifiers || [];
  if (mods.includes('meta')) {
    if (!e.metaKey || mods.includes('ctrl') !== e.ctrlKey) return false;
  } else if (mods.includes('ctrl') !== (e.ctrlKey || e.metaKey)) return false;
  if (mods.includes('alt') !== e.altKey) return false;
  if (mods.includes('shift') !== e.shiftKey) return false;
  return true;
}

function logicalKeyMatches(e: ShortcutKeyEvent, scKey: string): boolean {
  return e.key.toLowerCase() === scKey.toLowerCase();
}

function physicalKeyMatches(e: ShortcutKeyEvent, sc: { key: string; code?: string }): boolean {
  if (sc.code) return e.code === sc.code;
  const fromCode = logicalKeyFromCode(e.code);
  return fromCode !== null && fromCode === sc.key.toLowerCase();
}

export function matchShortcut(e: ShortcutKeyEvent, sc: { key: string; modifiers: readonly string[]; code?: string }): boolean {
  if (e.isComposing || e.keyCode === 229 || (e.ctrlKey && e.getModifierState?.('AltGraph'))) return false;
  if (!modifiersMatch(e, sc.modifiers)) return false;
  if (logicalKeyMatches(e, sc.key)) return true;
  if (e.altKey && needsPhysicalFallback(e) && physicalKeyMatches(e, sc)) return true;
  return false;
}

export function bindingFromKeyboardEvent(e: ShortcutKeyEvent): ShortcutBinding | null {
  if (isModifierKey(e.key) || e.isComposing || e.keyCode === 229 || (e.ctrlKey && e.getModifierState?.('AltGraph'))) return null;
  const modifiers: ShortcutModifier[] = [];
  if (e.ctrlKey || e.metaKey) modifiers.push('ctrl');
  if (e.altKey) modifiers.push('alt');
  if (e.shiftKey) modifiers.push('shift');

  if (!e.altKey || !needsPhysicalFallback(e)) {
    if (e.key === 'Dead' || e.key === 'Unidentified') return null;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return { key, modifiers };
  }

  const fromCode = logicalKeyFromCode(e.code);
  if (fromCode) return { key: fromCode, modifiers, code: e.code };
  if (e.key === 'Dead' || e.key === 'Unidentified') return null;
  return { key: e.key, modifiers };
}

export function mergeSavedShortcuts(defaults: readonly KeyboardShortcut[], saved: unknown): KeyboardShortcut[] {
  const entries = Array.isArray(saved) ? saved : [];
  return defaults.map(def => {
    const custom = entries.find(entry => entry && entry.action === def.action
      && typeof entry.key === 'string' && entry.key.length > 0
      && Array.isArray(entry.modifiers)
      && entry.modifiers.every((mod: unknown) => ['ctrl', 'alt', 'shift', 'meta'].includes(mod as string)));
    if (!custom) return { ...def, modifiers: [...def.modifiers] };
    return {
      ...def,
      key: custom.key,
      modifiers: [...custom.modifiers],
      ...(typeof custom.code === 'string' && custom.code ? { code: custom.code } : {}),
    };
  });
}
