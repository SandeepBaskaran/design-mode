// ============================================================
// Design Mode — Design-system module
//
// Two concerns share this file:
//   1. Token / scale DETECTION for the Declared & Detected tabs of
//      the Tokens panel:
//        • getPageTokens()   — :root CSS variables, grouped
//        • detectScales()    — histograms of computed values
//        • annotateDrift()   — flags near-matches against a token
//        • findTokenUsages() — DOM lookup for "Find uses" overlay
//   2. User-defined style-bundle PRESETS for the Defined tab:
//        • getCustomPresets()    — read from chrome.storage.sync
//        • saveCustomPreset()    — capture computed styles + store
//        • deleteCustomPreset()  — drop by id
//
// Presets are user-only (NO built-in seeds, NO migration scaffolds).
// Empty by default; the user adds entries manually from the panel.
// ============================================================

import { getElementById } from './helpers';

export type TokenGroup =
  | 'colour' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'other';

export interface DesignToken {
  cssVar: string;          // e.g. '--primary'
  value: string;           // the literal authored value (may be a chain like 'var(--brand-500)')
  resolvedValue: string;   // the value getComputedStyle hands back after resolving var() chains
  group: TokenGroup;
  usageCount: number;      // how many on-page elements resolve to this token's value
}

export interface ScaleEntry {
  value: string;           // e.g. '12px', 'oklch(...)', the raw computed value
  count: number;           // how many viewport-visible elements use it
  // For drift detection: when a value is close-but-not-equal to a declared
  // CSS-var token, this points at the var name.
  driftOf?: string;
}

export interface DesignSystem {
  tokens: DesignToken[];
  scales: {
    spacing: ScaleEntry[];
    radius: ScaleEntry[];
    fontSize: ScaleEntry[];
    shadow: ScaleEntry[];
  };
}

// Map a `--var-name` prefix to a semantic group. Order matters — earlier
// entries win. Sites use a wild range of naming so the matchers are
// generous; the value-based heuristic below is the final fallback.
const GROUP_PREFIX_RULES: { group: TokenGroup; prefixes: string[] }[] = [
  { group: 'colour', prefixes: ['color', 'clr', 'palette', 'brand', 'accent', 'primary', 'secondary', 'tertiary', 'bg', 'background', 'surface', 'fg', 'foreground', 'text', 'border', 'ring', 'shadow-color', 'btn', 'button'] },
  { group: 'typography', prefixes: ['font', 'text-size', 'text-weight', 'text-style', 'letter', 'leading', 'line-height', 'tracking', 'type', 'typo', 'heading'] },
  { group: 'spacing', prefixes: ['space', 'spacing', 'gap', 'pad', 'padding', 'mg', 'margin', 'inset', 'size-space'] },
  { group: 'radius', prefixes: ['radius', 'rounded', 'corner'] },
  { group: 'shadow', prefixes: ['shadow', 'elevation', 'depth'] },
];

function classifyByPrefix(cssVar: string): TokenGroup | null {
  const name = cssVar.replace(/^--/, '').toLowerCase();
  for (const rule of GROUP_PREFIX_RULES) {
    for (const p of rule.prefixes) {
      if (name === p || name.startsWith(p + '-') || name.startsWith(p + '_')) return rule.group;
    }
  }
  return null;
}

