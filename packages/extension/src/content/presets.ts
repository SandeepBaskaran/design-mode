// ============================================================
// Design Mode — Presets
//
// User-saved reusable styles, modelled after Figma styles. Each preset has
// a `kind` matching one of the seven Design-tab sections (Position,
// Layout, Appearance, Typography, Fill, Stroke, Effects). Capture is
// scoped to just the relevant properties for that kind, so applying a
// preset doesn't overwrite unrelated styles.
//
// The property list per kind is owned by the side panel (it uses
// `SECTION_PROPS` as the single source of truth) and passed in via
// SP_SAVE_PRESET. This file just stores / reads the resulting bag.
//
// Site-colour tokens (CSS custom properties on the page) used to live
// here as a "Built-in" tab. They've been retired — those tokens are now
// surfaced inline in the colour picker on every colour input. The
// presets panel is purely user-saved.
//
// Quota: chrome.storage.sync allows ≤8KB per item, ≤100KB total. Keep
// snapshots small and surface a clean error when the bucket fills up.
// ============================================================

import { getElementById } from './helpers';

export type PresetKind = 'position' | 'layout' | 'appearance' | 'typography' | 'fill' | 'stroke' | 'effects' | 'motion' | 'layoutGuide';

export interface Preset {
  id: string;
  name: string;
  kind: PresetKind;       // category — drives apply behaviour (which props to write)
  styles: Record<string, string>;
  isCustom?: boolean;
  createdAt?: number;
}

export interface PageToken {
  cssVar: string;
  value: string;
  property: string;
}

export interface TokenGroup {
  name: string;
  tokens: PageToken[];
}

// --- Page Token Discovery (Built-in "presets" from site design system) ---

const PREFIX_GROUPS: [string[], string, string][] = [
  [['btn', 'button'], 'Buttons', 'background-color'],
  [['color', 'clr', 'palette', 'brand'], 'Colors', 'color'],
  [['bg', 'background', 'surface'], 'Backgrounds', 'background-color'],
  [['shadow', 'sh', 'elevation'], 'Shadows', 'box-shadow'],
  [['border', 'bd', 'ring', 'outline'], 'Borders', 'border'],
  [['radius', 'rounded', 'corner'], 'Radius', 'border-radius'],
  [['font', 'text', 'fs', 'fw', 'lh', 'ls', 'type', 'typo', 'heading'], 'Typography', 'font-size'],
  [['space', 'spacing', 'gap', 'pad', 'mg', 'margin'], 'Spacing', 'gap'],
  [['size', 'width', 'height', 'sz'], 'Size', 'width'],
  [['transition', 'anim', 'motion', 'ease', 'duration', 'delay'], 'Animation', 'transition'],
  [['z', 'layer', 'index'], 'Z-Index', 'z-index'],
  [['opacity', 'alpha'], 'Opacity', 'opacity'],
];

function guessProperty(cssVar: string): string {
  const v = cssVar.toLowerCase();
  if (/shadow|elevation/.test(v)) return 'box-shadow';
  if (/radius|rounded|corner/.test(v)) return 'border-radius';
  if (/border|ring|outline/.test(v)) return 'border';
  if (/font-size|fs|text-size/.test(v)) return 'font-size';
  if (/font-weight|fw/.test(v)) return 'font-weight';
  if (/font-family|ff/.test(v)) return 'font-family';
  if (/line-height|lh/.test(v)) return 'line-height';
  if (/letter-spacing|ls/.test(v)) return 'letter-spacing';
  if (/transition|anim|motion|ease|duration|delay/.test(v)) return 'transition';
  if (/opacity|alpha/.test(v)) return 'opacity';
  if (/gap|spacing|space/.test(v)) return 'gap';
  if (/width|sz-w/.test(v)) return 'width';
  if (/height|sz-h/.test(v)) return 'height';
  if (/z-index|z-layer/.test(v)) return 'z-index';
  if (/bg|background|surface/.test(v)) return 'background-color';
  return 'color';
}

function groupForVar(cssVar: string): { name: string; property: string } {
  const stripped = cssVar.replace(/^--/, '').toLowerCase();
  for (const [prefixes, name, property] of PREFIX_GROUPS) {
    if (prefixes.some(p => stripped === p || stripped.startsWith(p + '-') || stripped.startsWith(p + '_'))) {
      return { name, property };
    }
  }
  return { name: 'Variables', property: guessProperty(cssVar) };
}

