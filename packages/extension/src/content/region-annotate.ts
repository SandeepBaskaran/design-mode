// ============================================================
// Design Mode — Region (freeform rectangle) annotation draw mode
// ============================================================
//
// Lets the user drop a comment box anywhere on the page (Figma-style) without
// selecting a DOM element — drag a rectangle, or just click to drop a default
// box. On release it reports the rectangle in document coordinates AND leaves
// a persistent yellow "pending" box on the page that stays until the comment
// is added or cancelled. Self-contained: it owns the capture overlay and the
// pending box.

import { Z_INDEX } from '../shared';

export type Region = { x: number; y: number; w: number; h: number };

const MIN_SIZE = 8;     // px — below this a drag counts as a click
const DEFAULT_W = 180;  // px — default dropped-box size for a plain click
const DEFAULT_H = 110;

let active = false;
let overlay: HTMLDivElement | null = null;
let rectEl: HTMLDivElement | null = null;
let pendingBox: HTMLDivElement | null = null;
let onComplete: ((region: Region | null) => void) | null = null;

export function isRegionDrawActive(): boolean { return active; }

// The persistent yellow box shown while the user composes the comment. Lives
// in document coordinates (position:absolute) so it scrolls with the page.
// Visually matches the committed region box in comments.ts.
function showPendingRegionBox(region: Region) {
  clearPendingRegionBox();
  const box = document.createElement('div');
  box.className = 'dm-comment-region';
  Object.assign(box.style, {
    position: 'absolute',
    left: region.x + 'px', top: region.y + 'px',
    width: region.w + 'px', height: region.h + 'px',
    boxSizing: 'border-box', borderRadius: '4px', pointerEvents: 'none',
    border: '1.5px dashed #FBBF24', background: 'rgba(251,191,36,0.12)',
    zIndex: String(Z_INDEX.COMMENT_PIN - 1),
  });
  document.documentElement.appendChild(box);
  pendingBox = box;
}

export function clearPendingRegionBox() {
  if (pendingBox) { pendingBox.remove(); pendingBox = null; }
}

export function startRegionDraw(complete: (region: Region | null) => void) {
  if (active) cancelRegionDraw();
  active = true;
  onComplete = complete;

  overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: String(Z_INDEX.DRAWING_CANVAS),
    cursor: 'crosshair', background: 'rgba(0,0,0,0.04)',
  });
  document.documentElement.appendChild(overlay);

  let startX = 0, startY = 0, drawing = false;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drawing = true;
    startX = e.clientX; startY = e.clientY;
    rectEl = document.createElement('div');
    Object.assign(rectEl.style, {
      position: 'fixed', boxSizing: 'border-box',
      border: '1.5px dashed #FBBF24', background: 'rgba(251,191,36,0.12)',
      borderRadius: '4px', pointerEvents: 'none',
      left: startX + 'px', top: startY + 'px', width: '0px', height: '0px',
    });
    overlay!.appendChild(rectEl);
    overlay!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (!drawing || !rectEl) return;
    const left = Math.min(startX, e.clientX);
    const top = Math.min(startY, e.clientY);
    rectEl.style.left = left + 'px';
    rectEl.style.top = top + 'px';
    rectEl.style.width = Math.abs(e.clientX - startX) + 'px';
    rectEl.style.height = Math.abs(e.clientY - startY) + 'px';
  };

  const onUp = (e: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    let region: Region;
    if (w >= MIN_SIZE && h >= MIN_SIZE) {
      // Drag → a sized box.
      const left = Math.min(startX, e.clientX);
      const top = Math.min(startY, e.clientY);
      region = { x: left + window.scrollX, y: top + window.scrollY, w, h };
    } else {
      // Plain click → drop a default-sized box anchored at the pointer,
      // clamped so it stays within the viewport.
      const left = Math.max(0, Math.min(e.clientX, window.innerWidth - DEFAULT_W - 4));
      const top = Math.max(0, Math.min(e.clientY, window.innerHeight - DEFAULT_H - 4));
      region = { x: left + window.scrollX, y: top + window.scrollY, w: DEFAULT_W, h: DEFAULT_H };
    }
    finish(region);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(null); }
  };

  overlay.addEventListener('pointerdown', onDown);
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey, true);

  function finish(region: Region | null) {
    window.removeEventListener('keydown', onKey, true);
    teardown();
    // Leave a persistent box on the page while the user composes — it stays
    // until the comment is added (clearPendingRegionBox) or cancelled.
    if (region) showPendingRegionBox(region);
    const cb = onComplete; onComplete = null; active = false;
    if (cb) cb(region);
  }
}

export function cancelRegionDraw() {
  if (!active) return;
  teardown();
  const cb = onComplete; onComplete = null; active = false;
  if (cb) cb(null);
}

function teardown() {
  if (rectEl) { rectEl.remove(); rectEl = null; }
  if (overlay) { overlay.remove(); overlay = null; }
}
