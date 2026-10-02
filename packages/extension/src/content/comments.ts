// ============================================================
// Design Mode — Comments System
// ============================================================

import { Z_INDEX } from '../shared';
import { COMMENT_STORE_ERROR, type CommentOperation, type CommentResult } from '../background/comment-store';
import { restoreElementAnchor, reserveIdsAtLeast } from './helpers';

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

async function commentRequest(operation: CommentOperation): Promise<CommentResult> {
  const response = await browser.runtime.sendMessage({ type: 'COMMENT_STORE', pageUrl: window.location.href, operation });
  if (!response?.ok) throw new Error(response?.error || COMMENT_STORE_ERROR);
  return response;
}
const pinElements = new Map<string, HTMLDivElement>();
const regionBoxes = new Map<string, HTMLDivElement>();
let conflictingAnchorIds = new Set<string>();
const activeComments = new Map<string, CommentData>();
let anchorsCurrent = () => true;
let anchorObserver: MutationObserver | undefined;
const boundAnchors = new Map<string, HTMLElement>();
const draggingPins = new Map<string, object>();
let repaintFrame = 0;
const overlaySelector = '#dm-hover, #dm-select, #dm-dim-label, #dm-hover-margin, #dm-hover-padding, #dm-select-margin, #dm-select-padding, #dm-axis-guides, #dm-distance, #dm-resize-dots, #dm-toolbar, #dm-computed-layout, .dm-multi-overlay, .dm-comment-pin, .dm-comment-region';

function isOverlayNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return !!element?.closest(overlaySelector);
}

function schedulePinRepaint() {
  if (repaintFrame) return;
  const generation = pinGeneration;
  repaintFrame = requestAnimationFrame(() => {
    repaintFrame = 0;
    if (!pinsActive || generation !== pinGeneration) return;
    if (!anchorsCurrent()) { hideAllPins(); return; }
    const comments = [...activeComments.values()];
    // Finish geometry reads before any pin DOM writes.
    const rects = comments.map(comment => commentAnchorRect(comment));
    comments.forEach((comment, index) => showCommentPin(comment, index + 1, rects[index]));
  });
}

function onAnchorMutations(records: MutationRecord[]) {
  if (!pinsActive) return;
  if (!anchorsCurrent()) { hideAllPins(); return; }
  if (!records.some(record => {
    if (isOverlayNode(record.target)) return false;
    if (record.type !== 'childList') return true;
    return [...record.addedNodes, ...record.removedNodes].some(node => !isOverlayNode(node));
  })) return;
  // Rebind in the mutation checkpoint, before hover can allocate a fresh ID.
  anchorObserver?.disconnect();
  try {
    prepareCommentAnchors([...activeComments.values()]);
    schedulePinRepaint();
  } finally {
    observeAnchors();
  }
}

function observeAnchors() {
  if (!pinsActive) return;
  anchorObserver ??= new MutationObserver(onAnchorMutations);
  anchorObserver.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['id', 'class', 'style', 'data-dm-id'],
  });
}

function prepareCommentAnchors(comments: CommentData[]) {
  reserveIdsAtLeast(comments.map(c => c.elementId));
  conflictingAnchorIds = new Set();
  const selectors = new Map<string, string>();
  for (const c of comments) {
    if (c.region || !c.elementId) continue;
    if (selectors.has(c.elementId) && selectors.get(c.elementId) !== c.selector) {
      conflictingAnchorIds.add(c.elementId);
    }
    selectors.set(c.elementId, c.selector);
  }
  boundAnchors.clear();
  for (const [id, selector] of selectors) {
    if (conflictingAnchorIds.has(id)) continue;
    // Validate even already-stamped anchors, but do not stamp them again.
    let matches: NodeListOf<HTMLElement>;
    try { matches = document.querySelectorAll<HTMLElement>(selector); }
    catch { continue; }
    if (matches.length !== 1) continue;
    const target = matches[0];
    const stamped = document.querySelectorAll<HTMLElement>(`[data-dm-id="${CSS.escape(id)}"]`);
    if (stamped.length === 1 && stamped[0] === target) boundAnchors.set(id, target);
    else {
      const restored = restoreElementAnchor(id, selector);
      if (restored) boundAnchors.set(id, restored);
    }
  }
}

