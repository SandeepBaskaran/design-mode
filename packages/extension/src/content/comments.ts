// ============================================================
// Design Mode — Comments System
// ============================================================

import { Z_INDEX } from '../shared';
import { getElementById, getElementRect, generateSelector, escapeAttr } from './helpers';

export interface CommentData {
  id: string; elementId: string; selector: string;
  text: string; timestamp: number; updatedAt: number;
  pageUrl: string;
}

const STORAGE_KEY = 'dm-comments';
const pinElements = new Map<string, HTMLDivElement>();

export async function loadComments(): Promise<CommentData[]> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || [];
  } catch { return []; }
}

export async function saveComments(comments: CommentData[]) {
  try { await chrome.storage.local.set({ [STORAGE_KEY]: comments }); } catch {}
}

export async function addComment(elementId: string, selector: string, text: string): Promise<CommentData> {
  const comment: CommentData = {
    id: crypto.randomUUID(), elementId, selector, text,
    timestamp: Date.now(), updatedAt: Date.now(), pageUrl: window.location.href,
  };
  const all = await loadComments();
  all.push(comment);
  await saveComments(all);
  showCommentPin(comment);
  return comment;
}

export async function updateComment(id: string, text: string): Promise<CommentData | null> {
  const all = await loadComments();
  const c = all.find(x => x.id === id);
  if (!c) return null;
  c.text = text; c.updatedAt = Date.now();
  await saveComments(all);
  return c;
}

export async function deleteComment(id: string) {
  const all = await loadComments();
  await saveComments(all.filter(x => x.id !== id));
  const pin = pinElements.get(id);
  if (pin) { pin.remove(); pinElements.delete(id); }
}

export function showCommentPin(comment: CommentData) {
  const el = getElementById(comment.elementId);
  if (!el) return;
  const PIN_SIZE = 28;
  const MARGIN = 8;
  let pin = pinElements.get(comment.id);
  if (!pin) {
    pin = document.createElement('div');
    pin.className = 'dm-comment-pin';
    Object.assign(pin.style, {
      position: 'fixed', zIndex: String(Z_INDEX.COMMENT_PIN),
      width: PIN_SIZE + 'px', height: PIN_SIZE + 'px', borderRadius: '50% 50% 50% 0',
      background: '#FBBF24', color: '#000', fontSize: '12px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', fontWeight: '700', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transform: 'rotate(-45deg)', transition: 'transform 0.15s ease',
      pointerEvents: 'auto',
    });
    pin.innerHTML = '<span style="transform:rotate(45deg);pointer-events:none">💬</span>';
    pin.title = comment.text.slice(0, 60);
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('dm-comment-clicked', { detail: comment }));
    });
    document.documentElement.appendChild(pin);
    pinElements.set(comment.id, pin);
  }
  const rect = el.getBoundingClientRect();
  const rawTop = rect.top - PIN_SIZE / 2;
  const rawLeft = rect.left + rect.width - PIN_SIZE / 2;
  pin.style.top = Math.max(MARGIN, Math.min(rawTop, window.innerHeight - PIN_SIZE - MARGIN)) + 'px';
  pin.style.left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - PIN_SIZE - MARGIN)) + 'px';
}

export async function showAllPins() {
  const all = await loadComments();
  const pageComments = all.filter(c => c.pageUrl === window.location.href);
  for (const c of pageComments) showCommentPin(c);
}

export function hideAllPins() {
  pinElements.forEach(pin => pin.remove());
  pinElements.clear();
}

export async function getPageComments(): Promise<CommentData[]> {
  const all = await loadComments();
  return all.filter(c => c.pageUrl === window.location.href);
}

// Reposition pins on scroll/resize (pins use fixed positioning, recalculate on scroll)
window.addEventListener('scroll', async () => {
  const pageComments = await getPageComments();
  for (const c of pageComments) showCommentPin(c);
}, { passive: true, capture: true });
window.addEventListener('resize', async () => {
  const pageComments = await getPageComments();
  for (const c of pageComments) showCommentPin(c);
}, { passive: true });
