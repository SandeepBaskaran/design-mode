// ============================================================
// Phase 9: UX Polish — Keyboard Shortcuts
// Configurable shortcuts, named presets, hover-to-edit,
// slider rubber-band, click-to-snap
// ============================================================

import { DEFAULT_SHORTCUTS } from '@shared/constants';
import type { KeyboardShortcut } from '@shared/types';

type ShortcutHandler = () => void;

const handlers = new Map<string, ShortcutHandler>();
let shortcuts: KeyboardShortcut[] = [...DEFAULT_SHORTCUTS.map(s => ({ ...s })) as any];
let enabled = false;

// ── Register / Unregister ──

export function registerShortcut(action: string, handler: ShortcutHandler) {
  handlers.set(action, handler);
}

export function unregisterShortcut(action: string) {
  handlers.delete(action);
}

// ── Enable / Disable ──

export function enableShortcuts() {
  if (enabled) return;
  enabled = true;
  document.addEventListener('keydown', onKeyDown, true);
}

export function disableShortcuts() {
  enabled = false;
  document.removeEventListener('keydown', onKeyDown, true);
}

function onKeyDown(e: KeyboardEvent) {
  // Don't intercept when typing in inputs
  const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable) {
    // Only allow Escape
    if (e.key !== 'Escape') return;
  }

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

function matchShortcut(e: KeyboardEvent, sc: KeyboardShortcut): boolean {
  if (e.key.toLowerCase() !== sc.key.toLowerCase()) return false;
  const mods = sc.modifiers || [];
  if (mods.includes('ctrl') !== (e.ctrlKey || e.metaKey)) return false;
  if (mods.includes('alt') !== e.altKey) return false;
  if (mods.includes('shift') !== e.shiftKey) return false;
  return true;
}

// ── Custom Shortcuts ──

export function updateShortcut(action: string, key: string, modifiers: KeyboardShortcut['modifiers']) {
  const idx = shortcuts.findIndex(s => s.action === action);
  if (idx > -1) {
    shortcuts[idx] = { ...shortcuts[idx], key, modifiers };
  }
  saveShortcuts();
}

export function resetShortcuts() {
  shortcuts = [...DEFAULT_SHORTCUTS.map(s => ({ ...s })) as any];
  saveShortcuts();
}

export function getShortcuts(): KeyboardShortcut[] {
  return [...shortcuts];
}

async function saveShortcuts() {
  try {
    await chrome.storage.local.set({ 'dm-shortcuts': shortcuts });
  } catch {}
}

export async function loadShortcuts() {
  try {
    const data = await chrome.storage.local.get('dm-shortcuts');
    if (data['dm-shortcuts']) {
      shortcuts = data['dm-shortcuts'];
    }
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
