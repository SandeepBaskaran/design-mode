import { getElementById } from './helpers';
import { getDomChanges, getTextChanges, areOverridesEnabled, setOverridesEnabled } from './change-tracker';

type Location = { parentId?: string; parentSelector: string; index: number };

function unique(selector: string): HTMLElement | null {
  const matches = document.querySelectorAll<HTMLElement>(selector);
  return matches.length === 1 ? matches[0] : null;
}

export function previewOriginal(retained: Map<string, HTMLElement> = new Map()): { restore: () => void } {
  const journal: Array<() => void> = [];
  const restore = () => { for (const undo of [...journal].reverse()) undo(); };
  const rememberPosition = (el: HTMLElement) => {
    const parent = el.parentNode, next = el.nextSibling;
    journal.push(() => {
      if (parent) parent.insertBefore(el, next?.parentNode === parent ? next : null);
      else el.remove();
    });
  };
  const place = (el: HTMLElement, loc: Location | undefined) => {
    const parent = loc && ((loc.parentId && getElementById(loc.parentId)) || unique(loc.parentSelector));
    if (!parent || !loc) throw Error('Original element location is unavailable');
    const siblings = Array.from(parent.children).filter(child => child !== el);
    parent.insertBefore(el, siblings[loc.index] || null);
  };
  try {
    const overridesEnabled = areOverridesEnabled();
    journal.push(() => setOverridesEnabled(overridesEnabled));
    setOverridesEnabled(false);
    for (const id of ['dm-token-overrides']) {
      const sheet = (document.getElementById(id) as HTMLStyleElement | null)?.sheet;
      if (sheet) {
        const disabled = sheet.disabled;
        journal.push(() => { sheet.disabled = disabled; });
        sheet.disabled = true;
      }
    }
    for (const change of getDomChanges().reverse()) {
      let el = getElementById(change.elementId);
      if (change.action === 'delete') {
        if (el) continue;
        el = retained.get(change.elementId) || null;
        if (!el && change.outerHTML) {
          const template = document.createElement('template');
          template.innerHTML = change.outerHTML;
          el = template.content.firstElementChild as HTMLElement | null;
          if (el) el.setAttribute('data-dm-id', change.elementId);
        }
        if (!el) throw Error('Deleted element snapshot is unavailable');
        rememberPosition(el);
        place(el, change.origin);
      } else if (change.action === 'move') {
        el ||= unique(change.selector);
        if (!el) throw Error('Moved element is unavailable');
        rememberPosition(el);
        place(el, change.origin);
      } else if (change.action === 'insert' || change.action === 'duplicate') {
        if (!el) continue;
        rememberPosition(el);
        el.remove();
      }
    }
    const first = new Map<string, ReturnType<typeof getTextChanges>[number]>();
    for (const change of getTextChanges()) {
      const key = `${change.elementId}\0${change.attributeName || 'content'}`;
      if (!first.has(key)) first.set(key, change);
    }
    for (const change of first.values()) {
      const el = getElementById(change.elementId);
      if (!el) continue;
      if (change.attributeName) {
        const name = change.attributeName, value = el.getAttribute(name);
        journal.push(() => { if (value === null) el.removeAttribute(name); else el.setAttribute(name, value); });
        if (change.oldText) el.setAttribute(name, change.oldText); else el.removeAttribute(name);
      } else {
        // Retain the edited children, including their event listeners and form state.
        const children = Array.from(el.childNodes);
        journal.push(() => { el.replaceChildren(...children); });
        if (change.isHtml) el.innerHTML = change.oldText;
        else el.textContent = change.oldText;
      }
    }
    return { restore };
  } catch (error) {
    restore();
    throw error;
  }
}

export function restoreOriginalPreview(): void {
  const state = window as unknown as { __dmPreviewSaved?: { restore?: () => void } };
  state.__dmPreviewSaved?.restore?.();
  delete state.__dmPreviewSaved;
}
