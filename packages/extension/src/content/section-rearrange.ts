// ============================================================
// Design Mode — Section Rearrange
// Detects the page's top-level sections, reorders them on request,
// and records each move through the change tracker so it lands in
// the Changes tab, exports, and MCP like any other DOM change.
// ============================================================

import { getOrAssignId, getElementById, generateSelector, getElementRect } from './helpers';
import { recordDomChange } from './change-tracker';

// Mirrors PageSection in @design-mode/shared types.
interface PageSection {
  id: string;
  selector: string;
  label: string;
  rect: { top: number; left: number; width: number; height: number; bottom: number; right: number };
  children: string[];
  layoutPattern: string;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META', 'TITLE']);
const SEMANTIC_LABELS: Record<string, string> = {
  HEADER: 'Header', NAV: 'Navigation', MAIN: 'Main', ASIDE: 'Sidebar', FOOTER: 'Footer',
};
const MIN_SECTION_HEIGHT = 40;

// Parent whose children were last presented as sections. reorderSection
// validates against it so a stale panel view can't move the wrong nodes.
let sectionRoot: HTMLElement | null = null;

function isSectionCandidate(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (SKIP_TAGS.has(el.tagName)) return false;
  // Skip Design Mode's own UI (overlays, pins, injected styles).
  if (el.id.startsWith('dm-') || el.className?.toString().startsWith('dm-')) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  // Fixed/absolute elements (toasts, modals, cookie bars) aren't part of
  // the document flow a reorder would affect. Sticky headers still are.
  if (cs.position === 'fixed' || cs.position === 'absolute') return false;
  return el.getBoundingClientRect().height >= MIN_SECTION_HEIGHT;
}

// Where the page's real content stack lives: <main> when present, else
// <body>, descending through framework wrapper divs (#root, #__next, …)
// that have only one meaningful child.
function findSectionRoot(): HTMLElement {
  let root: HTMLElement = document.querySelector('main') || document.body;
  for (let hops = 0; hops < 4; hops++) {
    const kids = Array.from(root.children).filter(isSectionCandidate);
    if (kids.length === 1 && kids[0].children.length > 0) { root = kids[0]; continue; }
    break;
  }
  return root;
}

function headingText(el: HTMLElement): string | null {
  const h = el.querySelector('h1, h2, h3, [role="heading"]');
  const t = h?.textContent?.trim();
  return t ? (t.length > 32 ? t.slice(0, 31) + '…' : t) : null;
}

function sectionLabel(el: HTMLElement): string {
  const semantic = SEMANTIC_LABELS[el.tagName];
  const heading = headingText(el);
  if (semantic) return heading ? `${semantic} — ${heading}` : semantic;
  if (heading) return heading;
  if (el.id) return `#${el.id}`;
  const cls = typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\s+/)[0] : '';
  return el.tagName.toLowerCase() + cls;
}

function layoutPattern(el: HTMLElement): string {
  const cs = window.getComputedStyle(el);
  if (cs.display === 'grid' || cs.display === 'inline-grid') {
    const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    return cols > 1 ? `grid · ${cols} cols` : 'grid';
  }
  if (cs.display === 'flex' || cs.display === 'inline-flex') {
    return cs.flexDirection.startsWith('column') ? 'flex · column' : 'flex · row';
  }
  return 'stack';
}

function childSummaries(el: HTMLElement): string[] {
  return Array.from(el.children)
    .filter(c => c instanceof HTMLElement && !SKIP_TAGS.has(c.tagName))
    .slice(0, 6)
    .map(c => {
      const h = c as HTMLElement;
      const cls = typeof h.className === 'string' && h.className.trim()
        ? '.' + h.className.trim().split(/\s+/)[0] : '';
      return h.tagName.toLowerCase() + (h.id ? `#${h.id}` : cls);
    });
}

export function detectSections(): PageSection[] {
  sectionRoot = findSectionRoot();
  return Array.from(sectionRoot.children)
    .filter(isSectionCandidate)
    .map(el => ({
      id: getOrAssignId(el),
      selector: generateSelector(el),
      label: sectionLabel(el),
      rect: getElementRect(el),
      children: childSummaries(el),
      layoutPattern: layoutPattern(el),
    }));
}

// Move a detected section to `targetIndex` within the section list and
// record it as a DOM move. Returns the new order of section ids, or null
// when the section vanished or the index is unchanged/out of range.
export function reorderSection(sectionId: string, targetIndex: number): { newOrder: string[] } | null {
  const el = getElementById(sectionId);
  if (!el || !sectionRoot || el.parentElement !== sectionRoot) return null;
  const sections = Array.from(sectionRoot.children).filter(isSectionCandidate);
  const from = sections.indexOf(el);
  if (from < 0 || targetIndex < 0 || targetIndex >= sections.length || targetIndex === from) return null;

  const parent = sectionRoot;
  const dmParentId = parent !== document.body && parent !== document.documentElement
    ? getOrAssignId(parent) : undefined;
  const origin = {
    parentSelector: generateSelector(parent),
    index: Array.from(parent.children).indexOf(el),
    parentId: dmParentId,
  };

  // Insert before the section that currently occupies targetIndex (or at
  // the end). Working off the filtered section list keeps interleaved
  // non-section nodes (scripts, hidden divs) where they are.
  const before = targetIndex > from ? sections[targetIndex].nextSibling : sections[targetIndex];
  parent.insertBefore(el, before);
  try { el.scrollIntoView({ block: 'nearest' }); } catch { /* detached iframe */ }

  recordDomChange(
    sectionId, generateSelector(el), 'move', el.tagName.toLowerCase(),
    undefined,
    { parentSelector: generateSelector(parent), index: Array.from(parent.children).indexOf(el), parentId: dmParentId },
    origin,
  );
  const newOrder = Array.from(parent.children).filter(isSectionCandidate).map(s => getOrAssignId(s));
  return { newOrder };
}
