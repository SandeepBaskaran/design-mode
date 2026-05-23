// ============================================================
// Design Mode — Inspector (hover, click to select elements)
// ============================================================

import { getOrAssignId, getElementById, getElementRect, generateSelector, getBreadcrumbs, getComputedStyleSubset } from './helpers';
import { showHover, hideHover, showSelect, updateSelectPosition, isOverlayElement } from './overlays';
import { isMultiSelectActive, enableMultiSelect, toggleSelection, getSelectedIds } from './multi-select';
import { showAxisGuides, hideAxisGuides, showDistance, hideDistance, showPairwiseDistances, showResizeDots, repositionResizeDots } from './measure-guides';

export type IconInfo = { library: string; name: string; availableIcons?: string[] };

export type ElementInfo = {
  id: string; tagName: string; className: string; elementId: string;
  breadcrumbs: string[]; computedStyles: Record<string, string>;
  rect: { top: number; left: number; width: number; height: number; bottom: number; right: number };
  textContent: string | null; innerHTML: string;
  attributes: Record<string, string>; selector: string;
  iconInfo?: IconInfo;
  parentDisplay?: string;
  parentFlexDirection?: string;
  parentJustifyContent?: string;
  parentAlignItems?: string;
  parentGap?: string;
};

export type SelectionCallback = (info: ElementInfo) => void;

let active = false;
let selectedId: string | null = null;
let onSelect: SelectionCallback | null = null;

// Debounced hover info
let hoverDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastHoveredId: string | null = null;

export function getSelectedElementId() { return selectedId; }
export function setSelectedElementId(id: string | null) { selectedId = id; }

function detectIconInfo(el: HTMLElement): IconInfo | undefined {
  const tag = el.tagName.toUpperCase();
  const classes = typeof el.className === 'string' ? Array.from(el.classList) : [];

  if (tag === 'SVG') {
    // Lucide: class="lucide lucide-chevron-right"
    const lucideClass = classes.find(c => c.startsWith('lucide-') && c !== 'lucide');
    if (lucideClass) {
      const name = lucideClass.replace('lucide-', '');
      const allLucide = Array.from(document.querySelectorAll('svg[class*="lucide-"]'))
        .flatMap(s => Array.from(s.classList).filter(c => c.startsWith('lucide-') && c !== 'lucide'));
      return { library: 'lucide', name, availableIcons: [...new Set(allLucide)] };
    }
    // FontAwesome SVG: data-icon attribute
    const faIcon = el.getAttribute('data-icon');
    if (faIcon) return { library: 'fontawesome', name: faIcon };
  }

  // FontAwesome <i class="fa fa-heart">
  if (tag === 'I') {
    const faClass = classes.find(c => c.startsWith('fa-'));
    if (faClass) return { library: 'fontawesome', name: faClass.replace('fa-', '') };
  }

  return undefined;
}

export function buildElementInfo(el: HTMLElement): ElementInfo {
  const id = getOrAssignId(el);
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (!a.name.startsWith('data-dm')) attrs[a.name] = a.value;
  }
  // innerHTML is the source of truth for the rich-text editor in the side
  // panel. The previous 2000-char cap was silently truncating long
  // paragraphs — saving would then write back the truncated HTML and
  // destroy the tail. Cap is now 100 KB, which covers the longest
  // realistic editable text without making chrome.runtime messages
  // unreasonably big.
  const innerHTML = el.innerHTML.length > 100_000
    ? el.innerHTML.slice(0, 100_000)
    : el.innerHTML;
  const parent = el.parentElement;
  const pcs = parent ? window.getComputedStyle(parent) : null;
  return {
    id, tagName: el.tagName.toLowerCase(),
    className: typeof el.className === 'string' ? el.className : '',
    elementId: el.id || '', breadcrumbs: getBreadcrumbs(el),
    computedStyles: getComputedStyleSubset(el),
    rect: getElementRect(el),
    textContent: el.textContent?.slice(0, 500) || null,
    innerHTML,
    attributes: attrs, selector: generateSelector(el),
    iconInfo: detectIconInfo(el),
    parentDisplay: pcs?.display || '',
    parentFlexDirection: pcs?.flexDirection || '',
    parentJustifyContent: pcs?.justifyContent || '',
    parentAlignItems: pcs?.alignItems || '',
    parentGap: pcs?.gap || '',
  };
}

function isDMElement(el: HTMLElement): boolean {
  // Any Design Mode UI is transparent to the inspector: the hover/select/dim
  // overlays, the axis-guide / distance / resize-dot layers (all `dm-*` ids),
  // the panel, the toolbar, and comment pins. Without this, hovering a resize
  // dot would draw hover outlines + distance pills on our own chrome.
  return isOverlayElement(el) ||
    !!el.closest?.('[id^="dm-"]') ||
    !!el.closest?.('.dm-comment-pin');
}