export function getPageTokens(el: HTMLElement): TokenGroup[] {
  const allVars = new Map<string, string>();
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) {
            const style = rule.style;
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              if (prop.startsWith('--') && !allVars.has(prop)) {
                allVars.set(prop, style.getPropertyValue(prop).trim());
              }
            }
          }
        }
      } catch {} // cross-origin sheet — skip
    }
  } catch {}

  if (allVars.size === 0) return [];

  const groups = new Map<string, TokenGroup>();
  for (const [cssVar, rawValue] of allVars) {
    const value = rawValue || getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (!value) continue;
    const { name, property } = groupForVar(cssVar);
    if (!groups.has(name)) groups.set(name, { name, tokens: [] });
    groups.get(name)!.tokens.push({ cssVar, value, property });
  }

  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
  const role = el.getAttribute ? (el.getAttribute('role') || '') : '';

  let filterNames: string[] | null = null;
  if (tag === 'button' || role === 'button' || cls.includes('btn') || cls.includes('button')) {
    filterNames = ['Buttons', 'Colors', 'Backgrounds', 'Radius', 'Shadows', 'Borders'];
  } else if (tag === 'a') {
    filterNames = ['Colors', 'Typography', 'Radius', 'Shadows'];
  } else if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    filterNames = ['Colors', 'Backgrounds', 'Borders', 'Radius', 'Typography', 'Spacing'];
  } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'em', 'b', 'i', 'label', 'small', 'li'].includes(tag)) {
    filterNames = ['Typography', 'Colors', 'Spacing'];
  } else if (tag === 'img' || tag === 'video' || tag === 'canvas') {
    filterNames = ['Size', 'Radius', 'Shadows', 'Opacity'];
  }

  const allGroups = [...groups.values()].filter(g => g.tokens.length > 0);
  const result: TokenGroup[] = [];

  if (filterNames) {
    for (const name of filterNames) {
      const g = groups.get(name);
      if (g && g.tokens.length > 0) result.push(g);
    }
    if (result.length === 0) result.push(...allGroups);
  } else {
    const order = ['Colors', 'Backgrounds', 'Borders', 'Radius', 'Shadows', 'Typography', 'Spacing', 'Size', 'Buttons', 'Animation', 'Opacity', 'Z-Index', 'Variables'];
    const seen = new Set<string>();
    for (const name of order) {
      const g = groups.get(name);
      if (g && g.tokens.length > 0) { result.push(g); seen.add(name); }
    }
    for (const g of allGroups) {
      if (!seen.has(g.name)) result.push(g);
    }
  }

  return result;
}

// --- Custom Presets (chrome.storage.sync, cross-site) ---

function quotaError(): string {
  return 'Storage full — chrome.storage.sync caps at 100 KB total. Delete an old preset and try again.';
}

