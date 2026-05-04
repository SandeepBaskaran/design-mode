// ============================================================
// Phase 2: Spatial & Context Intelligence
// Smart naming, spatial context, accessibility, nearby elements,
// container detection, page layout, shadow DOM support
// ============================================================

import { getElementById, getOrAssignId, getElementRect, generateSelector } from './helpers';
import type { SpatialContext, SpatialRelation, AccessibilityInfo } from '@shared/types';

// ── Smart Element Naming ──

export function getSmartName(el: HTMLElement): string {
  // Priority: aria-label > id > role > text content > tag+class
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.slice(0, 40);

  if (el.id && !el.id.startsWith('dm-')) {
    return formatId(el.id);
  }

  const role = el.getAttribute('role');
  if (role) return formatRole(role, el);

  // Semantic tag names
  const semanticNames: Record<string, string> = {
    nav: 'Navigation', header: 'Header', footer: 'Footer',
    main: 'Main Content', aside: 'Sidebar', article: 'Article',
    section: 'Section', form: 'Form', button: 'Button',
    a: 'Link', img: 'Image', video: 'Video', audio: 'Audio',
    input: 'Input', textarea: 'Textarea', select: 'Dropdown',
    table: 'Table', ul: 'List', ol: 'Ordered List',
    h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
    h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
  };
  const tag = el.tagName.toLowerCase();
  if (semanticNames[tag]) {
    const text = el.textContent?.trim().slice(0, 20);
    return text ? `${semanticNames[tag]}: "${text}"` : semanticNames[tag];
  }

  // Text content
  const directText = getDirectText(el);
  if (directText) return `"${directText.slice(0, 30)}"`;

  // Class-based
  if (el.className && typeof el.className === 'string') {
    const cls = cleanClassName(el.className);
    if (cls) return `${tag}.${cls}`;
  }

  return tag;
}

function formatId(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function formatRole(role: string, el: HTMLElement): string {
  const text = el.textContent?.trim().slice(0, 20);
  const roleName = role.charAt(0).toUpperCase() + role.slice(1);
  return text ? `${roleName}: "${text}"` : roleName;
}

function getDirectText(el: HTMLElement): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent?.trim() || '';
    }
  }
  return text.trim();
}

// Phase 2: CSS module hash cleaning
export function cleanClassName(className: string): string {
  return className.trim().split(/\s+/)
    .map(cls => cls
      .replace(/[_-][a-f0-9]{5,8}$/i, '') // hash suffixes
      .replace(/^_[a-f0-9]{5,}$/i, '') // pure hash classes
      .replace(/__(\w+)/g, ' $1') // BEM element
      .replace(/--(\w+)/g, ' $1') // BEM modifier
    )
    .filter(Boolean)
    .slice(0, 2)
    .join('.');
}

// ── Spatial Context ──

export function getSpatialContext(el: HTMLElement): SpatialContext {
  const rect = el.getBoundingClientRect();
  const nearby = getNearbyElements(el);
  const container = detectContainer(el);
  const region = detectPageRegion(el);
  const layout = detectLayoutPattern(el);

  return {
    position: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
    nearby,
    container: container ? {
      selector: generateSelector(container.element),
      display: container.display,
      role: container.role,
    } : undefined,
    pageRegion: region,
    layoutPattern: layout,
  };
}

function getNearbyElements(el: HTMLElement): SpatialRelation[] {
  const rect = el.getBoundingClientRect();
  const relations: SpatialRelation[] = [];
  const siblings = el.parentElement ? Array.from(el.parentElement.children) as HTMLElement[] : [];
  const searchRadius = 200; // px

  for (const sib of siblings) {
    if (sib === el || sib.getAttribute('data-dm-id')?.startsWith('dm-overlay')) continue;
    const sr = sib.getBoundingClientRect();
    if (sr.width === 0 || sr.height === 0) continue;

    // Check if within search radius
    const cx1 = rect.left + rect.width / 2;
    const cy1 = rect.top + rect.height / 2;
    const cx2 = sr.left + sr.width / 2;
    const cy2 = sr.top + sr.height / 2;
    const dist = Math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2);
    if (dist > searchRadius) continue;

    const direction = getDirection(rect, sr);
    const gap = getGap(rect, sr, direction);
    const alignment = getAlignment(rect, sr, direction);

    relations.push({
      element: generateSelector(sib),
      direction,
      gap: Math.round(gap),
      alignment,
    });
  }

  return relations.slice(0, 6); // Limit to 6 nearest
}