// Pair with the import DOM journal: retain the original pin identities and
// restore their indexes after an unsuccessful replacement.
export function captureCommentPinsRollback(): () => void {
  const pins = new Map(pinElements), regions = new Map(regionBoxes);
  const conflicts = conflictingAnchorIds;
  const anchors = new Map(boundAnchors);
  const comments = new Map(activeComments);
  return () => {
    conflictingAnchorIds = conflicts;
    boundAnchors.clear();
    for (const [id, anchor] of anchors) boundAnchors.set(id, anchor);
    activeComments.clear();
    for (const [id, comment] of comments) activeComments.set(id, comment);
    pinElements.forEach(p => p.remove()); regionBoxes.forEach(p => p.remove());
    pinElements.clear(); regionBoxes.clear();
    for (const [id, pin] of pins) pinElements.set(id, pin);
    for (const [id, box] of regions) regionBoxes.set(id, box);
  };
}

export async function loadComments(): Promise<CommentData[]> {
  return (await commentRequest({ kind: 'read' })).comments;
}

export async function addComment(elementId: string, selector: string, text: string): Promise<CommentData> {
  const comment: CommentData = {
    id: crypto.randomUUID(), elementId, selector, text,
    timestamp: Date.now(), updatedAt: Date.now(), pageUrl: window.location.href,
  };
  const { comments: all } = await commentRequest({ kind: 'add', comment });
  showCommentPin(comment, getPinOrdinal(comment.id, all));
  return comment;
}

export async function addRegionComment(region: { x: number; y: number; w: number; h: number }, selector: string, text: string): Promise<CommentData> {
  const comment: CommentData = {
    id: crypto.randomUUID(), elementId: '', selector, text, region,
    timestamp: Date.now(), updatedAt: Date.now(), pageUrl: window.location.href,
  };
  const { comments: all } = await commentRequest({ kind: 'add', comment });
  showCommentPin(comment, getPinOrdinal(comment.id, all));
  return comment;
}

export async function updateComment(id: string, text: string): Promise<CommentData | null> {
  const { comments, comment } = await commentRequest({ kind: 'update', id, text });
  if (comment) showCommentPin(comment, getPinOrdinal(id, comments));
  return comment;
}

// Toggle / set the resolved flag. Updates `updatedAt` so the side panel can
// show an "edited" hint if the user wants that.
export async function setCommentResolved(id: string, resolved: boolean): Promise<CommentData | null> {
  const { comments: all, comment: c } = await commentRequest({ kind: 'resolve', id, resolved });
  if (!c) return null;
  // Re-render the pin so its visual state matches.
  showCommentPin(c, getPinOrdinal(c.id, all));
  return c;
}

// Persist a manually-dragged pin offset.
export async function setCommentPinOffset(id: string, offset: { x: number; y: number } | null): Promise<CommentData | null> {
  const generation = pinGeneration;
  const pageUrl = window.location.href;
  const drag = draggingPins.get(id);
  try {
    const { comment } = await commentRequest({ kind: 'offset', id, offset });
    if (pinsActive && generation === pinGeneration && pageUrl === window.location.href && anchorsCurrent()
      && draggingPins.get(id) === drag && comment && activeComments.has(id)) {
      activeComments.set(id, comment);
    }
    return comment;
  } finally {
    if (draggingPins.get(id) === drag) {
      draggingPins.delete(id);
      if (pinsActive && generation === pinGeneration) schedulePinRepaint();
    }
  }
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
  await commentRequest({ kind: 'delete', id });
  activeComments.delete(id);
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
  if (conflictingAnchorIds.has(comment.elementId)) return null;
  const el = boundAnchors.get(comment.elementId);
  return el ? el.getBoundingClientRect() : null;
}

