// Per-session store for user edits to CSS design tokens, scoped to the
// selector the token is declared on (':root', '.cds--g100', a component
// scope…). Overrides land in a managed <style> element rather than
// inline documentElement style — a scoped rule with !important wins over
// theme-scope declarations and cascade layers without leaking the new
// value into sibling scopes.
//
// Lives in its own file so both the content message handlers and the
// markdown exporter can import it without a circular dependency on
// content/index.ts.

import { getTokenIndex, type DesignSystemId } from './token-engine';

export type TokenEdit = {
  cssVar: string;
  scopeSelector: string;
  original: string;      // resolved at the scope element on first edit
  current: string;
  system?: DesignSystemId;
};

const edits = new Map<string, TokenEdit>();

function editKey(scopeSelector: string, cssVar: string): string {
  return scopeSelector + '\u0000' + cssVar;
}

function scopeElement(scopeSelector: string): Element {
  if (scopeSelector === ':root' || scopeSelector === 'html') return document.documentElement;
  try { return document.querySelector(scopeSelector) ?? document.documentElement; }
  catch { return document.documentElement; }
}

function overrideSheet(): HTMLStyleElement {
  let el = document.getElementById('dm-token-overrides') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'dm-token-overrides';
    (document.head || document.documentElement).appendChild(el);
  }
  return el;
}

// Rules go in via CSSOM, never string-concatenated text: `current` can come
// from an imported design-system file, and `setProperty` parses the value
// instead of letting `red; } html { … }` escape the declaration block.
function rebuildOverrides(): void {
  const sheet = overrideSheet().sheet;
  if (!sheet) return;
  while (sheet.cssRules.length > 0) sheet.deleteRule(0);
  for (const e of edits.values()) {
    try {
      const i = sheet.insertRule(`${e.scopeSelector} {}`, sheet.cssRules.length);
      (sheet.cssRules[i] as CSSStyleRule).style.setProperty(e.cssVar, e.current, 'important');
    } catch {} // unparseable selector — the scope simply gets no override
  }
}

export function setTokenEdit(cssVar: string, value: string, scopeSelector = ':root'): void {
  const k = editKey(scopeSelector, cssVar);
  let edit = edits.get(k);
  if (!edit) {
    edit = {
      cssVar,
      scopeSelector,
      original: getComputedStyle(scopeElement(scopeSelector)).getPropertyValue(cssVar).trim(),
      current: value,
      system: getTokenIndex().byVar.get(cssVar)?.system,
    };
    edits.set(k, edit);
  } else {
    edit.current = value;
  }
  rebuildOverrides();
}

export function resetTokenEdit(cssVar: string, scopeSelector = ':root'): void {
  edits.delete(editKey(scopeSelector, cssVar));
  rebuildOverrides();
}

// Drop every tracked token edit and its override rule — used by the
// Changes-tab "Clear all" so token edits are wiped alongside style/text/DOM.
export function clearAllTokenEdits(): void {
  edits.clear();
  rebuildOverrides();
}

// One entry per token the user has edited this session. Edits whose
// current value equals the original (reverted by hand) are omitted.
export function getTokenEdits(): TokenEdit[] {
  const out: TokenEdit[] = [];
  for (const e of edits.values()) {
    if (e.current && e.current !== e.original) out.push({ ...e });
  }
  return out;
}