function handleMouseOver(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t || isDMElement(t)) return;
  showHover(t);

  const hovId = getOrAssignId(t);
  const hovRect = getElementRect(t);
  showAxisGuides(hovRect, 'hover');
  // With a single element selected, hovering another shows the edge-to-edge
  // distances between them. In multi-select the pairwise distances own the
  // distance layer, so don't overwrite them with a hover measurement.
  if (!isMultiSelectActive() && selectedId && selectedId !== hovId) {
    const sel = getElementById(selectedId);
    if (sel) showDistance(getElementRect(sel), hovRect);
  }

  // Debounced hover info for side panel design tab
  if (hovId === lastHoveredId) return;
  lastHoveredId = hovId;
  if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
  hoverDebounceTimer = setTimeout(() => {
    if (!active) return;
    const info = buildElementInfo(t);
    try {
      chrome.runtime.sendMessage({
        type: 'ELEMENT_HOVERED_INFO',
        payload: {
          ...info,
          element: undefined,
          imgSrc: t.tagName === 'IMG' ? (t as HTMLImageElement).src : undefined,
          textContent: t.textContent?.trim()?.slice(0, 500) || undefined,
          hasChildElements: t.children.length > 0,
        },
      });
    } catch {}
  }, 100);
}

function handleMouseOut() {
  hideHover();
  hideAxisGuides();
  // Single-select hover measurement clears; multi-select pairwise distances
  // are restored so they survive the mouse leaving an element.
  if (isMultiSelectActive()) showPairwiseDistances(getSelectedIds());
  else hideDistance();
  lastHoveredId = null;
  if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
  try { chrome.runtime.sendMessage({ type: 'ELEMENT_HOVERED_INFO', payload: null }); } catch {}
}

// Stop the browser starting a text selection on mousedown (especially
// Shift+click, which extends a selection). Inspect mode hijacks clicks for
// element selection, so a page text selection is never wanted here — matches
// VisBug, which keeps the viewport selection-free while its tool is active.
function handleMouseDown(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t || isDMElement(t)) return;
  e.preventDefault();
  if (e.shiftKey) window.getSelection()?.removeAllRanges();
}

function handleClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t || isDMElement(t)) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  // Cancel any pending hover info — selection takes precedence
  if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
  lastHoveredId = null;
  try { chrome.runtime.sendMessage({ type: 'ELEMENT_HOVERED_INFO', payload: null }); } catch {}
  const id = getOrAssignId(t);
  // Shift-click (or any click while multi-select is already on) builds the
  // measurement selection set. Shift bootstraps the mode and folds in the
  // current single selection as an anchor so the first shift-click yields a
  // measurable pair.
  if (e.shiftKey || isMultiSelectActive()) {
    if (!isMultiSelectActive()) enableMultiSelect();
    if (getSelectedIds().length === 0 && selectedId && selectedId !== id) toggleSelection(selectedId);
    toggleSelection(id);
    selectedId = id;
    showSelect(t);
    showResizeDots(t);
    try {
      chrome.runtime.sendMessage({
        type: 'MULTI_SELECT_UPDATE',
        payload: { ids: getSelectedIds() },
      });
    } catch {}
    if (onSelect) onSelect(buildElementInfo(t));
    return;
  }
  selectedId = id;
  showSelect(t);
  showResizeDots(t);
  hideDistance();
  if (onSelect) onSelect(buildElementInfo(t));
}

export function enableInspect(cb: SelectionCallback) {
  if (active) return;
  active = true; onSelect = cb;
  document.documentElement.style.cursor = 'crosshair';
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('click', handleClick, true);
}

export function disableInspect() {
  if (!active) return;
  active = false;
  document.documentElement.style.cursor = '';
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('mouseout', handleMouseOut, true);
  document.removeEventListener('mousedown', handleMouseDown, true);
  document.removeEventListener('click', handleClick, true);
  hideHover();
  lastHoveredId = null;
  if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
}

export function isInspectActive() { return active; }

// Keep selection overlay in sync on scroll/resize
function refreshSelection() {
  repositionResizeDots();
  if (!selectedId) return;
  const el = getElementById(selectedId);
  if (el) updateSelectPosition(el);
}
window.addEventListener('scroll', refreshSelection, true);
window.addEventListener('resize', refreshSelection);

export function getComputedStylesBlock(el: Element): string {
  const cs = window.getComputedStyle(el);
  const base = window.getComputedStyle(document.createElement('div'));
  const props = [
    'color','background-color','background-image','font-family','font-size',
    'font-weight','line-height','letter-spacing','text-align','text-transform',
    'display','flex-direction','justify-content','align-items','gap',
    'width','height','min-width','max-width','min-height','max-height',
    'padding','padding-top','padding-right','padding-bottom','padding-left',
    'margin','margin-top','margin-right','margin-bottom','margin-left',
    'border','border-radius','border-color','border-width','border-style',
    'position','top','right','bottom','left','z-index',
    'opacity','transform','transition','animation','box-shadow','filter',
    'backdrop-filter','overflow','cursor','pointer-events','visibility',
  ];
  const selector = el.id
    ? '#' + el.id
    : el.tagName.toLowerCase() + ([...el.classList].slice(0, 2).map(c => '.' + c).join(''));
  const lines: string[] = [];
  for (const prop of props) {
    const val = cs.getPropertyValue(prop);
    const bval = base.getPropertyValue(prop);
    if (val && val !== bval && val !== 'none' && val !== 'normal' && val !== '0px' && val !== 'auto' && val !== 'rgba(0, 0, 0, 0)') {
      lines.push('  ' + prop + ': ' + val + ';');
    }
  }
  return selector + ' {\n' + lines.join('\n') + '\n}';
}
