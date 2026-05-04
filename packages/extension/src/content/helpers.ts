// ============================================================
// Design Mode — Content Script Helpers
// ============================================================

import { DATA_ATTR } from '../shared';

let nextId = 1;
export const elementMap = new Map<string, HTMLElement>();

export function getOrAssignId(el: HTMLElement): string {
  let id = el.getAttribute(DATA_ATTR);
  if (!id) {
    id = `dm-${nextId++}`;
    el.setAttribute(DATA_ATTR, id);
  }
  elementMap.set(id, el);
  return id;
}

// After replaying a session, advance the id counter past any restored ids so
// new elements assigned later don't collide with reused ids like `dm-12`.
export function reserveIdsAtLeast(ids: string[]) {
  for (const id of ids) {
    const m = /^dm-(\d+)$/.exec(id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= nextId) nextId = n + 1;
    }
  }
}

export function getElementById(id: string): HTMLElement | null {
  return elementMap.get(id) || document.querySelector(`[${DATA_ATTR}="${id}"]`);
}

export interface Rect {
  top: number; left: number; width: number; height: number;
  bottom: number; right: number;
}

export function getElementRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const sx = window.scrollX, sy = window.scrollY;
  return { top: r.top + sy, left: r.left + sx, width: r.width, height: r.height, bottom: r.bottom + sy, right: r.right + sx };
}

export function generateSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body && parts.length < 5) {
    let sel = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
    if (cur.className && typeof cur.className === 'string') {
      const cls = cur.className.trim().split(/\s+/).slice(0, 2);
      if (cls.length && cls[0]) sel += '.' + cls.map(c => CSS.escape(c)).join('.');
    }
    const parent = cur.parentElement;
    if (parent) {
      const sibs = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
      if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
    }
    parts.unshift(sel);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

export function getBreadcrumbs(el: HTMLElement): string[] {
  const crumbs: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.documentElement && crumbs.length < 8) {
    let name = cur.tagName.toLowerCase();
    if (cur.id) name += `#${cur.id}`;
    else if (cur.className && typeof cur.className === 'string') {
      const c = cur.className.trim().split(/\s+/)[0];
      if (c) name += `.${c}`;
    }
    crumbs.unshift(name);
    cur = cur.parentElement;
  }
  return crumbs;
}

export function getComputedStyleSubset(el: HTMLElement): Record<string, string> {
  const cs = window.getComputedStyle(el);
  const props = [
    'position','top','right','bottom','left','zIndex','transform',
    'display','flexDirection','flexWrap','justifyContent','alignItems','alignSelf',
    'flexGrow','flexShrink','flexBasis','gap','rowGap','columnGap',
    'gridTemplateColumns','gridTemplateRows','gridColumn','gridRow',
    'width','height','minWidth','maxWidth','minHeight','maxHeight',
    'marginTop','marginRight','marginBottom','marginLeft',
    'paddingTop','paddingRight','paddingBottom','paddingLeft',
    'boxSizing','overflow','overflowX','overflowY',
    'fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing',
    'wordSpacing','textAlign','textDecoration','textTransform','whiteSpace','color',
    'backgroundColor','backgroundImage','opacity','visibility','cursor','mixBlendMode',
    'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
    'borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle',
    'borderTopColor','borderRightColor','borderBottomColor','borderLeftColor',
    'borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius',
    'boxShadow','textShadow','outline','outlineOffset','filter','backdropFilter','transition',
    'transitionProperty','transitionDuration','transitionTimingFunction','transitionDelay',
    'animation','animationName','animationDuration','animationTimingFunction','animationDelay',
    'animationIterationCount','animationDirection','animationFillMode','animationPlayState',
    'translate','rotate','scale','transformOrigin',
    'pointerEvents','userSelect','outlineStyle','outlineWidth','outlineColor',
    'backgroundSize','backgroundPosition','backgroundRepeat','backgroundAttachment',
  ];
  const result: Record<string, string> = {};
  for (const p of props) result[p] = (cs as any)[p] || '';
  return result;
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function rgbToHex(rgb: string): string {
  if (rgb.startsWith('#')) return rgb.slice(0, 7);
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1],m[2],m[3]].map(v => parseInt(v).toString(16).padStart(2,'0')).join('');
}