function getDirection(a: DOMRect, b: DOMRect): SpatialRelation['direction'] {
  const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };

  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;

  // Check overlap
  if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
    return 'overlapping';
  }

  if (Math.abs(dy) > Math.abs(dx)) {
    return dy < 0 ? 'above' : 'below';
  }
  return dx < 0 ? 'left' : 'right';
}

function getGap(a: DOMRect, b: DOMRect, dir: string): number {
  switch (dir) {
    case 'above': return a.top - b.bottom;
    case 'below': return b.top - a.bottom;
    case 'left': return a.left - b.right;
    case 'right': return b.left - a.right;
    default: return 0;
  }
}

function getAlignment(a: DOMRect, b: DOMRect, dir: string): 'start' | 'center' | 'end' {
  if (dir === 'above' || dir === 'below') {
    const diff = Math.abs(a.left - b.left);
    if (diff < 5) return 'start';
    const cdiff = Math.abs((a.left + a.width / 2) - (b.left + b.width / 2));
    if (cdiff < 5) return 'center';
    return 'end';
  }
  const diff = Math.abs(a.top - b.top);
  if (diff < 5) return 'start';
  const cdiff = Math.abs((a.top + a.height / 2) - (b.top + b.height / 2));
  if (cdiff < 5) return 'center';
  return 'end';
}

// ── Container Detection ──

function detectContainer(el: HTMLElement): { element: HTMLElement; display: string; role?: string } | null {
  let cur = el.parentElement;
  while (cur && cur !== document.body) {
    const cs = window.getComputedStyle(cur);
    const display = cs.display;
    if (display === 'flex' || display === 'grid' || display === 'inline-flex' || display === 'inline-grid') {
      return {
        element: cur,
        display,
        role: cur.getAttribute('role') || undefined,
      };
    }
    // Check for semantic containers
    const tag = cur.tagName.toLowerCase();
    if (['section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'form'].includes(tag)) {
      return {
        element: cur,
        display,
        role: tag,
      };
    }
    cur = cur.parentElement;
  }
  return null;
}

// ── Page Region Detection ──

export function detectPageRegion(el: HTMLElement): SpatialContext['pageRegion'] {
  // Walk up to find semantic landmark
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    const tag = cur.tagName.toLowerCase();
    const role = cur.getAttribute('role');
    if (tag === 'header' || role === 'banner') return 'header';
    if (tag === 'nav' || role === 'navigation') return 'nav';
    if (tag === 'main' || role === 'main') return 'main';
    if (tag === 'aside' || role === 'complementary') return 'sidebar';
    if (tag === 'footer' || role === 'contentinfo') return 'footer';
    cur = cur.parentElement;
  }

  // Heuristic based on position
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (rect.top < vh * 0.1) return 'header';
  if (rect.bottom > document.documentElement.scrollHeight - vh * 0.1) return 'footer';
  if (rect.left > window.innerWidth * 0.7) return 'sidebar';
  return 'unknown';
}

// ── Layout Pattern Detection ──

export function detectLayoutPattern(el: HTMLElement): SpatialContext['layoutPattern'] {
  const parent = el.parentElement;
  if (!parent) return 'unknown';
  const cs = window.getComputedStyle(parent);
  const display = cs.display;
  if (display === 'grid' || display === 'inline-grid') return 'grid';
  if (display === 'flex' || display === 'inline-flex') {
    const dir = cs.flexDirection;
    return dir.startsWith('column') ? 'flex-col' : 'flex-row';
  }
  if (cs.float !== 'none') return 'float';
  if (cs.position === 'absolute' || cs.position === 'fixed') return 'absolute';
  return 'stack';
}

// ── Accessibility Info ──