export function showCommentPin(comment: CommentData, ordinal?: number, measuredRect?: DOMRect | null) {
  if (!pinsActive) return;
  activeComments.set(comment.id, comment);
  if (measuredRect === undefined && !boundAnchors.has(comment.elementId)) {
    prepareCommentAnchors([...activeComments.values()]);
  }
  if (draggingPins.has(comment.id)) return;
  const rect0 = measuredRect === undefined ? commentAnchorRect(comment) : measuredRect;
  if (!rect0) {
    // Keep stale/ambiguous comments in storage, never leave a misleading pin.
    pinElements.get(comment.id)?.remove();
    pinElements.delete(comment.id);
    return;
  }
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
  const bg = isResolved ? 'rgb(163, 163, 163)' : 'rgb(251, 191, 36)';
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
    // Drag-to-reposition. Holding the pin and dragging snaps it to the
    // pointer; releasing persists the offset. Uses pointer events for
    // smooth-tracking without HTML5 DnD's drag-image awkwardness.
    pin.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let dragged = false;
      const drag = {};
      draggingPins.set(comment.id, drag);
      (pin as HTMLElement).setPointerCapture(e.pointerId);
      const onMove = (mv: PointerEvent) => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        if (!dragged && Math.abs(dx) + Math.abs(dy) < 4) return; // small-jitter threshold
        dragged = true;
        const rect = commentAnchorRect(activeComments.get(comment.id) ?? comment) || new DOMRect(mv.clientX, mv.clientY, 0, 0);
        const offX = mv.clientX - (rect.left + rect.width);
        const offY = mv.clientY - rect.top;
        (pin as HTMLElement).style.top = Math.max(MARGIN, Math.min(mv.clientY - PIN_SIZE / 2, window.innerHeight - PIN_SIZE - MARGIN)) + 'px';
        (pin as HTMLElement).style.left = Math.max(MARGIN, Math.min(mv.clientX - PIN_SIZE / 2, window.innerWidth - PIN_SIZE - MARGIN)) + 'px';
        (pin as any).__dmPendingOffset = { x: offX, y: offY };
      };
      const onUp = (up: PointerEvent) => {
        (pin as HTMLElement).releasePointerCapture(e.pointerId);
        pin!.removeEventListener('pointermove', onMove);
        pin!.removeEventListener('pointerup', onUp);
        pin!.removeEventListener('pointercancel', onUp);
        if (draggingPins.get(comment.id) !== drag) return;
        if (dragged && up.type !== 'pointercancel') {
          (pin as any).__dmJustDragged = true;
          const off = (pin as any).__dmPendingOffset;
          if (off) {
            window.dispatchEvent(new CustomEvent('dm-comment-pin-dragged', {
              detail: { commentId: comment.id, offset: off },
            }));
          }
        } else {
          draggingPins.delete(comment.id);
          schedulePinRepaint();
        }
      };
      pin!.addEventListener('pointercancel', onUp);
      pin!.addEventListener('pointermove', onMove);
      pin!.addEventListener('pointerup', onUp);
    });
  }
  pin.onclick = (e) => {
    if ((pin as any).__dmJustDragged) { (pin as any).__dmJustDragged = false; return; }
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('dm-comment-clicked', { detail: comment }));
  };
  // Update visual state every render — colour, ordinal label, opacity.
  if (pin.style.background !== bg) pin.style.background = bg;
  const opacity = isResolved ? '0.6' : '1';
  if (pin.style.opacity !== opacity) pin.style.opacity = opacity;
  const label = ordinal ? String(ordinal) : '';
  const markup = '<span style="transform:rotate(45deg);pointer-events:none;font-family:SF Mono,Monaco,monospace;text-decoration:' + (isResolved ? 'line-through' : 'none') + ';">' + (label || '💬') + '</span>';
  if (pin.innerHTML !== markup) pin.innerHTML = markup;
  const title = (label ? '#' + label + ' ' : '') + (isResolved ? '✓ ' : '') + (comment.text.slice(0, 60));
  if (pin.title !== title) pin.title = title;
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
  const nextTop = Math.max(MARGIN, Math.min(top, window.innerHeight - PIN_SIZE - MARGIN)) + 'px';
  const nextLeft = Math.max(MARGIN, Math.min(left, window.innerWidth - PIN_SIZE - MARGIN)) + 'px';
  if (pin.style.top !== nextTop) pin.style.top = nextTop;
  if (pin.style.left !== nextLeft) pin.style.left = nextLeft;
}