function classifyByValue(value: string): TokenGroup {
  const v = value.trim().toLowerCase();
  if (!v) return 'other';
  // Colour-ish values
  if (
    v.startsWith('#') ||
    v.startsWith('rgb') ||
    v.startsWith('hsl') ||
    v.startsWith('oklch') ||
    v.startsWith('oklab') ||
    v.startsWith('lab(') ||
    v.startsWith('lch(') ||
    v.startsWith('hwb(') ||
    v.startsWith('color(')
  ) return 'colour';
  // Shadow values
  if (/(\d+px|0)\s+(\d+px|0)\s+/.test(v) && /(rgb|hsl|#|oklch|oklab)/.test(v)) return 'shadow';
  if (v.includes('inset') && (v.includes('rgb') || v.includes('#'))) return 'shadow';
  // Length-ish (single px / rem / em / number)
  if (/^[\d.]+(px|rem|em|%)?$/.test(v)) return 'spacing';
  // Font-family
  if (/^['"a-z]/i.test(v) && v.includes(',')) return 'typography';
  return 'other';
}

function classifyToken(cssVar: string, value: string): TokenGroup {
  return classifyByPrefix(cssVar) ?? classifyByValue(value);
}

// Discover every `--*` CSS variable declared on :root (or on `html`)
// across same-origin stylesheets. Returns one entry per unique variable,
// with both the authored value and the resolved-at-runtime value.
export function getPageTokens(): DesignToken[] {
  const seen = new Map<string, string>();
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) {
            const sel = (rule.selectorText || '').toLowerCase();
            // Only walk rules that target :root / html, the common token
            // homes. Component-scoped vars (e.g. inside .foo { --bar: ... })
            // are intentionally skipped — they're not the design system.
            if (!sel.includes(':root') && sel.trim() !== 'html') continue;
            const style = rule.style;
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              if (prop.startsWith('--') && !seen.has(prop)) {
                seen.set(prop, style.getPropertyValue(prop).trim());
              }
            }
          }
        }
      } catch {} // cross-origin sheet — skip
    }
  } catch {}

  const rootStyles = getComputedStyle(document.documentElement);
  const tokens: DesignToken[] = [];
  for (const [cssVar, authored] of seen) {
    const resolved = rootStyles.getPropertyValue(cssVar).trim();
    const valueForClassify = resolved || authored;
    if (!valueForClassify) continue;
    tokens.push({
      cssVar,
      value: authored || resolved,
      resolvedValue: resolved,
      group: classifyToken(cssVar, valueForClassify),
      usageCount: 0,
    });
  }

  // One pass over every element on the page builds a value → usage-count
  // map for the styling properties we care about. Then we tally each
  // token's resolved value against it. This avoids one DOM walk per
  // token (the prior findTokenUsages approach was O(tokens × elements)).
  if (tokens.length > 0) {
    const valueCounts = new Map<string, number>();
    const PROPS = [
      'color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
      'outlineColor', 'fill', 'stroke', 'accentColor', 'caretColor',
      'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap',
      'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
      'boxShadow', 'textShadow', 'opacity',
    ] as const;
    const all = document.querySelectorAll<HTMLElement>('*');
    for (let i = 0; i < all.length && i < 10000; i++) {
      const cs = getComputedStyle(all[i]);
      for (const p of PROPS) {
        const v = (cs as any)[p] as string | undefined;
        if (!v) continue;
        valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
      }
    }
    for (const t of tokens) {
      const lookup = t.resolvedValue || t.value;
      t.usageCount = valueCounts.get(lookup) || 0;
    }
  }
  return tokens;
}

// Cluster nearby values for histogram presentation. Two values "cluster"
// if their numeric prefix differs by ≤ 0.5px (after rounding). Helps
// surfaces a clean 4 / 8 / 12 / 16 px scale even when the page has noise
// (3.99px from a sub-pixel rendering artefact, 4.01px etc.).
function clusterNumeric(rawCounts: Map<string, number>): Map<string, number> {
  const entries = Array.from(rawCounts.entries());
  // Sort by numeric prefix; non-numeric values fall through unchanged.
  entries.sort((a, b) => {
    const an = parseFloat(a[0]) || 0;
    const bn = parseFloat(b[0]) || 0;
    return an - bn;
  });
  const out = new Map<string, number>();
  let lastNum = -Infinity;
  let lastKey = '';
  for (const [val, count] of entries) {
    const n = parseFloat(val);
    if (!isFinite(n)) { out.set(val, (out.get(val) || 0) + count); continue; }
    if (Math.abs(n - lastNum) < 0.5 && lastKey) {
      out.set(lastKey, (out.get(lastKey) || 0) + count);
    } else {
      out.set(val, (out.get(val) || 0) + count);
      lastNum = n;
      lastKey = val;
    }
  }
  return out;
}

function isInViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  if (r.bottom < 0 || r.top > window.innerHeight) return false;
  if (r.right < 0 || r.left > window.innerWidth) return false;
  return true;
}

