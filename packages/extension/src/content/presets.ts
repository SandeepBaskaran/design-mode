// ============================================================
// Design Mode — Presets System
// Custom presets (chrome.storage.sync) + Page token discovery
// ============================================================

import { getElementById } from './helpers';

export interface Preset {
  id: string;
  name: string;
  category: string;
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

  // Scan all accessible stylesheets for CSS custom properties
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
      } catch {
        // Cross-origin stylesheet — skip
      }
    }
  } catch {}

  if (allVars.size === 0) return [];

  // Group tokens by prefix
  const groups = new Map<string, TokenGroup>();

  for (const [cssVar, rawValue] of allVars) {
    // Resolve value from computed style if declared value is empty
    const value = rawValue || getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (!value) continue;

    const { name, property } = groupForVar(cssVar);
    if (!groups.has(name)) groups.set(name, { name, tokens: [] });
    groups.get(name)!.tokens.push({ cssVar, value, property });
  }

  // Determine which groups are relevant for the selected element type
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
  const role = el.getAttribute ? (el.getAttribute('role') || '') : '';

  // For specific element types, show ONLY the relevant groups (strict filter)
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
  // For div/section/main/article/etc — no filter, show all groups

  const allGroups = [...groups.values()].filter(g => g.tokens.length > 0);
  const result: TokenGroup[] = [];

  if (filterNames) {
    for (const name of filterNames) {
      const g = groups.get(name);
      if (g && g.tokens.length > 0) result.push(g);
    }
    // Fallback: if filtering yields nothing (page has no matching group names), return all
    if (result.length === 0) result.push(...allGroups);
  } else {
    // Generic elements: show all groups in a sensible order
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

// --- Custom Presets (stored in chrome.storage.sync for cross-site) ---

export async function getCustomPresets(): Promise<Preset[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('dm_custom_presets', (data) => {
      resolve(data.dm_custom_presets || []);
    });
  });
}

export async function saveCustomPreset(name: string, elementId: string): Promise<Preset | null> {
  const el = getElementById(elementId);
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  const props = ['backgroundColor', 'color', 'fontSize', 'fontWeight', 'fontFamily',
    'lineHeight', 'letterSpacing', 'textAlign', 'padding', 'margin', 'borderRadius',
    'border', 'boxShadow', 'opacity', 'filter', 'backdropFilter', 'transform',
    'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap',
    'width', 'height', 'maxWidth', 'minHeight', 'overflow', 'cursor',
    'textTransform', 'textDecoration', 'mixBlendMode', 'backgroundImage'];
  for (const prop of props) {
    const val = (cs as any)[prop];
    if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px' && val !== 'visible') {
      styles[prop] = val;
    }
  }
  const preset: Preset = {
    id: 'custom-' + Date.now(),
    name,
    category: 'custom',
    styles,
    isCustom: true,
    createdAt: Date.now(),
  };
  const existing = await getCustomPresets();
  existing.push(preset);
  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: existing }, resolve);
  });
  return preset;
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const existing = await getCustomPresets();
  const filtered = existing.filter(p => p.id !== id);
  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: filtered }, resolve);
  });
}

export async function updateCustomPreset(id: string, name: string, styles: Record<string, string>): Promise<void> {
  const existing = await getCustomPresets();
  const updated = existing.map(p => p.id === id ? { ...p, name, styles } : p);
  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: updated }, resolve);
  });
}

export async function importPresets(presetsJson: string): Promise<number> {
  let incoming: Preset[];
  try { incoming = JSON.parse(presetsJson); } catch { return 0; }
  if (!Array.isArray(incoming)) return 0;
  const valid = incoming.filter(p => p && typeof p.name === 'string' && typeof p.styles === 'object');
  if (!valid.length) return 0;
  const existing = await getCustomPresets();
  const existingIds = new Set(existing.map(p => p.id));
  const toAdd = valid
    .map(p => ({ ...p, id: existingIds.has(p.id) ? 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2) : p.id, category: 'custom', isCustom: true }))
    .filter(p => !existingIds.has(p.id));
  const merged = [...existing, ...toAdd];
  await new Promise<void>((resolve) => {
    chrome.storage.sync.set({ dm_custom_presets: merged }, resolve);
  });
  return toAdd.length;
}

export function applyPreset(elementId: string, preset: Preset): boolean {
  const el = getElementById(elementId);
  if (!el) return false;
  for (const [prop, val] of Object.entries(preset.styles)) {
    (el.style as any)[prop] = val;
  }
  return true;
}
