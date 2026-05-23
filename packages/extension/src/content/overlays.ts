// ============================================================
// Design Mode — Overlay Management (hover + selection highlights)
// ============================================================

import { Z_INDEX } from '../shared';
import { getElementRect, type Rect } from './helpers';

let hoverOverlay: HTMLDivElement | null = null;
let selectOverlay: HTMLDivElement | null = null;
let dimensionLabel: HTMLDivElement | null = null;
// Set after destroyOverlays — prevents in-flight mouseover handlers from
// re-creating overlay elements via ensureOverlays() after the panel closed.
let teardown = false;

const OVERLAY_BASE = {
  position: 'absolute', pointerEvents: 'none', borderRadius: '2px',
  transition: 'all 80ms ease-out', display: 'none',
} as const;

export function ensureOverlays() {
  if (teardown) return; // panel closed — refuse to re-paint
  if (!hoverOverlay) {
    hoverOverlay = document.createElement('div');
    hoverOverlay.id = 'dm-hover';
    Object.assign(hoverOverlay.style, {
      ...OVERLAY_BASE,
      zIndex: String(Z_INDEX.HOVER_OVERLAY),
      border: '2px solid #4F9EFF',
      backgroundColor: 'rgba(79,158,255,0.06)',
    });
    document.documentElement.appendChild(hoverOverlay);
  }
  if (!selectOverlay) {
    selectOverlay = document.createElement('div');
    selectOverlay.id = 'dm-select';
    Object.assign(selectOverlay.style, {
      ...OVERLAY_BASE,
      zIndex: String(Z_INDEX.SELECT_OVERLAY),
      border: '2px solid #FF6B35',
    });
    document.documentElement.appendChild(selectOverlay);
  }
  if (!dimensionLabel) {
    dimensionLabel = document.createElement('div');
    dimensionLabel.id = 'dm-dim-label';
    Object.assign(dimensionLabel.style, {
      position: 'absolute', pointerEvents: 'none',
      zIndex: String(Z_INDEX.SELECT_OVERLAY + 1),
      background: '#FF6B35', color: '#fff', fontSize: '10px',
      fontFamily: 'monospace', padding: '2px 6px', borderRadius: '3px',
      display: 'none', whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(dimensionLabel);
  }
}

function positionOverlayFromRect(overlay: HTMLDivElement, rect: Rect) {
  Object.assign(overlay.style, {
    display: 'block',
    top: rect.top + 'px', left: rect.left + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
  });
}

export function showHover(el: HTMLElement) {
  if (teardown) return;
  ensureOverlays();
  if (!hoverOverlay) return;
  positionOverlayFromRect(hoverOverlay, getElementRect(el));
}

export function hideHover() {
  if (hoverOverlay) hoverOverlay.style.display = 'none';
}

export function showSelect(el: HTMLElement) {
  if (teardown) return;
  ensureOverlays();
  if (!selectOverlay || !dimensionLabel) return;
  const rect = getElementRect(el);
  positionOverlayFromRect(selectOverlay, rect);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  dimensionLabel.textContent = `${w} × ${h}`;
  Object.assign(dimensionLabel.style, {
    display: 'block',
    top: (rect.top + rect.height + 4) + 'px',
    left: rect.left + 'px',
  });
}

export function hideSelect() {
  if (selectOverlay) selectOverlay.style.display = 'none';
  if (dimensionLabel) dimensionLabel.style.display = 'none';
}

export function updateSelectPosition(el: HTMLElement) {
  if (selectOverlay?.style.display !== 'none') showSelect(el);
}

// During a live drag the 80ms ease lags the box behind the cursor; turn it
// off so the orange outline + dimension label track the element instantly.
export function setOverlayTransitions(enabled: boolean) {
  const t = enabled ? 'all 80ms ease-out' : 'none';
  if (selectOverlay) selectOverlay.style.transition = t;
  if (dimensionLabel) dimensionLabel.style.transition = t;
  if (hoverOverlay) hoverOverlay.style.transition = t;
}

export function destroyOverlays() {
  teardown = true;
  [hoverOverlay, selectOverlay, dimensionLabel].forEach(el => el?.remove());
  hoverOverlay = selectOverlay = dimensionLabel = null;
}

// Called from enable() so a re-opened panel can paint overlays again.
export function resetOverlayTeardown() {
  teardown = false;
}

export function isOverlayElement(el: HTMLElement): boolean {
  return el === hoverOverlay || el === selectOverlay || el === dimensionLabel;
}
