// ============================================================
// Phase 6: Rearrange Mode
// Section detection, click-to-capture, free drag reorder,
// layout pattern analysis, rearrange notes
// ============================================================

import { Z_INDEX, DATA_ATTR } from '../shared';
import { getOrAssignId, getElementById, getElementRect, generateSelector } from './helpers';
import type { PageSection, RearrangeNote } from '@shared/types';

let rearrangeMode = false;
let detectedSections: PageSection[] = [];
let sectionOverlays: HTMLDivElement[] = [];
let capturedSection: PageSection | null = null;
let draggedEl: HTMLElement | null = null;
let dragPlaceholder: HTMLDivElement | null = null;
let dragStartY = 0;
let rearrangeNotes: RearrangeNote[] = [];

// ── Section Detection ──

export function detectSections(): PageSection[] {
  detectedSections = [];
  // Look for semantic sections
  const candidates = document.querySelectorAll('section, [role="region"], main > div, article, .section, [class*="section"], [class*="container"]');
  const seen = new Set<HTMLElement>();

  // Also detect children of body/main that look like sections
  const mainEl = document.querySelector('main') || document.body;
  for (const child of Array.from(mainEl.children) as HTMLElement[]) {
    if (child.offsetHeight > 50 && !child.id?.startsWith('dm-') && !seen.has(child)) {
      seen.add(child);
      addSection(child);
    }
  }

  for (const el of candidates) {
    const htmlEl = el as HTMLElement;
    if (seen.has(htmlEl) || htmlEl.offsetHeight < 50 || htmlEl.id?.startsWith('dm-')) continue;
    seen.add(htmlEl);
    addSection(htmlEl);
  }

  return detectedSections;
}

function addSection(el: HTMLElement) {
  const id = getOrAssignId(el);
  const rect = getElementRect(el);
  const children = Array.from(el.children)
    .filter(c => (c as HTMLElement).offsetHeight > 0)
    .map(c => getOrAssignId(c as HTMLElement));

  const cs = window.getComputedStyle(el);
  let layout = 'block';
  if (cs.display === 'flex') layout = cs.flexDirection.startsWith('column') ? 'flex-col' : 'flex-row';
  else if (cs.display === 'grid') layout = 'grid';

  const label = getSectionLabel(el);

  detectedSections.push({
    id,
    selector: generateSelector(el),
    label,
    rect,
    children,
    layoutPattern: layout,
  });
}

function getSectionLabel(el: HTMLElement): string {
  // Try heading
  const heading = el.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading?.textContent?.trim()) return heading.textContent.trim().slice(0, 40);
  // Try aria-label
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.slice(0, 40);
  // Try id or class
  if (el.id && !el.id.startsWith('dm-')) return el.id;
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/)[0];
    if (cls && cls.length < 30) return cls;
  }
  return el.tagName.toLowerCase();
}

// ── Visual Section Highlighting ──

export function showSectionOverlays() {
  hideSectionOverlays();
  for (const section of detectedSections) {
    const el = getElementById(section.id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      top: rect.top + 'px', left: rect.left + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
      border: '2px dashed #8B5CF6',
      background: 'rgba(139, 92, 246, 0.05)',
      borderRadius: '8px',
      pointerEvents: 'none',
      zIndex: String(Z_INDEX.SELECT_OVERLAY),
    });
    // Label
    const label = document.createElement('div');
    Object.assign(label.style, {
      position: 'absolute', top: '-24px', left: '0',
      padding: '2px 8px', background: '#8B5CF6', color: 'white',
      fontSize: '11px', fontWeight: '600', borderRadius: '4px 4px 0 0',
      whiteSpace: 'nowrap',
    });
    label.textContent = section.label;
    overlay.appendChild(label);
    document.documentElement.appendChild(overlay);
    sectionOverlays.push(overlay);
  }
}

