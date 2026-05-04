// ============================================================
// Design Mode — Inspector (hover, click to select elements)
// ============================================================

import { getOrAssignId, getElementById, getElementRect, generateSelector, getBreadcrumbs, getComputedStyleSubset } from './helpers';
import { showHover, hideHover, showSelect, updateSelectPosition, isOverlayElement } from './overlays';

export type IconInfo = { library: string; name: string; availableIcons?: string[] };

export type ElementInfo = {
  id: string; tagName: string; className: string; elementId: string;
  breadcrumbs: string[]; computedStyles: Record<string, string>;
  rect: { top: number; left: number; width: number; height: number; bottom: number; right: number };
  textContent: string | null; innerHTML: string;
  attributes: Record<string, string>; selector: string;
  iconInfo?: IconInfo;
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
  return {
    id, tagName: el.tagName.toLowerCase(),
    className: typeof el.className === 'string' ? el.className : '',
    elementId: el.id || '', breadcrumbs: getBreadcrumbs(el),
    computedStyles: getComputedStyleSubset(el),
    rect: getElementRect(el),
    textContent: el.textContent?.slice(0, 500) || null,
    innerHTML: el.innerHTML.slice(0, 2000),
    attributes: attrs, selector: generateSelector(el),
    iconInfo: detectIconInfo(el),
  };
}

function isDMElement(el: HTMLElement): boolean {
  return isOverlayElement(el) || !!el.id?.startsWith('dm-') ||
    !!el.className?.toString?.().includes?.('dm-comment-pin') ||
    !!el.closest?.('.dm-comment-pin') ||
    !!el.closest('#dm-panel') || !!el.closest('#dm-toolbar');
}

function handleMouseOver(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t || isDMElement(t)) return;
  showHover(t);

  // Debounced hover info for side panel design tab
  const hovId = getOrAssignId(t);
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
  lastHoveredId = null;
  if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
  try { chrome.runtime.sendMessage({ type: 'ELEMENT_HOVERED_INFO', payload: null }); } catch {}
}

function handleClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t || isDMElement(t)) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  // Cancel any pending hover info — selection takes precedence
  if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
  lastHoveredId = null;
  try { chrome.runtime.sendMessage({ type: 'ELEMENT_HOVERED_INFO', payload: null }); } catch {}
  selectedId = getOrAssignId(t);
  showSelect(t);
  if (onSelect) onSelect(buildElementInfo(t));
}

export function enableInspect(cb: SelectionCallback) {
  if (active) return;
  active = true; onSelect = cb;
  document.documentElement.style.cursor = 'crosshair';
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', handleClick, true);
}

export function disableInspect() {
  if (!active) return;
  active = false;
  document.documentElement.style.cursor = '';
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('mouseout', handleMouseOut, true);
  document.removeEventListener('click', handleClick, true);
  hideHover();
  lastHoveredId = null;
  if (hoverDebounceTimer) { clearTimeout(hoverDebounceTimer); hoverDebounceTimer = null; }
}

export function isInspectActive() { return active; }

// Keep selection overlay in sync on scroll/resize
function refreshSelection() {
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