// Built-in seed presets. We ship one of every kind so a user who
// exports the JSON sees the full structure — kind names, style-prop
// shapes, naming convention — and can hand-author or import their own
// presets confidently. Each is tagged isCustom so the user can rename,
// edit, or delete it like any saved preset. The seed-version marker
// prevents re-injection: once a seed is deleted, it stays gone.
//
// Version is bumped (PRESETS_SEED_VERSION) whenever new seeds are
// added in a release. Older users who already have v1 seeds get the
// new entries merged in without losing their saved presets or
// resurrecting ones they'd deleted.
const PRESETS_SEED_VERSION = 2;
const BUILTIN_SEEDS: Preset[] = [
  // ── Effects (visual) ──────────────────────────────────────────────
  {
    id: 'builtin-soft-drop',
    name: 'Soft drop',
    kind: 'effects',
    styles: { boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.08)' },
    isCustom: true,
    createdAt: 0,
  },
  {
    id: 'builtin-hard-drop',
    name: 'Hard drop',
    kind: 'effects',
    styles: { boxShadow: '0 2px 0 rgba(0, 0, 0, 0.85)' },
    isCustom: true,
    createdAt: 0,
  },
  {
    id: 'builtin-layered-drop',
    name: 'Layered drop',
    kind: 'effects',
    styles: { boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.06)' },
    isCustom: true,
    createdAt: 0,
  },
  {
    id: 'builtin-glow',
    name: 'Glow',
    kind: 'effects',
    styles: { boxShadow: '0 0 0 2px rgba(79,158,255,0.45), 0 0 20px rgba(79,158,255,0.55)' },
    isCustom: true,
    createdAt: 0,
  },
  {
    id: 'builtin-embossed',
    name: 'Embossed',
    kind: 'effects',
    styles: { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)' },
    isCustom: true,
    createdAt: 0,
  },
  {
    id: 'builtin-frosted-glass',
    name: 'Frosted glass',
    kind: 'effects',
    styles: { backdropFilter: 'blur(12px) saturate(1.4)' },
    isCustom: true,
    createdAt: 0,
  },
  {
    id: 'builtin-neon-text',
    name: 'Neon text',
    kind: 'effects',
    styles: { textShadow: '0 0 4px #fff, 0 0 8px #fff, 0 0 14px #ff00de, 0 0 20px #ff00de, 0 0 30px #ff00de' },
    isCustom: true,
    createdAt: 0,
  },
  // ── Position ──────────────────────────────────────────────────────
  {
    id: 'builtin-position-centred-absolute',
    name: 'Centred absolute',
    kind: 'position',
    styles: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      translate: '-50% -50%',
    },
    isCustom: true,
    createdAt: 0,
  },
  // ── Layout ────────────────────────────────────────────────────────
  {
    id: 'builtin-layout-flex-row-16',
    name: 'Flex row · 16 gap',
    kind: 'layout',
    styles: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '16px',
    },
    isCustom: true,
    createdAt: 0,
  },
  // ── Appearance ────────────────────────────────────────────────────
  {
    id: 'builtin-appearance-rounded-glass',
    name: 'Rounded glass',
    kind: 'appearance',
    styles: {
      borderRadius: '12px',
      backdropFilter: 'blur(12px) saturate(1.4)',
      opacity: '0.95',
    },
    isCustom: true,
    createdAt: 0,
  },
  // ── Typography ────────────────────────────────────────────────────
  {
    id: 'builtin-typography-headline-1',
    name: 'Headline 1',
    kind: 'typography',
    styles: {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: '32px',
      fontWeight: '700',
      lineHeight: '1.2',
      letterSpacing: '-0.02em',
    },
    isCustom: true,
    createdAt: 0,
  },
  // ── Fill ──────────────────────────────────────────────────────────
  {
    id: 'builtin-fill-brand',
    name: 'Brand fill',
    kind: 'fill',
    styles: {
      backgroundColor: '#3b82f6',
    },
    isCustom: true,
    createdAt: 0,
  },
  // ── Stroke ────────────────────────────────────────────────────────
  {
    id: 'builtin-stroke-subtle-1',
    name: 'Subtle border',
    kind: 'stroke',
    styles: {
      borderTopWidth: '1px',
      borderRightWidth: '1px',
      borderBottomWidth: '1px',
      borderLeftWidth: '1px',
      borderTopStyle: 'solid',
      borderRightStyle: 'solid',
      borderBottomStyle: 'solid',
      borderLeftStyle: 'solid',
      borderTopColor: '#e5e7eb',
      borderRightColor: '#e5e7eb',
      borderBottomColor: '#e5e7eb',
      borderLeftColor: '#e5e7eb',
    },
    isCustom: true,
    createdAt: 0,
  },
  // ── Motion ────────────────────────────────────────────────────────
  {
    id: 'builtin-motion-smooth-200',
    name: 'Smooth 200ms',
    kind: 'motion',
    styles: {
      transitionProperty: 'all',
      transitionDuration: '0.2s',
      transitionTimingFunction: 'ease',
      transitionDelay: '0s',
    },
    isCustom: true,
    createdAt: 0,
  },
  // ── Layout guide ──────────────────────────────────────────────────
  // The "styles" object carries the synthetic __layout_guides JSON
  // so the export shows the structure. Applying it currently does not
  // restore overlays on the page (layout guides are session-only and
  // bypass the change-tracker by design), but the shape is here for
  // people authoring presets by hand or sharing config snapshots.
  {
    id: 'builtin-layoutguide-cols-12',
    name: 'Columns · 12',
    kind: 'layoutGuide',
    styles: {
      __layout_guides: JSON.stringify([{
        kind: 'columns',
        count: 12,
        color: '#ff3366',
        opacity: 10,
        visible: true,
        align: 'stretch',
        size: 'auto',
        margin: '0',
        gutter: '20',
      }]),
    },
    isCustom: true,
    createdAt: 0,
  },
];