// Gates the scroll/resize repaint handlers below — without this flag the
// pins would repaint themselves on every scroll AFTER hideAllPins() ran,
// which leaks them through any panel-close cleanup.
let pinsActive = false;
let pinGeneration = 0;

export async function showAllPins(isCurrent = () => true) {
  pinsActive = true;
  const generation = ++pinGeneration;
  const pageUrl = window.location.href;
  anchorsCurrent = () => window.location.href === pageUrl && isCurrent();
  const all = await loadComments();
  if (!pinsActive || generation !== pinGeneration || !anchorsCurrent()) return;
  const pageComments = all
    .filter(c => c.pageUrl === window.location.href)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  prepareCommentAnchors(pageComments);
  activeComments.clear();
  pageComments.forEach((c, i) => showCommentPin(c, i + 1));
  observeAnchors();
}

export function hideAllPins() {
  pinsActive = false;
  pinGeneration++;
  cancelAnimationFrame(repaintFrame);
  repaintFrame = 0;
  draggingPins.clear();
  boundAnchors.clear();
  anchorObserver?.disconnect();
  activeComments.clear();
  pinElements.forEach(pin => pin.remove());
  pinElements.clear();
  regionBoxes.forEach(box => box.remove());
  regionBoxes.clear();
}

export async function restoreCommentPins(isCurrent = () => true): Promise<void> {
  await showAllPins(isCurrent);
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

// Off-page comments must survive a replacement on this URL.
export async function persistPageComments(incoming: CommentData[]): Promise<CommentData[]> {
  const comments = incoming
    .map(c => ({ ...c, pageUrl: window.location.href }))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const result = await commentRequest({ kind: 'replacePage', comments });
  return result.comments;
}

export function renderPageComments(incoming: CommentData[]): void {
  pinGeneration++;
  activeComments.clear();
  const stamped = incoming
    .map(c => ({ ...c, pageUrl: window.location.href }))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  prepareCommentAnchors(stamped);
  pinElements.forEach(p => p.remove());
  pinElements.clear();
  regionBoxes.forEach(b => b.remove());
  regionBoxes.clear();
  if (pinsActive) stamped.forEach((c, i) => showCommentPin(c, i + 1));
}

// Reposition pins on scroll/resize. The `pinsActive` gate prevents these
// from re-creating pins after the panel closed.
function repositionAll() {
  if (pinsActive) schedulePinRepaint();
}
window.addEventListener('scroll', () => { void repositionAll(); }, { passive: true, capture: true });
window.addEventListener('resize', () => { void repositionAll(); }, { passive: true });

// Hide every comment pin AND region box out of a screenshot capture, then
// restore. `display` (not `visibility`) so any pin/region transition can't
// defer the hide past the capture frame.
const pinCapturePrevDisplay = new WeakMap<HTMLElement, string>();
export function setPinsHiddenForCapture(hidden: boolean) {
  document.querySelectorAll<HTMLElement>('.dm-comment-pin, .dm-comment-region').forEach((el) => {
    if (hidden) {
      pinCapturePrevDisplay.set(el, el.style.display);
      el.style.display = 'none';
    } else {
      el.style.display = pinCapturePrevDisplay.get(el) ?? '';
    }
  });
}
