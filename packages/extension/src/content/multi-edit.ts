// ============================================================
// Design Mode — Multi-Element Editing
// Apply changes to matching elements using semantic class detection
// ============================================================

import { getOrAssignId, getElementById } from './helpers';

export interface MultiEditTarget {
  elementId: string;
  element: HTMLElement;
  selector: string;
  matchScore: number;
}

// Sensitivity levels: 1 = exact match only, 5 = very broad matching
let sensitivity = 3;

export function getSensitivity(): number { return sensitivity; }
export function setSensitivity(s: number) { sensitivity = Math.max(1, Math.min(5, s)); }

/**
 * Find elements that match the selected element based on sensitivity.
 * Higher sensitivity = broader matching (more elements).
 */
export function findMatchingElements(elementId: string): MultiEditTarget[] {
  const el = getElementById(elementId);
  if (!el) return [];

  const targets: MultiEditTarget[] = [];
  const tagName = el.tagName.toLowerCase();
  const classList = Array.from(el.classList).filter(c => !c.startsWith('dm-'));
  const parentTag = el.parentElement?.tagName.toLowerCase() || '';

  // Build candidate selectors based on sensitivity
  const candidates = document.querySelectorAll('*');

  for (const candidate of candidates) {
    if (candidate === el) continue;
    if ((candidate as HTMLElement).id?.startsWith('dm-')) continue;
    if (candidate.closest('#dm-toolbar, #dm-panel, .dm-comment-pin')) continue;

    let score = 0;
    const cTag = candidate.tagName.toLowerCase();
    const cClasses = Array.from(candidate.classList).filter(c => !c.startsWith('dm-'));

    // Level 1: Same tag name
    if (cTag === tagName) score += 1;

    // Level 2: Shared classes (semantic matching)
    const sharedClasses = classList.filter(c => cClasses.includes(c));
    score += sharedClasses.length * 2;

    // Level 3: Same parent tag
    if (candidate.parentElement?.tagName.toLowerCase() === parentTag) score += 1;

    // Level 4: Similar computed styles
    if (sensitivity >= 4) {
      const cs1 = window.getComputedStyle(el);
      const cs2 = window.getComputedStyle(candidate as HTMLElement);
      if (cs1.fontSize === cs2.fontSize) score += 1;
      if (cs1.fontWeight === cs2.fontWeight) score += 1;
      if (cs1.color === cs2.color) score += 1;
    }

    // Level 5: Same tag name is enough
    const threshold = [999, 5, 3, 2, 1, 0][sensitivity] || 3;

    if (score >= threshold) {
      const id = getOrAssignId(candidate as HTMLElement);
      const selector = buildSelector(candidate as HTMLElement);
      targets.push({ elementId: id, element: candidate as HTMLElement, selector, matchScore: score });
    }
  }

  // Sort by score descending
  targets.sort((a, b) => b.matchScore - a.matchScore);
  return targets;
}

/**
 * Apply a style change to all matching elements.
 */
export function applyToMatching(
  elementId: string, property: string, value: string
): { applied: number; targets: MultiEditTarget[] } {
  const targets = findMatchingElements(elementId);
  for (const t of targets) {
    (t.element.style as any)[property] = value;
  }
  return { applied: targets.length, targets };
}

/**
 * Highlight all matching elements temporarily.
 */
export function highlightMatching(elementId: string): (() => void) {
  const targets = findMatchingElements(elementId);
  const overlays: HTMLElement[] = [];

  for (const t of targets) {
    const rect = t.element.getBoundingClientRect();
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      top: rect.top + 'px', left: rect.left + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
      background: 'rgba(139, 92, 246, 0.15)',
      border: '1px dashed rgba(139, 92, 246, 0.5)',
      pointerEvents: 'none',
      zIndex: '2147483640',
      transition: 'opacity 0.2s',
    });
    document.documentElement.appendChild(overlay);
    overlays.push(overlay);
  }

  // Return cleanup function
  return () => {
    overlays.forEach(o => o.remove());
  };
}

function buildSelector(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).filter(c => !c.startsWith('dm-')).slice(0, 2).join('.');
  return classes ? `${tag}.${classes}` : tag;
}