// Migration-safe seeding. `dm_presets_seeded_version` records which
// version of the seed list ran last. On bump (PRESETS_SEED_VERSION)
// we merge any seeds whose name/id aren't already present — old seeds
// the user deleted stay deleted, new ones get added. The in-process
// promise guard prevents parallel getCustomPresets() callers from
// double-writing.
let seedPromise: Promise<void> | null = null;
function seedBuiltinPresetsIfNeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = new Promise<void>((resolve) => {
    chrome.storage.sync.get(
      ['dm_presets_seeded', 'dm_presets_seeded_version', 'dm_custom_presets'],
      (data) => {
        // Legacy flag (v1) → treat as version 1 if set; new code uses
        // numeric version so future bumps cleanly add new seeds without
        // touching the user's existing ones.
        const currentVer = typeof data.dm_presets_seeded_version === 'number'
          ? data.dm_presets_seeded_version
          : (data.dm_presets_seeded ? 1 : 0);
        if (currentVer >= PRESETS_SEED_VERSION) { resolve(); return; }
        const existing: Preset[] = data.dm_custom_presets || [];
        const takenNames = new Set(existing.map(p => p.name));
        const takenIds = new Set(existing.map(p => p.id));
        const toAdd = BUILTIN_SEEDS.filter(p => !takenNames.has(p.name) && !takenIds.has(p.id));
        const merged = [...existing, ...toAdd];
        chrome.storage.sync.set({
          dm_custom_presets: merged,
          dm_presets_seeded_version: PRESETS_SEED_VERSION,
          // Keep the legacy flag set so older builds don't try to re-seed
          // v1 if they ever run again.
          dm_presets_seeded: true,
        }, () => resolve());
      },
    );
  });
  return seedPromise;
}

export async function getCustomPresets(): Promise<Preset[]> {
  await seedBuiltinPresetsIfNeeded();
  return new Promise((resolve) => {
    chrome.storage.sync.get('dm_custom_presets', (data) => {
      const list: Preset[] = data.dm_custom_presets || [];
      // Migrate legacy presets that pre-date or used the older 3-kind set
      // (typography / color / shadow). Map each onto the new 7-kind set so
      // old saves still render and filter correctly.
      resolve(list.map(p => normalizeKind(p)));
    });
  });
}

// Map an old preset's `kind` (or a missing `kind`) onto the new 7-kind
// set. The pre-overhaul kinds were typography / color / shadow:
//   • 'color'  → 'fill'    (single `color` writes lived under Fill semantics)
//   • 'shadow' → 'effects' (`box-shadow` is an Effects entry)
//   • 'typography' → 'typography' (unchanged)
// Anything missing or unrecognised falls through inferKindFromProps.
function normalizeKind(p: Preset): Preset {
  const valid: ReadonlyArray<PresetKind> = ['position', 'layout', 'appearance', 'typography', 'fill', 'stroke', 'effects', 'motion', 'layoutGuide'];
  const k = (p as any).kind as string | undefined;
  if (k && (valid as readonly string[]).includes(k)) return p as Preset;
  if (k === 'color') return { ...p, kind: 'fill' };
  if (k === 'shadow') return { ...p, kind: 'effects' };
  return { ...p, kind: inferKindFromProps(Object.keys(p.styles || {})) };
}

function inferKindFromProps(keys: string[]): PresetKind {
  const has = (re: RegExp) => keys.some(k => re.test(k));
  // Synthetic prop checks first — these are unambiguous.
  if (keys.includes('__layout_guides')) return 'layoutGuide';
  // Motion comes before position / effects: transition / animation /
  // motion-path props alone signal a motion preset, even when transform
  // is co-present (transform also appears in position).
  if (has(/^(transition|animation|offsetPath|offsetDistance|offsetRotate|offsetAnchor|offsetPosition|viewTransitionName|viewTransitionClass|animationTimeline|animationRange|scrollTimeline|viewTimeline|timelineScope)/)) return 'motion';
  if (has(/^(position|top|right|bottom|left|zIndex|transform|translate|rotate|scale|perspective)/)) return 'position';
  if (has(/^(display|flex|grid|justifyContent|alignItems|alignSelf|gap|rowGap|columnGap|gridTemplate|gridArea|width|height|minWidth|maxWidth|minHeight|maxHeight|padding|margin|boxSizing|overflow)/)) return 'layout';
  if (has(/^(font|text|lineHeight|letterSpacing|wordSpacing|textTransform|listStyle|whiteSpace|textWrap|textIndent|tabSize|verticalAlign|hyphens|writingMode|direction|unicodeBidi|color)$/)) return 'typography';
  if (has(/^(opacity|mixBlendMode|isolation|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomRightRadius|borderBottomLeftRadius|filter|backdropFilter|cursor|visibility|pointerEvents|userSelect|appearance|accentColor|caretColor|colorScheme|clipPath|scrollbarWidth|scrollbarColor|scrollbarGutter|forcedColorAdjust|contain|contentVisibility|willChange)$/)) return 'appearance';
  if (has(/^(backgroundColor|backgroundImage|backgroundSize|backgroundRepeat|backgroundPosition|backgroundAttachment|backgroundClip|backgroundOrigin|backgroundBlendMode|webkitBackgroundClip|webkitTextFillColor|mask)/)) return 'fill';
  if (has(/^(border(Top|Right|Bottom|Left)?(Width|Style|Color)|borderImage|outline)/)) return 'stroke';
  if (has(/^(boxShadow|textShadow)/)) return 'effects';
  // Safe fallback: typography (single `color` + nothing else used to be
  // `color` kind under the old system; under the new system `color` lives
  // in typography for text colours and Fill section for backgrounds — text
  // is the more common case for legacy saves).
  return 'typography';
}

