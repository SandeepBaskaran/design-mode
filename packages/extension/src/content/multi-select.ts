// ============================================================
// Multi-select mode: pick N elements, then any style edit fans out to
// every selected element (one change record per element so the Changes
// tab and Copy Prompt show the full impact).
// ============================================================

import { getElementById, getElementRect } from './helpers';
import { Z_INDEX } from '../shared';

let active = false;
const selectedIds = new Set<string>();
const overlays = new Map<string, HTMLDivElement>();

export function isMultiSelectActive(): boolean { return active; }

export function getSelectedIds(): string[] {
  return Array.from(selectedIds);
}

export function enableMultiSelect(): void {
  if (active) return;
  active = true;
  refreshOverlays();
  window.addEventListener('scroll', refreshOverlays, true);
  window.addEventListener('resize', refreshOverlays);
}

export function disableMultiSelect(): void {
  if (!active) return;
  active = false;
  selectedIds.clear();
  removeAllOverlays();
  window.removeEventListener('scroll', refreshOverlays, true);
  window.removeEventListener('resize', refreshOverlays);
}

export function toggleSelection(id: string): void {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  refreshOverlays();
}

export function clearSelection(): void {
  selectedIds.clear();
  removeAllOverlays();
}

function ensureOverlayFor(id: string): HTMLDivElement {
  let ov = overlays.get(id);
  if (ov && ov.isConnected) return ov;
  ov = document.createElement('div');
  ov.className = 'dm-multi-overlay';
  Object.assign(ov.style, {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: String(Z_INDEX.SELECT_OVERLAY),
    border: '2px dashed #4F9EFF',
    borderRadius: '2px',
    background: 'rgba(79,158,255,0.05)',
    transition: 'all 80ms ease-out',
  });
  document.documentElement.appendChild(ov);
  overlays.set(id, ov);
  return ov;
}

function removeOverlayFor(id: string) {
  const ov = overlays.get(id);
  if (ov) {
    ov.remove();
    overlays.delete(id);
  }
}

function removeAllOverlays() {
  for (const [, ov] of overlays) ov.remove();
  overlays.clear();
}

export function refreshOverlays(): void {
  // Drop overlays for de-selected ids.
  for (const id of Array.from(overlays.keys())) {
    if (!selectedIds.has(id)) removeOverlayFor(id);
  }
  // Position / create overlays for selected ids.
  for (const id of selectedIds) {
    const el = getElementById(id);
    if (!el) { removeOverlayFor(id); continue; }
    const ov = ensureOverlayFor(id);
    const rect = getElementRect(el);
    Object.assign(ov.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }
}