export function getAccessibilityInfo(el: HTMLElement): AccessibilityInfo {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || getImplicitRole(tag);
  const issues: string[] = [];

  // Check for issues
  if (tag === 'img' && !el.getAttribute('alt')) {
    issues.push('Missing alt text on image');
  }
  if (tag === 'a' && !el.textContent?.trim() && !el.getAttribute('aria-label')) {
    issues.push('Empty link without aria-label');
  }
  if (tag === 'button' && !el.textContent?.trim() && !el.getAttribute('aria-label')) {
    issues.push('Empty button without aria-label');
  }
  if (el.getAttribute('tabindex') && parseInt(el.getAttribute('tabindex')!) > 0) {
    issues.push('Positive tabindex (anti-pattern)');
  }
  const cs = window.getComputedStyle(el);
  if (cs.color && cs.backgroundColor) {
    const contrast = checkContrastRatio(cs.color, cs.backgroundColor);
    if (contrast !== null && contrast < 4.5) {
      issues.push(`Low contrast ratio: ${contrast.toFixed(1)}:1`);
    }
  }

  const interactive = isInteractive(tag, role);
  const tabIndex = el.getAttribute('tabindex');

  return {
    role,
    ariaLabel: el.getAttribute('aria-label') || undefined,
    ariaDescribedBy: el.getAttribute('aria-describedby') || undefined,
    ariaLabelledBy: el.getAttribute('aria-labelledby') || undefined,
    tabIndex: tabIndex !== null ? parseInt(tabIndex) : undefined,
    altText: el.getAttribute('alt') || undefined,
    isInteractive: interactive,
    focusable: interactive || tabIndex !== null,
    semanticTag: ['div', 'span'].includes(tag) ? undefined : tag,
    issues: issues.length > 0 ? issues : undefined,
  };
}

function getImplicitRole(tag: string): string {
  const roleMap: Record<string, string> = {
    a: 'link', button: 'button', input: 'textbox', select: 'combobox',
    textarea: 'textbox', img: 'img', nav: 'navigation', header: 'banner',
    footer: 'contentinfo', main: 'main', aside: 'complementary',
    article: 'article', section: 'region', form: 'form',
    table: 'table', ul: 'list', ol: 'list', li: 'listitem',
    h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading',
  };
  return roleMap[tag] || 'generic';
}

function isInteractive(tag: string, role: string): boolean {
  const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];
  const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'switch', 'slider', 'textbox', 'combobox'];
  return interactiveTags.includes(tag) || interactiveRoles.includes(role);
}

function checkContrastRatio(fg: string, bg: string): number | null {
  const fgRgb = parseRgb(fg);
  const bgRgb = parseRgb(bg);
  if (!fgRgb || !bgRgb) return null;
  const l1 = relativeLuminance(fgRgb);
  const l2 = relativeLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// ── Shadow DOM Support ──

export function querySelectorCrossingShadow(root: Element | Document, selector: string): Element | null {
  const result = root.querySelector(selector);
  if (result) return result;
  // Search shadow roots
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    if (el.shadowRoot) {
      const found = querySelectorCrossingShadow(el.shadowRoot as any, selector);
      if (found) return found;
    }
  }
  return null;
}

export function closestCrossingShadow(el: Element, selector: string): Element | null {
  let cur: Element | null = el;
  while (cur) {
    if (cur.matches(selector)) return cur;
    cur = cur.parentElement || (cur.getRootNode() as ShadowRoot).host || null;
  }
  return null;
}

// ── Nearby Elements Context for MCP ──

export function getNearbyElementsContext(el: HTMLElement): Array<{ selector: string; relation: string; gap?: number }> {
  const spatial = getSpatialContext(el);
  return spatial.nearby.map(n => ({
    selector: n.element,
    relation: `${n.direction}${n.alignment ? ` (${n.alignment}-aligned)` : ''}`,
    gap: n.gap,
  }));
}

// ── Format for MCP output ──

export function formatSpatialLines(ctx: SpatialContext): string[] {
  const lines: string[] = [];
  lines.push(`Region: ${ctx.pageRegion}`);
  if (ctx.layoutPattern) lines.push(`Layout: ${ctx.layoutPattern}`);
  if (ctx.container) lines.push(`Container: ${ctx.container.selector} (${ctx.container.display})`);
  for (const n of ctx.nearby) {
    lines.push(`  ${n.direction}: ${n.element} (gap: ${n.gap}px${n.alignment ? `, ${n.alignment}` : ''})`);
  }
  return lines;
}
