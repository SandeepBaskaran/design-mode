// ============================================================
// Design Mode — Comments System
// ============================================================

import { Z_INDEX } from '../shared';
import { getElementById, getElementRect, generateSelector, escapeAttr } from './helpers';

export interface CommentData {
  id: string; elementId: string; selector: string;
  text: string; timestamp: number; updatedAt: number;
  pageUrl: string;
  // Optional fields. Older saved comments don't have these and load fine.
  resolved?: boolean;
  // Override for the pin's auto-position (top-right of the element box).
  // The values are absolute offsets in CSS pixels relative to the
  // element's `getBoundingClientRect().top` / `.left + width`.
  pinOffset?: { x: number; y: number };
  // Region (freeform rectangle) comments aren't anchored to a DOM element.
  // Geometry is stored in *document* coordinates (page-relative, scroll-
  // independent) so the box stays put as the page scrolls. When `region`
  // is set, `elementId` is empty and `selector` holds the nearest container
  // for agent context only.
  region?: { x: number; y: number; w: number; h: number };
}

const STORAGE_KEY = 'dm-comments';
const pinElements = new Map<string, HTMLDivElement>();
const regionBoxes = new Map<string, HTMLDivElement>();

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

export async function addRegionComment(region: { x: number; y: number; w: number; h: number }, selector: string, text: string): Promise<CommentData> {
  const comment: CommentData = {
    id: crypto.randomUUID(), elementId: '', selector, text, region,
    timestamp: Date.now(), updatedAt: Date.now(), pageUrl: window.location.href,
  };
  const all = await loadComments();
  all.push(comment);
  await saveComments(all);
  showCommentPin(comment, getPinOrdinal(comment.id, all));
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

// Toggle / set the resolved flag. Updates `updatedAt` so the side panel can
// show an "edited" hint if the user wants that.
export async function setCommentResolved(id: string, resolved: boolean): Promise<CommentData | null> {
  const all = await loadComments();
  const c = all.find(x => x.id === id);
  if (!c) return null;
  c.resolved = resolved;
  c.updatedAt = Date.now();
  await saveComments(all);
  // Re-render the pin so its visual state matches.
  showCommentPin(c, getPinOrdinal(c.id, all));
  return c;
}

// Persist a manually-dragged pin offset.
export async function setCommentPinOffset(id: string, offset: { x: number; y: number } | null): Promise<CommentData | null> {
  const all = await loadComments();
  const c = all.find(x => x.id === id);
  if (!c) return null;
  if (offset) c.pinOffset = offset; else delete (c as any).pinOffset;
  await saveComments(all);
  return c;
}

// Pin numbering — 1-based, matches the order comments were created in this
// browser-tab session. Cheap to recompute on every render.
function getPinOrdinal(commentId: string, all: CommentData[]): number {
  const sameUrl = all
    .filter(c => c.pageUrl === window.location.href)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const idx = sameUrl.findIndex(c => c.id === commentId);
  return idx >= 0 ? idx + 1 : 1;
}

export async function deleteComment(id: string) {
  const all = await loadComments();
  await saveComments(all.filter(x => x.id !== id));
  const pin = pinElements.get(id);
  if (pin) { pin.remove(); pinElements.delete(id); }
  const box = regionBoxes.get(id);
  if (box) { box.remove(); regionBoxes.delete(id); }
}

// Resolve the anchor rect in viewport coordinates for either kind of
// comment: an element's live bounding box, or a region's document-space
// rectangle translated by the current scroll offset.
function commentAnchorRect(comment: CommentData): DOMRect | null {
  if (comment.region) {
    const r = comment.region;
    return new DOMRect(r.x - window.scrollX, r.y - window.scrollY, r.w, r.h);
  }
  const el = getElementById(comment.elementId);
  return el ? el.getBoundingClientRect() : null;
}

export function showCommentPin(comment: CommentData, ordinal?: number) {
  const rect0 = commentAnchorRect(comment);
  if (!rect0) return;
  const PIN_SIZE = 28;
  const MARGIN = 8;
  const isResolvedColor = !!comment.resolved;

  // Region comments draw a translucent outline box behind the pin so the
  // flagged area is visible. Element comments rely on the element itself.
  if (comment.region) {
    let box = regionBoxes.get(comment.id);
    if (!box) {
      box = document.createElement('div');
      box.className = 'dm-comment-region';
      Object.assign(box.style, {
        position: 'fixed', zIndex: String(Z_INDEX.COMMENT_PIN - 1),
        boxSizing: 'border-box', borderRadius: '4px', pointerEvents: 'none',
      });
      document.documentElement.appendChild(box);
      regionBoxes.set(comment.id, box);
    }
    const accent = isResolvedColor ? '#A3A3A3' : '#FBBF24';
    box.style.border = '1.5px dashed ' + accent;
    box.style.background = isResolvedColor ? 'rgba(163,163,163,0.08)' : 'rgba(251,191,36,0.10)';
    box.style.left = rect0.left + 'px';
    box.style.top = rect0.top + 'px';
    box.style.width = rect0.width + 'px';
    box.style.height = rect0.height + 'px';
  }

  let pin = pinElements.get(comment.id);
  // Pin colour by status — resolved pins fade to grey-green; open pins
  // stay yellow. Both keep the tear-drop shape so they're recognisable
  // as Design Mode comments at a glance.
  const isResolved = !!comment.resolved;
  const bg = isResolved ? '#A3A3A3' : '#FBBF24';
  if (!pin) {
    pin = document.createElement('div');
    pin.className = 'dm-comment-pin';
    Object.assign(pin.style, {
      position: 'fixed', zIndex: String(Z_INDEX.COMMENT_PIN),
      width: PIN_SIZE + 'px', height: PIN_SIZE + 'px', borderRadius: '50% 50% 50% 0',
      color: '#000', fontSize: '11px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', fontWeight: '700', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transform: 'rotate(-45deg)', transition: 'transform 0.15s ease, opacity 0.15s ease',
      pointerEvents: 'auto',
    });
    document.documentElement.appendChild(pin);
    pinElements.set(comment.id, pin);
    pin.addEventListener('click', (e) => {
      // Suppress the click that follows a drag — the dragend handler sets
      // a brief "just dragged" flag so we don't open the side panel after
      // repositioning.
      if ((pin as any).__dmJustDragged) { (pin as any).__dmJustDragged = false; return; }
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('dm-comment-clicked', { detail: comment }));
    });
    // Drag-to-reposition. Holding the pin and dragging snaps it to the
    // pointer; releasing persists the offset. Uses pointer events for
    // smooth-tracking without HTML5 DnD's drag-image awkwardness.
    pin.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let dragged = false;
      (pin as HTMLElement).setPointerCapture(e.pointerId);
      const onMove = (mv: PointerEvent) => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        if (!dragged && Math.abs(dx) + Math.abs(dy) < 4) return; // small-jitter threshold
        dragged = true;
        const rect = commentAnchorRect(comment) || new DOMRect(mv.clientX, mv.clientY, 0, 0);
        const offX = (mv.clientX - (rect.left + rect.width)) + PIN_SIZE / 2;
        const offY = (mv.clientY - rect.top) + PIN_SIZE / 2;
        (pin as HTMLElement).style.top = Math.max(MARGIN, Math.min(mv.clientY - PIN_SIZE / 2, window.innerHeight - PIN_SIZE - MARGIN)) + 'px';
        (pin as HTMLElement).style.left = Math.max(MARGIN, Math.min(mv.clientX - PIN_SIZE / 2, window.innerWidth - PIN_SIZE - MARGIN)) + 'px';
        (pin as any).__dmPendingOffset = { x: offX, y: offY };
      };
      const onUp = () => {
        (pin as HTMLElement).releasePointerCapture(e.pointerId);
        pin!.removeEventListener('pointermove', onMove);
        pin!.removeEventListener('pointerup', onUp);
        if (dragged) {
          (pin as any).__dmJustDragged = true;
          const off = (pin as any).__dmPendingOffset;
          if (off) {
            window.dispatchEvent(new CustomEvent('dm-comment-pin-dragged', {
              detail: { commentId: comment.id, offset: off },
            }));
          }
        }
      };
      pin!.addEventListener('pointermove', onMove);
      pin!.addEventListener('pointerup', onUp);
    });
  }
  // Update visual state every render — colour, ordinal label, opacity.
  pin.style.background = bg;
  pin.style.opacity = isResolved ? '0.6' : '1';
  const label = ordinal ? String(ordinal) : '';
  pin.innerHTML = '<span style="transform:rotate(45deg);pointer-events:none;font-family:SF Mono,Monaco,monospace;">' + (label || '💬') + '</span>';
  pin.title = (label ? '#' + label + ' ' : '') + (isResolved ? '✓ ' : '') + (comment.text.slice(0, 60));
  // Position. Honours pinOffset when present; otherwise auto-positions at
  // the top-right corner of the anchor (element box or region rect).
  const rect = rect0;
  let top: number, left: number;
  if (comment.pinOffset) {
    left = rect.left + rect.width - PIN_SIZE / 2 + comment.pinOffset.x;
    top = rect.top - PIN_SIZE / 2 + comment.pinOffset.y;
  } else {
    top = rect.top - PIN_SIZE / 2;
    left = rect.left + rect.width - PIN_SIZE / 2;
  }
  pin.style.top = Math.max(MARGIN, Math.min(top, window.innerHeight - PIN_SIZE - MARGIN)) + 'px';
  pin.style.left = Math.max(MARGIN, Math.min(left, window.innerWidth - PIN_SIZE - MARGIN)) + 'px';
}