// Walk viewport-visible elements and tally how often each spacing / radius /
// font-size / shadow value appears. Returns the top N per scale, sorted by
// frequency. Values are normalised — '0px' is collapsed to '0', identical
// numeric values are clustered.
export function detectScales(topN = 8): DesignSystem['scales'] {
  const spacing = new Map<string, number>();
  const radius = new Map<string, number>();
  const fontSize = new Map<string, number>();
  const shadow = new Map<string, number>();

  // Walk every element; cheap enough on modern hardware for in-viewport
  // pages, expensive on huge SPA dashboards. Guard with an upper bound so
  // a ridiculous DOM doesn't lock the panel up.
  const all = document.querySelectorAll<HTMLElement>('*');
  let walked = 0;
  for (let i = 0; i < all.length && walked < 4000; i++) {
    const el = all[i];
    if (!isInViewport(el)) continue;
    walked++;
    const cs = getComputedStyle(el);

    for (const side of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap'] as const) {
      const v = (cs as any)[side] as string;
      if (!v || v === '0px' || v === 'normal' || v === 'auto') continue;
      spacing.set(v, (spacing.get(v) || 0) + 1);
    }
    for (const side of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'] as const) {
      const v = (cs as any)[side] as string;
      if (!v || v === '0px') continue;
      radius.set(v, (radius.get(v) || 0) + 1);
    }
    const fs = cs.fontSize;
    if (fs) fontSize.set(fs, (fontSize.get(fs) || 0) + 1);
    const bs = cs.boxShadow;
    if (bs && bs !== 'none') shadow.set(bs, (shadow.get(bs) || 0) + 1);
  }

  const top = (m: Map<string, number>): ScaleEntry[] => {
    const clustered = clusterNumeric(m);
    return Array.from(clustered.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  };

  return {
    spacing: top(spacing),
    radius: top(radius),
    fontSize: top(fontSize),
    shadow: top(shadow),
  };
}

// Apply drift annotations onto detected scales: if a scale entry's value is
// numerically close to a declared CSS-var token's resolved value (≤ 1px for
// lengths; exact match for shadows), tag the entry with the var name.
// Caller decides how to present the drift (UI badge, consolidate action…).
export function annotateDrift(scales: DesignSystem['scales'], tokens: DesignToken[]): void {
  const lengthTokens = tokens.filter(t => t.group === 'spacing' || t.group === 'radius' || t.group === 'typography')
    .map(t => ({ name: t.cssVar, n: parseFloat(t.resolvedValue || t.value) }))
    .filter(t => isFinite(t.n));
  const taint = (entries: ScaleEntry[]) => {
    for (const e of entries) {
      const n = parseFloat(e.value);
      if (!isFinite(n)) continue;
      const near = lengthTokens.find(t => Math.abs(t.n - n) > 0 && Math.abs(t.n - n) < 1.5);
      if (near) e.driftOf = near.name;
    }
  };
  taint(scales.spacing);
  taint(scales.radius);
  taint(scales.fontSize);
}

// Walk the DOM and return the IDs (`data-dm-id`) of every element whose
// computed style resolves to the given CSS variable. Reads computed
// styles across the common property surfaces (colour, background,
// border-colour, font-size, padding, margin, gap, border-radius,
// box-shadow). Used by the Tokens panel's "find uses" button.
export function findTokenUsages(cssVar: string): string[] {
  const rootStyles = getComputedStyle(document.documentElement);
  const tokenValue = rootStyles.getPropertyValue(cssVar).trim();
  if (!tokenValue) return [];
  const PROPS = [
    'color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor', 'fill', 'stroke', 'accentColor', 'caretColor',
    'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
    'boxShadow', 'textShadow', 'opacity',
  ] as const;
  const matches: string[] = [];
  const all = document.querySelectorAll<HTMLElement>('[data-dm-id]');
  all.forEach(el => {
    const cs = getComputedStyle(el);
    for (const p of PROPS) {
      const v = (cs as any)[p] as string | undefined;
      if (v && v === tokenValue) {
        const id = el.getAttribute('data-dm-id');
        if (id) matches.push(id);
        return;
      }
    }
  });
  return matches;
}

// ── User-defined preset bundles ───────────────────────────────
// chrome.storage.sync key + simple CRUD. Empty by default; no seeding.

export type PresetKind =
  | 'position' | 'layout' | 'appearance' | 'typography'
  | 'fill'     | 'stroke' | 'effects'    | 'motion';

export interface Preset {
  id: string;
  name: string;
  kind: PresetKind;
  styles: Record<string, string>;
  createdAt: number;
}

const PRESETS_STORAGE_KEY = 'dm_custom_presets';

function quotaErrorMessage(): string {
  return 'Storage full — chrome.storage.sync caps at 100 KB total. Delete an old preset and try again.';
}

function dedupName(base: string, existing: Preset[]): string {
  const taken = new Set(existing.map(p => p.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export async function getCustomPresets(): Promise<Preset[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(PRESETS_STORAGE_KEY, (data) => {
      const list: Preset[] = Array.isArray(data?.[PRESETS_STORAGE_KEY]) ? data[PRESETS_STORAGE_KEY] : [];
      resolve(list);
    });
  });
}

export async function saveCustomPreset(
  name: string,
  elementId: string,
  kind: PresetKind,
  props: string[],
): Promise<{ preset?: Preset; error?: string }> {
  const el = getElementById(elementId);
  if (!el) return { error: 'No element to capture' };
  if (!props || props.length === 0) return { error: 'No properties to capture for this kind' };
  const cs = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of props) {
    const val = (cs as any)[prop];
    if (!val) continue;
    // Drop CSS defaults — keeps the preset small and useful.
    if (val === 'none' || val === 'normal' || val === 'auto') continue;
    styles[prop] = val;
  }
  if (Object.keys(styles).length === 0) {
    return { error: `No ${kind} styles found on this element` };
  }
  const existing = await getCustomPresets();
  const preset: Preset = {
    id: 'custom-' + Date.now(),
    name: dedupName(name.trim() || 'Untitled', existing),
    kind,
    styles,
    createdAt: Date.now(),
  };
  const next = [...existing, preset];
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [PRESETS_STORAGE_KEY]: next }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ error: /QUOTA/i.test(err.message || '') ? quotaErrorMessage() : (err.message || 'Save failed') });
        return;
      }
      resolve({ preset });
    });
  });
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const existing = await getCustomPresets();
  const next = existing.filter(p => p.id !== id);
  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ [PRESETS_STORAGE_KEY]: next }, () => resolve());
  });
}
