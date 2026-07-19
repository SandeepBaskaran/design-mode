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
  // Prefer the live DOM. The cached elementMap entry survives across
  // Clear All / re-renders / detach, so trusting it blindly returns
  // detached nodes that look "real" but render at 0,0 (which surfaces
  // as comment pins migrating to body, etc.). Verify the cached node
  // is still attached; if not, requery the DOM and refresh the cache.
  const cached = elementMap.get(id);
  if (cached && document.contains(cached)) return cached;
  const fresh = document.querySelector(`[${DATA_ATTR}="${id}"]`) as HTMLElement | null;
  if (fresh) elementMap.set(id, fresh);
  else if (cached) elementMap.delete(id);
  return fresh;
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

// Human-readable layer label. generateSelector covers *targeting*; this
// covers *recognition* — on class-less markup (hand-written local HTML) a
// bare `div` identifies nothing, so fall back to the element's own text,
// its accessible name, or its position under the nearest named ancestor.
export function describeElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  if (typeof el.className === 'string') {
    const c = el.className.trim().split(/\s+/).find(cl => cl && !cl.startsWith('dm-clone'));
    if (c) return `${tag}.${c}`;
  }
  const snippet = (s: string) => {
    const t = s.trim().replace(/\s+/g, ' ');
    return t.length > 24 ? t.slice(0, 23) + '…' : t;
  };
  const named = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.getAttribute('name');
  if (named) return `${tag} “${snippet(named)}”`;
  if ((el.textContent || '').trim()) return `${tag} “${snippet(el.textContent!)}”`;
  // Empty element (spacer, icon box, image wrapper) — describe it by its
  // position under the nearest ancestor that has a name of its own.
  let anc = el.parentElement;
  let ancLabel = '';
  while (anc && anc !== document.documentElement) {
    const aTag = anc.tagName.toLowerCase();
    if (anc.id) { ancLabel = `${aTag}#${anc.id}`; break; }
    const aCls = typeof anc.className === 'string' ? anc.className.trim().split(/\s+/)[0] : '';
    if (aCls && !aCls.startsWith('dm-')) { ancLabel = `${aTag}.${aCls}`; break; }
    if (aTag !== 'div' && aTag !== 'span') { ancLabel = aTag; break; }
    anc = anc.parentElement;
  }
  const parent = el.parentElement;
  const idx = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName).indexOf(el) + 1 : 0;
  const pos = idx > 0 ? `${tag} ${idx}` : tag;
  return ancLabel ? `${pos} in ${ancLabel}` : pos;
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
    'display','flexDirection','flexWrap','justifyContent','alignItems','alignSelf','alignContent',
    'flexGrow','flexShrink','flexBasis','gap','rowGap','columnGap',
    'gridTemplateColumns','gridTemplateRows','gridColumn','gridRow',
    'width','height','minWidth','maxWidth','minHeight','maxHeight','aspectRatio',
    'marginTop','marginRight','marginBottom','marginLeft',
    'paddingTop','paddingRight','paddingBottom','paddingLeft',
    'boxSizing','overflow','overflowX','overflowY',
    'fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing',
    'wordSpacing','textAlign','textDecoration','textTransform','whiteSpace','color',
    // Typography Advanced — decoration cluster
    'textDecorationLine','textDecorationStyle','textDecorationColor','textDecorationThickness',
    'textUnderlineOffset','textUnderlinePosition','textDecorationSkipInk',
    // Typography Advanced — wrapping / whitespace
    'textWrap','wordBreak','overflowWrap','hyphens','textJustify','textIndent','textOverflow',
    // Typography Advanced — alignment / tab / line clamp
    'verticalAlign','tabSize','webkitLineClamp','webkitBoxOrient',
    // Typography Advanced — direction / writing mode
    'direction','writingMode','unicodeBidi',
    // Typography Advanced — font features
    'fontStretch','fontVariantCaps','fontVariantNumeric','fontVariantLigatures','fontVariantPosition',
    'fontFeatureSettings','fontVariationSettings','textRendering',
    'fontKerning','fontOpticalSizing','fontSynthesis','fontSizeAdjust',
    // Typography Advanced — extra wrapping / list controls
    'textAlignLast','lineBreak','listStyleType','listStylePosition','listStyleImage',
    'backgroundColor','backgroundImage','opacity','visibility','cursor','mixBlendMode',
    'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
    'borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle',
    'borderTopColor','borderRightColor','borderBottomColor','borderLeftColor',
    'borderImageSource','borderImageSlice','borderImageWidth','borderImageOutset','borderImageRepeat',
    'borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius',
    'boxShadow','textShadow','outline','outlineOffset','filter','backdropFilter','transition',
    'transitionProperty','transitionDuration','transitionTimingFunction','transitionDelay',
    'animation','animationName','animationDuration','animationTimingFunction','animationDelay',
    'animationIterationCount','animationDirection','animationFillMode','animationPlayState',
    'translate','rotate','scale','transformOrigin','transformBox',
    'perspective','perspectiveOrigin','transformStyle','backfaceVisibility',
    'insetBlockStart','insetBlockEnd','insetInlineStart','insetInlineEnd',
    'anchorName','positionAnchor','positionArea','viewTransitionName',
    'positionTryFallbacks','positionTryOrder','positionVisibility',
    'pointerEvents','userSelect','outlineStyle','outlineWidth','outlineColor',
    'backgroundSize','backgroundPosition','backgroundRepeat','backgroundAttachment',
    // Fill Advanced — clip / origin + the mask-* family
    'backgroundClip','backgroundOrigin','webkitBackgroundClip','webkitTextFillColor',
    'maskImage','maskMode','maskRepeat','maskPosition','maskSize','maskOrigin','maskClip','maskComposite',
    // SVG paint properties (CSS-on-SVG; takes precedence over presentation attributes)
    'fill','fillOpacity','fillRule','stroke','strokeWidth','strokeOpacity','strokeDasharray','strokeDashoffset','strokeLinecap','strokeLinejoin',
    // Appearance — stacking-context, form controls, scrollbars, perf, clip
    'isolation','accentColor','caretColor','colorScheme','clipPath','appearance',
    'scrollbarWidth','scrollbarColor','scrollbarGutter','forcedColorAdjust',
    'contain','contentVisibility','willChange',
    // Effects — Motion Path
    'offsetPath','offsetDistance','offsetRotate','offsetAnchor','offsetPosition',
    // Effects — View Transitions
    'viewTransitionClass',
    // Effects — Scroll-driven animations
    'animationTimeline','animationRange','animationRangeStart','animationRangeEnd',
    'scrollTimeline','scrollTimelineName','scrollTimelineAxis',
    'viewTimeline','viewTimelineName','viewTimelineAxis','viewTimelineInset',
    'timelineScope',
    // Layout — logical margin (i18n parity to physical margin)
    'marginBlockStart','marginBlockEnd','marginInlineStart','marginInlineEnd',
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
