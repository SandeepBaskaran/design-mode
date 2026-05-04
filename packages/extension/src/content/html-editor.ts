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
  recordDomChange(elementId, selector, 'delete', el.tagName.toLowerCase(), el.outerHTML);
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
  recordDomChange(id, generateSelector(el), 'insert', el.tagName.toLowerCase());
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
  recordDomChange(id, generateSelector(clone), 'duplicate', clone.tagName.toLowerCase());
  return id;
}

export function deleteElement(elementId: string): boolean {
  const el = getElementById(elementId);
  if (!el || isDmElement(el)) return false;
  const selector = generateSelector(el);
  const tagName = el.tagName.toLowerCase();
  const html = el.outerHTML;
  recordDomChange(elementId, selector, 'delete', tagName, html);
  el.remove();
  return true;
}

export function moveElement(elementId: string, direction: 'up' | 'down'): boolean {
  const el = getElementById(elementId);
  if (!el || isDmElement(el) || !el.parentElement) return false;
  if (direction === 'up' && el.previousElementSibling) {
    el.parentElement.insertBefore(el, el.previousElementSibling);
    recordDomChange(elementId, generateSelector(el), 'move', el.tagName.toLowerCase());
    return true;
  } else if (direction === 'down' && el.nextElementSibling) {
    el.parentElement.insertBefore(el.nextElementSibling, el);
    recordDomChange(elementId, generateSelector(el), 'move', el.tagName.toLowerCase());
    return true;
  }
  return false;
}

export function hasClipboard(): boolean {
  return clipboard !== null;
}

function isDmElement(el: HTMLElement): boolean {
  return el.id?.startsWith('dm-') || el.classList?.contains('dm-comment-pin') || false;
}