export function hideSectionOverlays() {
  sectionOverlays.forEach(o => o.remove());
  sectionOverlays = [];
}

// ── Rearrange Mode ──

export function enableRearrange(): PageSection[] {
  rearrangeMode = true;
  const sections = detectSections();
  showSectionOverlays();
  enableDragReorder();
  return sections;
}

export function disableRearrange() {
  rearrangeMode = false;
  hideSectionOverlays();
  disableDragReorder();
}

export function isRearrangeMode(): boolean { return rearrangeMode; }

// ── Free Drag Reorder ──

function enableDragReorder() {
  for (const section of detectedSections) {
    const el = getElementById(section.id);
    if (!el) continue;
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    el.addEventListener('dragend', onDragEnd);
  }
}

function disableDragReorder() {
  for (const section of detectedSections) {
    const el = getElementById(section.id);
    if (!el) continue;
    el.removeAttribute('draggable');
    el.removeEventListener('dragstart', onDragStart);
    el.removeEventListener('dragover', onDragOver);
    el.removeEventListener('drop', onDrop);
    el.removeEventListener('dragend', onDragEnd);
  }
}

function onDragStart(e: DragEvent) {
  draggedEl = e.currentTarget as HTMLElement;
  if (draggedEl) {
    draggedEl.style.opacity = '0.5';
    e.dataTransfer?.setData('text/plain', draggedEl.getAttribute(DATA_ATTR) || '');
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  if (!target || target === draggedEl) return;
  target.style.borderTop = '3px solid #8B5CF6';
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  if (!target || !draggedEl || target === draggedEl) return;
  target.style.borderTop = '';

  // Insert before the target
  const parent = target.parentElement;
  if (parent) {
    parent.insertBefore(draggedEl, target);
  }
  draggedEl.style.opacity = '1';

  // Refresh overlays
  detectSections();
  showSectionOverlays();
}

function onDragEnd(e: DragEvent) {
  if (draggedEl) {
    draggedEl.style.opacity = '1';
    draggedEl = null;
  }
  // Clear all border highlights
  for (const section of detectedSections) {
    const el = getElementById(section.id);
    if (el) el.style.borderTop = '';
  }
}

// ── Layout Pattern Analysis ──

export function analyzeLayoutPatterns(): Array<{ section: string; pattern: string; childCount: number; suggestion?: string }> {
  const analysis: Array<{ section: string; pattern: string; childCount: number; suggestion?: string }> = [];
  for (const section of detectedSections) {
    const el = getElementById(section.id);
    if (!el) continue;
    const cs = window.getComputedStyle(el);
    const children = Array.from(el.children).filter(c => (c as HTMLElement).offsetHeight > 0);
    const childCount = children.length;
    let suggestion: string | undefined;

    // Suggest improvements
    if (cs.display === 'block' && childCount > 3) {
      const childWidths = children.map(c => (c as HTMLElement).getBoundingClientRect().width);
      const allSimilar = childWidths.every(w => Math.abs(w - childWidths[0]) < 20);
      if (allSimilar) suggestion = 'Consider using CSS Grid for equal-width children';
    }
    if (cs.display === 'flex' && childCount > 6) {
      suggestion = 'Consider flex-wrap or grid for many children';
    }

    analysis.push({
      section: section.label,
      pattern: section.layoutPattern,
      childCount,
      suggestion,
    });
  }
  return analysis;
}

// ── Rearrange Notes ──

export function addRearrangeNote(sectionId: string, text: string, newOrder: number[]): RearrangeNote {
  const note: RearrangeNote = {
    id: crypto.randomUUID(),
    sectionId,
    text,
    newOrder,
  };
  rearrangeNotes.push(note);
  return note;
}

export function getRearrangeNotes(): RearrangeNote[] { return [...rearrangeNotes]; }
export function clearRearrangeNotes() { rearrangeNotes = []; }
export function getDetectedSections(): PageSection[] { return [...detectedSections]; }
