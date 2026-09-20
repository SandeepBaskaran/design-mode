// ============================================================
// Phase 9: UX Polish — Keyboard Shortcuts
// Configurable shortcuts, named presets, hover-to-edit,
// slider rubber-band, click-to-snap
// ============================================================

import { DEFAULT_SHORTCUTS } from '@shared/constants';
import type { KeyboardShortcut } from '@shared/types';
import {
  bindingFromKeyboardEvent,
  isTypingTarget,
  matchShortcut,
  mergeSavedShortcuts,
} from './shortcut-binding';

type ShortcutHandler = () => void;

const handlers = new Map<string, ShortcutHandler>();
const defaultShortcuts: KeyboardShortcut[] = DEFAULT_SHORTCUTS.map(s => ({ ...s, modifiers: [...s.modifiers] }));
let shortcuts = mergeSavedShortcuts(defaultShortcuts, undefined);
let enabled = false;
let storageHooked = false;

// ── Register / Unregister ──

export function registerShortcut(action: string, handler: ShortcutHandler) {
  handlers.set(action, handler);
}

export function unregisterShortcut(action: string) {
  handlers.delete(action);
}

export function triggerShortcut(action: string): boolean {
  const handler = enabled ? handlers.get(action) : undefined;
  if (!handler) return false;
  handler();
  return true;
}

// ── Enable / Disable ──

export function enableShortcuts() {
  if (enabled) return;
  enabled = true;
  hookShortcutStorage();
  document.addEventListener('keydown', onKeyDown, true);
}

export function disableShortcuts() {
  enabled = false;
  document.removeEventListener('keydown', onKeyDown, true);
}

function onKeyDown(e: KeyboardEvent) {
  if (isTypingTarget(e.target) && e.key !== 'Escape') return;

  for (const sc of shortcuts) {
    if (matchShortcut(e, sc)) {
      const handler = handlers.get(sc.action);
      if (handler) {
        e.preventDefault();
        e.stopPropagation();
        handler();
        return;
      }
    }
  }
}

// ── Custom Shortcuts ──

export function updateShortcut(
  action: string,
  key: string,
  modifiers: KeyboardShortcut['modifiers'],
  code?: string,
) {
  const idx = shortcuts.findIndex(s => s.action === action);
  if (idx > -1) {
    const binding = bindingFromKeyboardEvent({
      key, code: code || '',
      altKey: modifiers.includes('alt'),
      ctrlKey: modifiers.includes('ctrl'),
      metaKey: modifiers.includes('meta'),
      shiftKey: modifiers.includes('shift'),
    });
    if (!binding) return;
    const next: KeyboardShortcut = { ...shortcuts[idx], ...binding, modifiers };
    if (!binding.code) delete next.code;
    shortcuts[idx] = next;
  }
  saveShortcuts();
}

export function resetShortcuts() {
  shortcuts = mergeSavedShortcuts(defaultShortcuts, undefined);
  saveShortcuts();
}

export function getShortcuts(): KeyboardShortcut[] {
  return [...shortcuts];
}

async function saveShortcuts() {
  try {
    await browser.storage.local.set({ 'dm-shortcuts': shortcuts });
  } catch {}
}

export async function loadShortcuts() {
  hookShortcutStorage();
  try {
    const data = await browser.storage.local.get('dm-shortcuts');
    shortcuts = mergeSavedShortcuts(defaultShortcuts, data['dm-shortcuts']);
  } catch {}
}

function hookShortcutStorage() {
  if (storageHooked) return;
  storageHooked = true;
  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (!changes['dm-shortcuts']) return;
      shortcuts = mergeSavedShortcuts(defaultShortcuts, changes['dm-shortcuts'].newValue);
    });
  } catch {}
}

// ── Format shortcut for display ──

export function formatShortcut(sc: KeyboardShortcut): string {
  const parts: string[] = [];
  if (sc.modifiers.includes('ctrl')) parts.push('Ctrl');
  if (sc.modifiers.includes('alt')) parts.push('Alt');
  if (sc.modifiers.includes('shift')) parts.push('Shift');
  if (sc.modifiers.includes('meta')) parts.push('⌘');
  parts.push(sc.key.length === 1 ? sc.key.toUpperCase() : sc.key);
  return parts.join('+');
}
