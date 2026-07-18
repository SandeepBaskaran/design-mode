// ============================================================
// Multi-select mode: pick N elements, then any style edit fans out to
// every selected element (one change record per element so the Changes
// tab and Copy Prompt show the full impact).
// ============================================================

import { getElementById, getElementRect, getOrAssignId } from './helpers';
import { Z_INDEX } from '../shared';
import { showPairwiseDistances, hideDistance } from './measure-guides';

// ── Matching layers ─────────────────────────────────────────────────
// Finds elements "like" the reference so one edit can fan out to all of
// them via the existing multi-select machinery: same tag sharing a class;
// classless elements match classless same-tag peers under the same
// parent tag. Feeds the "Select matching layers" checkbox.
const MAX_MATCHING = 100;

function classSet(el: HTMLElement): Set<string> {
  const raw = typeof el.className === 'string' ? el.className : '';
  return new Set(raw.trim().split(/\s+/).filter(c => c && !c.startsWith('dm-')));
}

export function findMatchingElements(elementId: string): string[] {
  const ref = getElementById(elementId);
  if (!ref) return [];
  const refClasses = classSet(ref);
  const refParentTag = ref.parentElement?.tagName || '';
  const ids: string[] = [getOrAssignId(ref)];

  const candidates = document.getElementsByTagName(ref.tagName);
  for (let i = 0; i < candidates.length && ids.length < MAX_MATCHING; i++) {
    const el = candidates[i] as HTMLElement;
    if (el === ref) continue;
    if (el.closest('[class^="dm-"], [id^="dm-"]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const classes = classSet(el);
    const match = refClasses.size > 0
      ? [...refClasses].some(c => classes.has(c))
      : classes.size === 0 && el.parentElement?.tagName === refParentTag;
    if (match) ids.push(getOrAssignId(el));
  }
  return ids;
}

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
  hideDistance();
  window.removeEventListener('scroll', refreshOverlays, true);
  window.removeEventListener('resize', refreshOverlays);
}

export function toggleSelection(id: string): void {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  refreshOverlays();
}

// Replace the entire selection set in one shot. Used by the side panel
// when modifier-driven layer clicks compute the next set explicitly,
// instead of toggling one id at a time through the page.
export function setSelectedIds(ids: string[]): void {
  selectedIds.clear();
  for (const id of ids) selectedIds.add(id);
  refreshOverlays();
}

export function clearSelection(): void {
  selectedIds.clear();
  removeAllOverlays();
  hideDistance();
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
  // Pairwise spacing readout between the selected elements.
  showPairwiseDistances(Array.from(selectedIds));
}