// Gates the scroll/resize repaint handlers below — without this flag the
// pins would repaint themselves on every scroll AFTER hideAllPins() ran,
// which leaks them through any panel-close cleanup.
let pinsActive = false;

export async function showAllPins() {
  pinsActive = true;
  const all = await loadComments();
  const pageComments = all
    .filter(c => c.pageUrl === window.location.href)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  pageComments.forEach((c, i) => showCommentPin(c, i + 1));
}

export function hideAllPins() {
  pinsActive = false;
  pinElements.forEach(pin => pin.remove());
  pinElements.clear();
  regionBoxes.forEach(box => box.remove());
  regionBoxes.clear();
}

export async function getPageComments(): Promise<CommentData[]> {
  const all = await loadComments();
  // Always return in creation order. The side panel renders rows in array
  // order, the pin ordinal is creation-order, and Copy Prompt walks the
  // array — sorting once at the read site keeps all three consistent and
  // means an import doesn't have to worry about the on-disk order.
  return all
    .filter(c => c.pageUrl === window.location.href)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// Replaces all comments for the current page. Off-page comments are left
// alone so an import on one URL doesn't wipe another URL's data.
//
// Imported comments carry the *original* page's data-dm-id values for
// their target elements. Those ids almost never line up with the new
// page's stamps, so the pin's `getElementById(elementId)` lookup misses
// and the pin silently fails to render — leaving the row in the changes
// tab without anything on the page to anchor to ("residue"). For each
// imported comment, fall back to its saved selector and stamp the
// recorded elementId onto the matching element so subsequent lookups,
// and the pin render, all succeed.
export async function replacePageComments(incoming: CommentData[]): Promise<void> {
  const all = await loadComments();
  const others = all.filter(c => c.pageUrl !== window.location.href);
  const dataAttr = 'data-dm-id';
  const stamped = incoming
    .map(c => ({ ...c, pageUrl: window.location.href }))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  for (const c of stamped) {
    if (!c.elementId) continue;
    const byId = document.querySelector('[' + dataAttr + '="' + c.elementId + '"]');
    if (byId) continue;
    if (!c.selector) continue;
    try {
      const bySel = document.querySelector(c.selector) as HTMLElement | null;
      if (bySel) bySel.setAttribute(dataAttr, c.elementId);
    } catch { /* invalid selector — skip rather than throw */ }
  }
  await saveComments([...others, ...stamped]);
  pinElements.forEach(p => p.remove());
  pinElements.clear();
  regionBoxes.forEach(b => b.remove());
  regionBoxes.clear();
  if (pinsActive) await showAllPins();
}

// Reposition pins on scroll/resize. The `pinsActive` gate prevents these
// from re-creating pins after the panel closed.
async function repositionAll() {
  if (!pinsActive) return;
  const all = await loadComments();
  const pageComments = all
    .filter(c => c.pageUrl === window.location.href)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  pageComments.forEach((c, i) => showCommentPin(c, i + 1));
}
window.addEventListener('scroll', () => { void repositionAll(); }, { passive: true, capture: true });
window.addEventListener('resize', () => { void repositionAll(); }, { passive: true });
