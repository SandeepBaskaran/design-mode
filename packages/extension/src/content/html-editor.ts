// ============================================================
// Design Mode — HTML Editing
// Cut, copy, paste, duplicate, delete DOM elements
// Records DOM changes in change tracker
// ============================================================

import { getOrAssignId, getElementById, generateSelector } from './helpers';
import { recordDomChange } from './change-tracker';

let clipboard: { html: string; tagName: string; styles: string } | null = null;

export function cutElement(elementId: string): boolean {
  const el = getElementById(elementId);
  if (!el || isDmElement(el)) return false;
  clipboard = { html: el.outerHTML, tagName: el.tagName, styles: el.getAttribute('style') || '' };
  const selector = generateSelector(el);
  // Capture the element's location BEFORE removal so Clear All / Import
  // can put it back at exactly the same spot. We pass origin (not
  // destination) — semantically this is where the element WAS.
  const parent = el.parentElement;
  const origin = parent
    ? { parentSelector: generateSelector(parent), index: Array.from(parent.children).indexOf(el) }
    : undefined;
  recordDomChange(
    elementId, selector, 'delete', el.tagName.toLowerCase(),
    el.outerHTML, undefined, origin,
  );
  el.remove();
  return true;
}

export function copyElement(elementId: string): boolean {
  const el = getElementById(elementId);
  if (!el || isDmElement(el)) return false;
  clipboard = { html: el.outerHTML, tagName: el.tagName, styles: el.getAttribute('style') || '' };
  return true;
}

export function pasteElement(targetId: string, position: 'before' | 'after' | 'inside' = 'after'): string | null {
  if (!clipboard) return null;
  const target = getElementById(targetId);
  if (!target || isDmElement(target)) return null;
  const temp = document.createElement('div');
  temp.innerHTML = clipboard.html;
  const el = temp.firstElementChild as HTMLElement;
  if (!el) return null;
  el.removeAttribute('data-dm-id');
  el.querySelectorAll('[data-dm-id]').forEach(c => c.removeAttribute('data-dm-id'));
  const id = getOrAssignId(el);
  if (position === 'before') target.parentElement?.insertBefore(el, target);
  else if (position === 'inside') target.appendChild(el);
  else target.parentElement?.insertBefore(el, target.nextSibling);
  // Capture outerHTML + destination so import/replay can reconstruct
  // this element on a fresh page. outerHTML is captured AFTER insertion so
  // the data-dm-id stamp is preserved and the duplicate is re-attachable
  // with the same id.
  const parent = el.parentElement;
  const destination = parent
    ? { parentSelector: generateSelector(parent), index: Array.from(parent.children).indexOf(el) }
    : undefined;
  recordDomChange(
    id, generateSelector(el), 'insert', el.tagName.toLowerCase(),
    el.outerHTML, destination,
  );
  return id;
}

export function duplicateElement(elementId: string): string | null {
  const el = getElementById(elementId);
  if (!el || isDmElement(el)) return null;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-dm-id');
  clone.querySelectorAll('[data-dm-id]').forEach(c => c.removeAttribute('data-dm-id'));
  const id = getOrAssignId(clone);
  el.parentElement?.insertBefore(clone, el.nextSibling);
  // Same capture as paste — outerHTML + destination are needed to replay
  // the duplicate on a fresh page (cleared session, imported JSON, etc.).
  const parent = clone.parentElement;
  const destination = parent
    ? { parentSelector: generateSelector(parent), index: Array.from(parent.children).indexOf(clone) }
    : undefined;
  recordDomChange(
    id, generateSelector(clone), 'duplicate', clone.tagName.toLowerCase(),
    clone.outerHTML, destination,
  );
  return id;
}

export function deleteElement(elementId: string): boolean {
  const el = getElementById(elementId);
  if (!el || isDmElement(el)) return false;
  const selector = generateSelector(el);
  const tagName = el.tagName.toLowerCase();
  const html = el.outerHTML;
  // Capture the element's location BEFORE removal so Clear All / Import
  // can put it back at exactly the same spot.
  const parent = el.parentElement;
  const origin = parent
    ? { parentSelector: generateSelector(parent), index: Array.from(parent.children).indexOf(el) }
    : undefined;
  recordDomChange(elementId, selector, 'delete', tagName, html, undefined, origin);
  el.remove();
  return true;
}

export function moveElement(elementId: string, direction: 'up' | 'down'): boolean {
  const el = getElementById(elementId);
  if (!el || isDmElement(el) || !el.parentElement) return false;
  const parent = el.parentElement;
  // Capture origin BEFORE the move so the Changes tab can show
  // `from <selector> > position N` and Clear All can put the element back.
  // Mirrors the REORDER_LAYER handler in content/index.ts.
  const origin = {
    parentSelector: generateSelector(parent),
    index: Array.from(parent.children).indexOf(el),
  };
  if (direction === 'up' && el.previousElementSibling) {
    parent.insertBefore(el, el.previousElementSibling);
  } else if (direction === 'down' && el.nextElementSibling) {
    parent.insertBefore(el.nextElementSibling, el);
  } else {
    return false;
  }
  const destination = {
    parentSelector: generateSelector(parent),
    index: Array.from(parent.children).indexOf(el),
  };
  recordDomChange(
    elementId, generateSelector(el), 'move', el.tagName.toLowerCase(),
    undefined, destination, origin,
  );
  return true;
}

export function hasClipboard(): boolean {
  return clipboard !== null;
}

function isDmElement(el: HTMLElement): boolean {
  return el.id?.startsWith('dm-') || el.classList?.contains('dm-comment-pin') || false;
}