function dedupName(base: string, existing: Preset[]): string {
  const taken = new Set(existing.map(p => p.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export async function saveCustomPreset(
  name: string,
  elementId: string,
  kind: PresetKind,
  props: string[],
): Promise<{ preset?: Preset; error?: string }> {
  const el = getElementById(elementId);
  if (!el) return { error: 'No element to capture' };
  if (!props || props.length === 0) return { error: 'No properties were specified for capture' };
  const cs = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of props) {
    const val = (cs as any)[prop];
    // Skip properties that are at their CSS default — the preset is more
    // useful (and smaller) without them. Keep `0` and other authored zero
    // values though (`'0' !== 'none'`).
    if (!val) continue;
    if (val === 'none' || val === 'normal' || val === 'auto') continue;
    styles[prop] = val;
  }
  if (Object.keys(styles).length === 0) {
    return { error: `No ${kind} styles found on this element to save` };
  }
  const existing = await getCustomPresets();
  const preset: Preset = {
    id: 'custom-' + Date.now(),
    name: dedupName(name.trim(), existing),
    kind,
    styles,
    isCustom: true,
    createdAt: Date.now(),
  };
  existing.push(preset);
  return new Promise((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: existing }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        // Roll back the in-memory copy and surface a clean message.
        existing.pop();
        resolve({ error: /QUOTA/i.test(err.message || '') ? quotaError() : err.message });
        return;
      }
      resolve({ preset });
    });
  });
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const existing = await getCustomPresets();
  const filtered = existing.filter(p => p.id !== id);
  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: filtered }, () => resolve());
  });
}

export async function updateCustomPreset(
  id: string,
  name: string,
  styles: Record<string, string>,
): Promise<{ ok: boolean; error?: string; invalidProps?: string[] }> {
  // Validate values via CSS.supports — flag invalid ones but still save the
  // valid subset so the user isn't blocked on a stray typo. Empty values are
  // dropped silently (the edit form uses an empty input to delete a property).
  const invalidProps: string[] = [];
  const validatedStyles: Record<string, string> = {};
  for (const [prop, val] of Object.entries(styles)) {
    if (!val) continue;
    const kebab = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    let ok = true;
    try { ok = CSS.supports(kebab, val); } catch { ok = true; }
    if (ok) validatedStyles[prop] = val;
    else invalidProps.push(prop);
  }
  const existing = await getCustomPresets();
  const updated = existing.map(p => p.id === id ? { ...p, name, styles: validatedStyles } : p);
  return new Promise((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: updated }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: /QUOTA/i.test(err.message || '') ? quotaError() : err.message });
        return;
      }
      resolve({ ok: true, invalidProps: invalidProps.length > 0 ? invalidProps : undefined });
    });
  });
}

export async function importPresets(presetsJson: string): Promise<{ count: number; total: number; error?: string }> {
  let incoming: Preset[];
  try { incoming = JSON.parse(presetsJson); } catch { return { count: 0, total: 0, error: 'Invalid JSON' }; }
  if (!Array.isArray(incoming)) return { count: 0, total: 0, error: 'Expected an array' };
  const total = incoming.length;
  const valid = incoming.filter(p => p && typeof p.name === 'string' && typeof p.styles === 'object');
  if (!valid.length) return { count: 0, total, error: 'No valid presets in file' };
  const existing = await getCustomPresets();
  const existingIds = new Set(existing.map(p => p.id));
  const existingNames = new Set(existing.map(p => p.name));
  const toAdd = valid
    .map(p => normalizeKind({
      ...p,
      id: existingIds.has(p.id) ? 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2) : (p.id || 'custom-' + Date.now()),
      name: existingNames.has(p.name) ? dedupName(p.name, existing) : p.name,
      isCustom: true,
    } as Preset));
  const merged = [...existing, ...toAdd];
  return new Promise((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: merged }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ count: 0, total, error: /QUOTA/i.test(err.message || '') ? quotaError() : err.message });
        return;
      }
      resolve({ count: toAdd.length, total });
    });
  });
}
