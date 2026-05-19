// ============================================================
// Design Mode — Change Tracker
// Records style/text/DOM changes, generates CSS diffs, syncs to server
// ============================================================

import { getElementById, generateSelector, getComputedStyleSubset, reserveIdsAtLeast } from './helpers';
import { DEFAULT_WS_PORT, DATA_ATTR } from '../shared';
import { BUILTIN_KEYFRAMES } from './keyframes-library';
import { captureElementScreenshot, captureViewportScreenshot } from './screenshots';

export interface StyleChange {
  id: string; elementId: string; selector: string;
  property: string; oldValue: string; newValue: string;
  timestamp: number;
  // Optional grouping envelope. Multiple StyleChanges sharing a `groupId`
  // collapse into one row in the Changes tab. `groupKind` shapes the row
  // label (`PRESET`, `APPLIED to N`, `HIDE`). When `groupKind` is set
  // without a `groupId`, it's a single-row label override (visibility).
  groupId?: string;
  groupKind?: 'preset' | 'multi-select' | 'visibility';
  groupLabel?: string;
}

export interface StyleChangeMeta {
  groupId?: string;
  groupKind?: 'preset' | 'multi-select' | 'visibility';
  groupLabel?: string;
}

export interface TextChange {
  id: string; elementId: string; selector: string;
  oldText: string; newText: string; timestamp: number;
  // When true, oldText/newText carry HTML (innerHTML); revert paths must
  // use el.innerHTML, not el.textContent. Set by applyHtmlChange.
  isHtml?: boolean;
}

export interface DomChange {
  id: string; elementId: string; selector: string;
  action: 'delete' | 'duplicate' | 'move' | 'insert';
  tagName: string; outerHTML?: string;
  // Where the element ended up. Lets us replay the move / re-create the
  // duplicate at the right position. `parentId` is the data-dm-id of the
  // parent at record time; preferred on replay because the user-friendly
  // `parentSelector` can resolve to the wrong element if the page has
  // been mutated since (selectors with `nth-of-type` are especially
  // fragile across reorders).
  destination?: { parentSelector: string; index: number; parentId?: string };
  // Where the element was BEFORE the (first) move / delete. Captured once
  // and never updated on subsequent moves so Clear All can put it back
  // regardless of how many times it was dragged.
  origin?: { parentSelector: string; index: number; parentId?: string };
  timestamp: number;
}

const styleChanges: StyleChange[] = [];
const textChanges: TextChange[] = [];
const domChanges: DomChange[] = [];
let ws: WebSocket | null = null;

export function getStyleChanges() { return [...styleChanges]; }
export function getTextChanges() { return [...textChanges]; }
export function getDomChanges() { return [...domChanges]; }

export function getAllChanges(): Array<StyleChange | TextChange | DomChange> {
  return [...styleChanges, ...textChanges, ...domChanges].sort((a, b) => a.timestamp - b.timestamp);
}

export function clearAllChanges() {
  styleChanges.length = 0;
  textChanges.length = 0;
  domChanges.length = 0;
  clearAllRules();
  persistSession();
}

// ── Managed override stylesheet ─────────────────────────────────────
// Edits land as rules in a single <style id="dm-applied-styles">, keyed
// by the change's elementId. Each rule injects with the precise
// `[data-dm-id="<id>"]` selector so it targets EXACTLY that element —
// not lookalikes, not duplicates, not siblings that happen to match the
// user-friendly selector. The user-friendly selector is still saved on
// the StyleChange (for display + the "apply to N matching" zap), but
// the live CSS rule is element-scoped to prevent edit-bleed between
// the original and a duplicate.

const appliedRules = new Map<string, Map<string, string>>(); // elementId -> prop -> value
const injectedKeyframes = new Set<string>();
let appliedStyleEl: HTMLStyleElement | null = null;

// CSS properties that inherit by default. Writing one of these on a
// container visually cascades to every text-bearing descendant, which
// users perceive as a "all my layers changed!" fan-out bug. We emit a
// companion rule that resets the property to `revert` on every nested
// element the panel has stamped (i.e. has a data-dm-id), so the user's
// edit feels local — matches Figma's mental model.
const INHERITED_TYPOGRAPHY_PROPS = new Set([
  'textAlign','color','fontFamily','fontSize','fontWeight','fontStyle','fontVariant',
  'lineHeight','letterSpacing','wordSpacing','textTransform','textIndent','whiteSpace',
  'direction','textShadow','visibility',
]);

function kebab(prop: string): string {
  return prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

// ── Overlay effects (Noise / Texture) ────────────────────────────────
// The side panel writes one synthetic CSS prop `__effect_overlay`
// carrying a JSON array of overlay entries. At stylesheet build time we
// translate the array into an `::after` pseudo-element with chained
// background-image SVG data URIs (one per visible entry). Doesn't
// affect the element's layout — the pseudo is position:absolute and
// pointer-events:none, just like the Layout Guide overlay.

interface NoiseOverlay {
  kind: 'noise';
  visible?: boolean;
  mode: 'mono' | 'duo' | 'multi';
  sizeX: number; sizeY: number; density: number;
  color1: string; color1Opacity: number;
  color2: string; color2Opacity: number;
  opacity: number;
}
interface TextureOverlay {
  kind: 'texture';
  visible?: boolean;
  sizeX: number; sizeY: number; radius: number; clipToShape: boolean;
}
type OverlayEntry = NoiseOverlay | TextureOverlay;

function parseOverlayChain(value: string): OverlayEntry[] {
  if (!value || value === 'none') return [];
  try {
    const arr = JSON.parse(value);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e: any) => e && (e.kind === 'noise' || e.kind === 'texture'));
  } catch { return []; }
}

// Decode a hex / rgb string into RGB (0..1 floats) so feColorMatrix
// can tint the noise to the user's colour. Falls back to black on
// unknown formats; the tint is a soft no-op (transparent black).
function hexToRgbFloat(hex: string): { r: number; g: number; b: number } {
  if (!hex) return { r: 0, g: 0, b: 0 };
  const m6 = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m6) return { r: parseInt(m6[1], 16) / 255, g: parseInt(m6[2], 16) / 255, b: parseInt(m6[3], 16) / 255 };
  const m3 = hex.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m3) return { r: parseInt(m3[1] + m3[1], 16) / 255, g: parseInt(m3[2] + m3[2], 16) / 255, b: parseInt(m3[3] + m3[3], 16) / 255 };
  const rgb = hex.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(',').map(s => parseFloat(s.trim()));
    return { r: (parts[0] || 0) / 255, g: (parts[1] || 0) / 255, b: (parts[2] || 0) / 255 };
  }
  return { r: 0, g: 0, b: 0 };
}

// SVG noise builder. feTurbulence generates the grain; the mode picks
// a colour pipeline:
//   • Mono — feColorMatrix tints to color1 at color1Opacity * density.
//   • Duo  — two layered SVGs (one per colour). We return the Mono
//     pipeline here; the caller stacks a second URL for color2.
//   • Multi — passthrough noise (full-spectrum colour) attenuated by
//     `opacity`.
// baseFrequency = density/100 / size, capped to avoid extreme values.
function buildNoiseDataUri(entry: NoiseOverlay, useSecondColor = false): string {
  const sizeX = Math.max(0.1, Math.min(5, entry.sizeX || 0.5));
  const sizeY = Math.max(0.1, Math.min(5, entry.sizeY || 0.5));
  const density = Math.max(0, Math.min(100, entry.density || 0)) / 100;
  const baseFreqX = (density / sizeX).toFixed(3);
  const baseFreqY = (density / sizeY).toFixed(3);
  const tile = 256;
  let filterBody = `<feTurbulence type='fractalNoise' baseFrequency='${baseFreqX} ${baseFreqY}' numOctaves='2' stitchTiles='stitch'/>`;
  if (entry.mode === 'multi') {
    // Multi — keep colour, attenuate alpha by entry.opacity.
    const a = Math.max(0, Math.min(100, entry.opacity || 0)) / 100;
    filterBody += `<feColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${a.toFixed(3)} 0'/>`;
  } else {
    // Mono / Duo — tint to the selected colour at its opacity.
    const color = useSecondColor ? entry.color2 : entry.color1;
    const opacityPct = useSecondColor ? entry.color2Opacity : entry.color1Opacity;
    const a = Math.max(0, Math.min(100, opacityPct || 0)) / 100;
    const { r, g, b } = hexToRgbFloat(color);
    filterBody += `<feColorMatrix values='0 0 0 0 ${r.toFixed(3)} 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 ${b.toFixed(3)} 0 0 0 ${a.toFixed(3)} 0'/>`;
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'>` +
      `<filter id='n'>${filterBody}</filter>` +
      `<rect width='100%' height='100%' filter='url(%23n)'/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${svg.replace(/#/g, '%23').replace(/"/g, "'")}")`;
}

// SVG texture builder. Turbulence with feGaussianBlur for a paper /
// canvas grain. Tinted to mid-gray so it composes by darkening; user
// adjusts radius to soften or sharpen the grain.
function buildTextureDataUri(entry: TextureOverlay): string {
  const sizeX = Math.max(0.1, Math.min(5, entry.sizeX || 0.5));
  const sizeY = Math.max(0.1, Math.min(5, entry.sizeY || 0.5));
  const radius = Math.max(0, Math.min(20, entry.radius || 0));
  const baseFreqX = (0.04 / sizeX).toFixed(3);
  const baseFreqY = (0.04 / sizeY).toFixed(3);
  const tile = 256;
  const filterBody =
    `<feTurbulence type='turbulence' baseFrequency='${baseFreqX} ${baseFreqY}' numOctaves='3' stitchTiles='stitch'/>` +
    (radius > 0 ? `<feGaussianBlur stdDeviation='${radius.toFixed(2)}'/>` : '') +
    `<feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.35 0'/>`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'>` +
      `<filter id='t'>${filterBody}</filter>` +
      `<rect width='100%' height='100%' filter='url(%23t)'/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${svg.replace(/#/g, '%23').replace(/"/g, "'")}")`;
}

// Build the `::after` CSS for one element from its overlay JSON value.
// Returns an empty string when there's nothing visible to paint so
// the host doesn't get pointless `position: relative` / pseudo blocks.
function buildOverlayCss(elementId: string, value: string): string {
  const entries = parseOverlayChain(value).filter(e => e.visible !== false);
  if (!entries.length) return '';
  const images: string[] = [];
  let anyClipToShape = false;
  for (const e of entries) {
    if (e.kind === 'noise') {
      images.push(buildNoiseDataUri(e, false));
      if (e.mode === 'duo') images.push(buildNoiseDataUri(e, true));
    } else if (e.kind === 'texture') {
      images.push(buildTextureDataUri(e));
      if (e.clipToShape) anyClipToShape = true;
    }
  }
  if (!images.length) return '';
  return `[data-dm-id="${elementId}"][data-dm-id] {\n` +
    `  position: relative !important;\n` +
    `}\n` +
    `[data-dm-id="${elementId}"]::after {\n` +
    `  content: '' !important;\n` +
    `  position: absolute !important;\n` +
    `  inset: 0 !important;\n` +
    `  pointer-events: none !important;\n` +
    `  z-index: 2147483645 !important;\n` +
    `  background-image: ${images.join(', ')} !important;\n` +
    `  background-repeat: repeat !important;\n` +
    (anyClipToShape ? `  border-radius: inherit !important;\n  clip-path: inherit !important;\n` : '') +
    `}`;
}

function ensureStyleEl(): HTMLStyleElement {
  if (appliedStyleEl && appliedStyleEl.isConnected) return appliedStyleEl;
  const existing = document.getElementById('dm-applied-styles') as HTMLStyleElement | null;
  if (existing) { appliedStyleEl = existing; return existing; }
  const el = document.createElement('style');
  el.id = 'dm-applied-styles';
  (document.head || document.documentElement).appendChild(el);
  appliedStyleEl = el;
  return el;
}

function rebuildStyleSheet() {
  const el = ensureStyleEl();
  const blocks: string[] = [];
  for (const name of injectedKeyframes) {
    const kf = BUILTIN_KEYFRAMES[name];
    if (kf) blocks.push(kf);
  }
  for (const [elementId, props] of appliedRules) {
    if (props.size === 0) continue;
    const decls: string[] = [];
    // !important + duplicated attribute selector (specificity 0,2,0) so the
    // override sheet beats page CSS that uses chained classes or its own
    // !important (Tailwind, BEM, design-system layers). The override sheet
    // is "user intent expressed after the page has rendered" — by definition
    // it should win over the page's authored styles.
    for (const [prop, val] of props) {
      // __effect_overlay is a synthetic prop translated into a
      // ::after pseudo-element overlay below; skip the primary decl
      // emission so we don't write `--effect-overlay: <json>` onto
      // the host element.
      if (prop === '__effect_overlay') continue;
      decls.push(`  ${kebab(prop)}: ${val} !important;`);
    }
    if (decls.length) {
      blocks.push(`[data-dm-id="${elementId}"][data-dm-id] {\n${decls.join('\n')}\n}`);
    }
    // For inherited typography props, stop the cascade at any descendant
    // the panel has stamped. The user only "wrote" the value on the
    // selected element; siblings/children with their own data-dm-id keep
    // their natural value via `revert`. Specificity (0,2,0 ancestor +
    // 0,1,0 descendant) means the reset only wins on actual descendants
    // — the original block still applies to the target itself.
    const inheritedDecls: string[] = [];
    for (const [prop] of props) {
      if (INHERITED_TYPOGRAPHY_PROPS.has(prop)) {
        inheritedDecls.push(`  ${kebab(prop)}: revert;`);
      }
    }
    if (inheritedDecls.length) {
      blocks.push(`[data-dm-id="${elementId}"] [data-dm-id] {\n${inheritedDecls.join('\n')}\n}`);
    }
    // Overlay effects (Noise / Texture) — translate `__effect_overlay`
    // into a `::after` block with chained SVG-data-URI background-images.
    const overlayVal = props.get('__effect_overlay');
    if (overlayVal && overlayVal !== 'none') {
      const css = buildOverlayCss(elementId, overlayVal);
      if (css) blocks.push(css);
    }
  }
  el.textContent = blocks.join('\n\n');
}

function upsertRule(elementId: string, property: string, value: string) {
  if (!appliedRules.has(elementId)) appliedRules.set(elementId, new Map());
  appliedRules.get(elementId)!.set(property, value);
  if (property === 'animationName' || property === 'animation-name') {
    if (BUILTIN_KEYFRAMES[value]) injectedKeyframes.add(value);
  }
  rebuildStyleSheet();
}

function removeRule(elementId: string, property: string) {
  const props = appliedRules.get(elementId);
  if (!props) return;
  props.delete(property);
  if (props.size === 0) appliedRules.delete(elementId);
  rebuildStyleSheet();
}

function clearAllRules() {
  appliedRules.clear();
  injectedKeyframes.clear();
  rebuildStyleSheet();
}

// Toggle the override sheet for "preview original" mode without losing
// any state — flipping `disabled` is one DOM op.
export function setOverridesEnabled(enabled: boolean) {
  const el = ensureStyleEl();
  el.disabled = !enabled;
}

// No-op kept for back-compat with content/index.ts call sites.
export function scheduleRestamp() { /* selector-based rules don't need restamping */ }

// ── Session persistence (per URL) ──────────────────────────────────
// Saves changes to chrome.storage.session keyed by origin+pathname+search,
// so DOM/style/text edits survive page reloads and back/forward navigation
// within the same browser session.

function sessionKey(): string {
  return 'dm_session:' + location.origin + location.pathname + location.search;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
export function persistSession() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const payload = { styleChanges, textChanges, domChanges, savedAt: Date.now() };
      const storage: any = (chrome.storage as any).session || chrome.storage.local;
      storage.set({ [sessionKey()]: payload });
    } catch {}
  }, 100);
}

export function loadSession(): Promise<{ styleChanges: StyleChange[]; textChanges: TextChange[]; domChanges: DomChange[] } | null> {
  return new Promise((resolve) => {
    try {
      const storage: any = (chrome.storage as any).session || chrome.storage.local;
      storage.get(sessionKey(), (data: any) => {
        const payload = data?.[sessionKey()];
        if (!payload) return resolve(null);
        resolve({
          styleChanges: payload.styleChanges || [],
          textChanges: payload.textChanges || [],
          domChanges: payload.domChanges || [],
        });
      });
    } catch { resolve(null); }
  });
}

// Replays a payload of changes onto the current DOM and replaces the in-
// memory arrays so the side panel reflects them. Used by both
// replaySession (storage-backed) and the IMPORT_CHANGES message handler.
export function applyChangesPayload(saved: { styleChanges: StyleChange[]; textChanges: TextChange[]; domChanges: DomChange[] }) {
  // Order matters here. DOM mutations run FIRST (so duplicates / inserts
  // exist with their stamped data-dm-id before anything else binds to
  // them). Then text changes (which can now find duplicates by id).
  // Then style rules (which are id-scoped — `[data-dm-id="X"]` — so
  // they need the element + its data-dm-id present).

  // Replay DOM mutations in chronological order. duplicate / insert
  // come first in any user's edit sequence (you can't move what you
  // haven't created yet) so iterating saved order naturally satisfies
  // the precondition that a `move` finds its source already in the DOM.
  //
  // Each action's reconstruction:
  //   * duplicate / insert  → re-create from outerHTML at destination,
  //                            stamp the recorded data-dm-id back on it
  //                            so subsequent move entries can find it.
  //   * move                → relocate by id-or-selector to destination.
  //   * delete              → remove the element by selector.
  //
  // Older exports without outerHTML / destination on duplicate / insert
  // skip cleanly (no reconstruction possible) — same behaviour as before.
  // Helper: resolve the parent of a destination/origin record. Prefers
  // parentId (data-dm-id stamped at record time) — that's stable across
  // reorders. Falls back to parentSelector if the id is missing or has
  // since been stripped from the DOM. Final fallback is body so the
  // element doesn't vanish entirely.
  const resolveParent = (loc: { parentSelector: string; index: number; parentId?: string } | undefined): HTMLElement | null => {
    if (!loc) return null;
    if (loc.parentId) {
      const byId = document.querySelector(`[${DATA_ATTR}="${loc.parentId}"]`) as HTMLElement | null;
      if (byId) return byId;
    }
    try {
      const bySel = document.querySelector(loc.parentSelector) as HTMLElement | null;
      if (bySel) return bySel;
    } catch {}
    return null;
  };

  for (const c of saved.domChanges) {
    try {
      if (c.action === 'duplicate' || c.action === 'insert') {
        // Skip if it's already in the DOM (mid-session replay where
        // we never lost the page) or if we have no outerHTML to work
        // with (legacy entry from before this fix).
        const existing = document.querySelector(`[${DATA_ATTR}="${c.elementId}"]`);
        if (existing || !c.outerHTML || !c.destination) continue;
        const tmpl = document.createElement('template');
        tmpl.innerHTML = c.outerHTML.trim();
        const fragment = tmpl.content.firstElementChild as HTMLElement | null;
        if (!fragment) continue;
        // Stamp the recorded id onto the reconstructed element so a
        // subsequent move with the same elementId can locate it via
        // [data-dm-id].
        fragment.setAttribute(DATA_ATTR, c.elementId);
        const parent = resolveParent(c.destination);
        if (!parent) continue;
        const siblings = Array.from(parent.children);
        const idx = Math.min(c.destination.index, siblings.length);
        const before = siblings[idx];
        if (before) parent.insertBefore(fragment, before);
        else parent.appendChild(fragment);
      } else if (c.action === 'move' && c.destination) {
        // Prefer id-based lookup for both source and parent — selectors
        // recorded at edit time may describe positions that no longer
        // match after a reconstruction.
        const source =
          (document.querySelector(`[${DATA_ATTR}="${c.elementId}"]`) as HTMLElement | null) ||
          (document.querySelector(c.selector) as HTMLElement | null);
        const parent = resolveParent(c.destination);
        if (source && parent) {
          const siblings = Array.from(parent.children);
          const idx = Math.min(c.destination.index, siblings.length);
          const before = siblings[idx] === source ? siblings[idx + 1] : siblings[idx];
          if (before && before !== source) parent.insertBefore(source, before);
          else if (!before) parent.appendChild(source);
        }
      } else if (c.action === 'delete') {
        const el = document.querySelector(c.selector);
        if (el) el.remove();
      }
    } catch {}
  }

  // Text changes — prefer id-based lookup so edits to a re-created
  // duplicate find the correct element. Falls back to the saved
  // user-friendly selector for changes on elements that never carried
  // a data-dm-id attribute on the saved page.
  for (const c of saved.textChanges) {
    try {
      const el =
        (document.querySelector(`[${DATA_ATTR}="${c.elementId}"]`) as HTMLElement | null) ||
        (document.querySelector(c.selector) as HTMLElement | null);
      if (!el) continue;
      // Stamp the id so id-scoped rules below can bind, even if the
      // element didn't have data-dm-id before.
      if (!el.hasAttribute(DATA_ATTR)) el.setAttribute(DATA_ATTR, c.elementId);
      if (c.isHtml) el.innerHTML = c.newText;
      else el.textContent = c.newText;
    } catch {}
  }

  // Now that duplicate / insert reconstructions are in place (each
  // bearing its recorded data-dm-id), inject the style rules. They're
  // keyed by elementId, so we ALSO stamp data-dm-id back onto any
  // element that the change record's user-friendly selector resolves
  // to but doesn't yet carry the attribute. Without this stamp, a
  // post-reload page (which renders its own DOM with no design-mode
  // attributes) wouldn't have anything for `[data-dm-id="X"]` to bind.
  for (const c of saved.styleChanges) {
    let target = document.querySelector(`[${DATA_ATTR}="${c.elementId}"]`) as HTMLElement | null;
    if (!target && c.selector) {
      try { target = document.querySelector(c.selector) as HTMLElement | null; } catch {}
      if (target) target.setAttribute(DATA_ATTR, c.elementId);
    }
    if (!appliedRules.has(c.elementId)) appliedRules.set(c.elementId, new Map());
    appliedRules.get(c.elementId)!.set(c.property, c.newValue);
    if ((c.property === 'animationName' || c.property === 'animation-name') && BUILTIN_KEYFRAMES[c.newValue]) {
      injectedKeyframes.add(c.newValue);
    }
  }
  rebuildStyleSheet();

  styleChanges.length = 0; styleChanges.push(...saved.styleChanges);
  textChanges.length = 0; textChanges.push(...saved.textChanges);
  domChanges.length = 0; domChanges.push(...saved.domChanges);
  reserveIdsAtLeast([
    ...saved.styleChanges.map(c => c.elementId),
    ...saved.textChanges.map(c => c.elementId),
    ...saved.domChanges.map(c => c.elementId),
  ]);
  persistSession();
}

export async function replaySession(): Promise<boolean> {
  const saved = await loadSession();
  if (!saved) return false;
  applyChangesPayload(saved);
  return true;
}

// Reorder changes by moving an item from one index to another
export function reorderChange(fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= styleChanges.length) return;
  if (toIndex < 0 || toIndex >= styleChanges.length) return;
  const [item] = styleChanges.splice(fromIndex, 1);
  styleChanges.splice(toIndex, 0, item);
}

export function removeStyleChange(id: string): void {
  const idx = styleChanges.findIndex(c => c.id === id);
  if (idx !== -1) {
    const ch = styleChanges[idx];
    removeRule(ch.elementId, ch.property);
    styleChanges.splice(idx, 1);
    persistSession();
  }
}

export function removeDomChange(id: string): void {
  const idx = domChanges.findIndex(c => c.id === id);
  if (idx !== -1) { domChanges.splice(idx, 1); persistSession(); }
}

export function removeTextChange(id: string): void {
  const idx = textChanges.findIndex(c => c.id === id);
  if (idx !== -1) { textChanges.splice(idx, 1); persistSession(); }
}

// ── Companion auto-fix ─────────────────────────────────────────────
// Many CSS properties only paint when a sibling property is also set
// to a non-default. Setting `border-top-width: 4px` while
// `border-top-style: none` paints nothing; same for outline; same for
// `transition-property` while duration is `0s`; same for `top/left`
// while position is `static`. The user expectation is "I edited this,
// it should show" — so when we detect one of these well-known traps
// before the user's edit, we write the missing companion first. All
// companions emitted by one user action share a `groupId` so the
// Changes tab collapses them into a single revertable row.
//
// Each companion rule is gated on the *current computed value* — if
// the user has already set the companion to something visible, we
// leave it alone.

const NUM_RE = /^(-?\d*\.?\d+)\s*([a-z%]*)$/i;
function asPxNumber(v: string): number {
  if (!v) return 0;
  if (v === 'auto' || v === 'normal' || v === 'none') return 0;
  const m = v.trim().match(NUM_RE);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return isNaN(n) ? 0 : n;
}

function durationToMs(v: string): number {
  if (!v) return 0;
  const t = v.trim();
  // computed value may be a comma list; first non-zero wins
  for (const part of t.split(',')) {
    const s = part.trim();
    const m = s.match(/^(-?\d*\.?\d+)\s*(ms|s)?$/i);
    if (!m) continue;
    const n = parseFloat(m[1]);
    if (isNaN(n) || n === 0) continue;
    return (m[2]?.toLowerCase() === 's') ? n * 1000 : n;
  }
  return 0;
}

interface Companion { property: string; value: string; }

export function computeCompanions(
  property: string, value: string, cs: CSSStyleDeclaration,
): Companion[] {
  const out: Companion[] = [];
  const v = (value ?? '').toString().trim();
  if (!v) return out;
  const get = (p: string) => cs.getPropertyValue(p).trim();

  // Border longhands — width or color set, but style is none → nothing draws.
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    if (property === `border${side[0].toUpperCase()}${side.slice(1)}Width` || property === `border-${side}-width`) {
      if (asPxNumber(v) > 0 && get(`border-${side}-style`) === 'none') {
        out.push({ property: `border-${side}-style`, value: 'solid' });
      }
    }
    if (property === `border${side[0].toUpperCase()}${side.slice(1)}Color` || property === `border-${side}-color`) {
      if (get(`border-${side}-style`) === 'none') out.push({ property: `border-${side}-style`, value: 'solid' });
      if (asPxNumber(get(`border-${side}-width`)) === 0) out.push({ property: `border-${side}-width`, value: '1px' });
    }
  }
  // Outline mirrors border.
  if (property === 'outlineWidth' || property === 'outline-width') {
    if (asPxNumber(v) > 0 && get('outline-style') === 'none') out.push({ property: 'outline-style', value: 'solid' });
  }
  if (property === 'outlineColor' || property === 'outline-color') {
    if (get('outline-style') === 'none') out.push({ property: 'outline-style', value: 'solid' });
    if (asPxNumber(get('outline-width')) === 0) out.push({ property: 'outline-width', value: '1px' });
  }
  // Transition — picking properties with no duration is invisible.
  if (property === 'transitionProperty' || property === 'transition-property') {
    if (v !== 'none' && durationToMs(get('transition-duration')) === 0) {
      out.push({ property: 'transition-duration', value: '200ms' });
    }
  }
  // Animation — naming a keyframes set with 0s duration runs nothing.
  if (property === 'animationName' || property === 'animation-name') {
    if (v !== 'none' && durationToMs(get('animation-duration')) === 0) {
      out.push({ property: 'animation-duration', value: '1s' });
    }
  }
  // Position offsets / z-index — useless on `position: static`.
  if (
    property === 'top' || property === 'right' || property === 'bottom' || property === 'left' ||
    property === 'zIndex' || property === 'z-index'
  ) {
    if (get('position') === 'static') out.push({ property: 'position', value: 'relative' });
  }
  // Text-decoration sub-properties only render with a line.
  if (
    property === 'textDecorationColor' || property === 'text-decoration-color' ||
    property === 'textDecorationStyle' || property === 'text-decoration-style' ||
    property === 'textDecorationThickness' || property === 'text-decoration-thickness'
  ) {
    if (get('text-decoration-line') === 'none') out.push({ property: 'text-decoration-line', value: 'underline' });
  }
  return out;
}

// Wraps applyStyleChange with companion writes that share a groupId so
// the Changes tab collapses them into a single auto-fix row. Returns
// the *primary* StyleChange (the user's edit) so callers can still hook
// undo bookkeeping to it as before.
export function applyWithCompanions(
  elementId: string, property: string, value: string,
  refreshPanel?: () => void,
  meta?: StyleChangeMeta,
): StyleChange | null {
  const el = getElementById(elementId);
  if (!el) return applyStyleChange(elementId, property, value, refreshPanel, meta);
  const cs = window.getComputedStyle(el);
  const companions = computeCompanions(property, value, cs);
  if (companions.length > 0) {
    // Reuse the caller's groupId when present (e.g. preset / multi-select)
    // so auto-fixes ride along inside the same Changes-tab row instead of
    // creating a parallel auto-fix row.
    const groupId = meta?.groupId ?? `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const groupLabel = meta?.groupLabel ?? 'Auto-fix';
    const groupKind = meta?.groupKind ?? 'preset';
    for (const c of companions) {
      applyStyleChange(elementId, c.property, c.value, undefined, { groupId, groupKind, groupLabel });
    }
    return applyStyleChange(elementId, property, value, refreshPanel, { groupId, groupKind, groupLabel });
  }
  return applyStyleChange(elementId, property, value, refreshPanel, meta);
}

export function applyStyleChange(
  elementId: string, property: string, value: string,
  refreshPanel?: () => void,
  meta?: StyleChangeMeta,
): StyleChange | null {
  const el = getElementById(elementId);
  if (!el) return null;
  const k = kebab(property);
  const selector = generateSelector(el);

  // Deduplication: keep original oldValue, update newValue + timestamp.
  // Meta semantics on dedupe: a fresh `meta` overwrites the existing
  // entry's group fields (the new gesture re-classifies it). Calls
  // without meta leave group fields untouched — a no-meta dedupe is
  // assumed to be a follow-up edit in the same context.
  const existingIdx = styleChanges.findIndex(c => c.elementId === elementId && c.property === property);
  if (existingIdx !== -1) {
    const existing = styleChanges[existingIdx];
    if (value === existing.oldValue || value === '') {
      // Value returned to original (or cleared) — drop the rule and the change entry
      removeRule(elementId, property);
      styleChanges.splice(existingIdx, 1);
      persistSession();
      if (refreshPanel) refreshPanel();
      return null;
    }
    // Rules are keyed by elementId so the live CSS scope-by-data-dm-id
    // doesn't move when the element's user-friendly selector drifts.
    upsertRule(elementId, property, value);
    const merged: StyleChange = { ...existing, newValue: value, timestamp: Date.now() };
    if (meta) {
      merged.groupId = meta.groupId;
      merged.groupKind = meta.groupKind;
      merged.groupLabel = meta.groupLabel;
    }
    styleChanges[existingIdx] = merged;
    syncChange(merged);
    persistSession();
    if (refreshPanel) refreshPanel();
    return merged;
  }

  const oldValue = window.getComputedStyle(el).getPropertyValue(k);
  upsertRule(elementId, property, value);
  // We used to drop rules whose computed value didn't change (invalid CSS,
  // var() that resolves to the same color, etc.) but that swallowed valid
  // user intent — record the change and let the user confirm visually.
  const change: StyleChange = {
    id: crypto.randomUUID(), elementId, selector,
    property, oldValue, newValue: value, timestamp: Date.now(),
    groupId: meta?.groupId,
    groupKind: meta?.groupKind,
    groupLabel: meta?.groupLabel,
  };
  styleChanges.push(change);
  syncChange(change);
  persistSession();
  if (refreshPanel) refreshPanel();
  // Dev-only canary: log every applyStyle attempt with before → after
  // computed values. Most rows will be `✓ moved`; any `✗ no-op` line
  // points at a remaining failure mode (specificity loss, missing
  // companion, invalid value). Off by default; enable in the page
  // DevTools with `localStorage.setItem('dm-debug', '1')`.
  try {
    if (localStorage.getItem('dm-debug') === '1') {
      requestAnimationFrame(() => {
        const after = window.getComputedStyle(el).getPropertyValue(k);
        const moved = after !== oldValue;
        // Best-effort hint about WHY a no-op happened — saves the user
        // from inspecting the page rules themselves.
        let hint = '';
        if (!moved) {
          const cs2 = window.getComputedStyle(el);
          if (/^border-(top|right|bottom|left)-(width|color)$/.test(k)) {
            const side = k.split('-')[1];
            if (cs2.getPropertyValue(`border-${side}-style`).trim() === 'none') hint = `border-${side}-style is none`;
          } else if (k === 'outline-width' || k === 'outline-color') {
            if (cs2.getPropertyValue('outline-style').trim() === 'none') hint = 'outline-style is none';
          } else if (k === 'transition-property' && durationToMs(cs2.getPropertyValue('transition-duration')) === 0) {
            hint = 'transition-duration is 0s';
          } else if (k === 'animation-name' && durationToMs(cs2.getPropertyValue('animation-duration')) === 0) {
            hint = 'animation-duration is 0s';
          } else if ((k === 'top' || k === 'left' || k === 'right' || k === 'bottom' || k === 'z-index') &&
                     cs2.getPropertyValue('position').trim() === 'static') {
            hint = 'position is static';
          } else if (cs2.getPropertyValue('display').trim() === 'none') {
            hint = 'element is display:none';
          } else {
            hint = 'page CSS may be more specific';
          }
        }
        const tag = moved ? '✓ moved' : `✗ no-op: ${hint}`;
        // eslint-disable-next-line no-console
        console.log(`[design-mode] applyStyle ${property} ${value} → "${after}" (${tag})`, { selector });
      });
    }
  } catch {}
  return change;
}

export function applyTextChange(
  elementId: string, text: string,
  refreshPanel?: () => void
): TextChange | null {
  const el = getElementById(elementId);
  if (!el) return null;
  const oldText = el.textContent || '';
  el.textContent = text;
  const change: TextChange = {
    id: crypto.randomUUID(), elementId, selector: generateSelector(el),
    oldText, newText: text, timestamp: Date.now(),
  };
  textChanges.push(change);
  syncTextChange(change);
  persistSession();
  if (refreshPanel) refreshPanel();
  return change;
}

// Same shape as applyTextChange, but writes innerHTML so rich-text edits
// (bold / italic / lists / links from the side panel's contenteditable)
// preserve formatting on the page AND through revert. Marks the record
// with `isHtml: true` so CLEAR_CHANGES / REMOVE_CHANGE / UNDO / REDO know
// to use el.innerHTML instead of el.textContent.
export function applyHtmlChange(
  elementId: string, html: string,
  refreshPanel?: () => void,
): TextChange | null {
  const el = getElementById(elementId);
  if (!el) return null;
  const oldHtml = el.innerHTML || '';
  el.innerHTML = html;
  const change: TextChange = {
    id: crypto.randomUUID(), elementId, selector: generateSelector(el),
    oldText: oldHtml, newText: html, timestamp: Date.now(), isHtml: true,
  };
  textChanges.push(change);
  syncTextChange(change);
  persistSession();
  if (refreshPanel) refreshPanel();
  return change;
}

// Returns the recorded change, OR null when the change cancels out an
// earlier one and shouldn't be logged at all (delete-of-extension-created
// element, move-back-to-origin). Callers that already discarded the
// return value continue to work — the persistent log just gets cleaner.
export function recordDomChange(
  elementId: string, selector: string, action: DomChange['action'],
  tagName: string, outerHTML?: string,
  destination?: DomChange['destination'],
  origin?: DomChange['origin']
): DomChange | null {
  // Dedup 'move' actions per element — if the user drags the same layer
  // around multiple times we only care about its final position, not the
  // breadcrumb trail. Preserve the FIRST move's `origin` so Clear All can
  // put the element back where it started, regardless of intermediate drags.
  let inheritedOrigin = origin;
  if (action === 'move') {
    for (let i = domChanges.length - 1; i >= 0; i--) {
      const prev = domChanges[i];
      if (prev.action === 'move' && prev.elementId === elementId) {
        if (!inheritedOrigin && prev.origin) inheritedOrigin = prev.origin;
        domChanges.splice(i, 1);
      }
    }
    // No-op move: the element ended up exactly where it started. Drop
    // the record entirely — the user effectively undid their drag.
    if (destination && inheritedOrigin) {
      const sameSpot =
        destination.parentId && inheritedOrigin.parentId
          ? destination.parentId === inheritedOrigin.parentId && destination.index === inheritedOrigin.index
          : destination.parentSelector === inheritedOrigin.parentSelector && destination.index === inheritedOrigin.index;
      if (sameSpot) {
        persistSession();
        return null;
      }
    }
  }
  // Smart cleanup: if `delete` cancels an earlier `duplicate` or `insert`
  // for the same element, the element never existed in the original
  // page. The whole chain (creation + every style/text edit on it +
  // this delete) becomes meaningless — drop them all so the Changes
  // tab reflects net intent, not bookkeeping.
  if (action === 'delete') {
    const createIdx = domChanges.findIndex(d =>
      d.elementId === elementId && (d.action === 'duplicate' || d.action === 'insert')
    );
    if (createIdx !== -1) {
      domChanges.splice(createIdx, 1);
      // Drop every style change recorded against this element + remove
      // its rules from the override stylesheet.
      for (let i = styleChanges.length - 1; i >= 0; i--) {
        if (styleChanges[i].elementId === elementId) {
          removeRule(elementId, styleChanges[i].property);
          styleChanges.splice(i, 1);
        }
      }
      // Drop every text change recorded against this element.
      for (let i = textChanges.length - 1; i >= 0; i--) {
        if (textChanges[i].elementId === elementId) {
          textChanges.splice(i, 1);
        }
      }
      // Drop intermediate moves recorded against this element too.
      for (let i = domChanges.length - 1; i >= 0; i--) {
        if (domChanges[i].elementId === elementId) {
          domChanges.splice(i, 1);
        }
      }
      persistSession();
      return null;
    }
  }
  const change: DomChange = {
    id: crypto.randomUUID(), elementId, selector, action,
    tagName, outerHTML, destination,
    origin: inheritedOrigin,
    timestamp: Date.now(),
  };
  domChanges.push(change);
  syncDomChange(change);
  persistSession();
  return change;
}

export function generateCSSBlock(): string {
  const bySelector = new Map<string, Map<string, string>>();
  for (const c of styleChanges) {
    if (!bySelector.has(c.selector)) bySelector.set(c.selector, new Map());
    const kebab = c.property.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    bySelector.get(c.selector)!.set(kebab, c.newValue);
  }
  const rules: string[] = [];
  for (const [sel, props] of bySelector) {
    const decls = Array.from(props).map(([k,v]) => `  ${k}: ${v};`).join('\n');
    rules.push(`${sel} {\n${decls}\n}`);
  }
  // Add DOM changes as comments
  for (const d of domChanges) {
    rules.push(`/* DOM: ${d.action} ${d.tagName} (${d.selector}) */`);
  }
  return rules.join('\n\n');
}

export function getChangeReport() {
  return {
    pageUrl: window.location.href,
    pageTitle: document.title,
    styleChanges: styleChanges.map(c => ({
      selector: c.selector, property: c.property,
      oldValue: c.oldValue, newValue: c.newValue,
      cssRule: `${c.selector} { ${c.property.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}: ${c.newValue}; }`,
    })),
    textChanges: textChanges.map(c => ({
      selector: c.selector, oldText: c.oldText, newText: c.newText,
    })),
    domChanges: domChanges.map(c => ({
      selector: c.selector, action: c.action, tagName: c.tagName,
    })),
    cssBlock: generateCSSBlock(),
  };
}

// --- Transport sync ---
//
// The extension talks to either the local companion server (ws://) or the
// hosted relay on mcp.designmode.app (SSE for cloud→extension push, HTTP
// POST for extension→cloud). Wire format is identical in both directions
// — `{ type, requestId?, responseTo?, payload }` — so handlers don't care
// which transport delivered the message.

type TransportMode = 'local' | 'cloud' | 'self-hosted';

let transportMode: TransportMode = 'local';
let cloudToken: string | null = null;
let cloudBaseUrl: string | null = null;
let sseAbort: AbortController | null = null;
let unhandledMessageHandler: ((msg: any) => void) | null = null;
let agentConnected = false;

export function isAgentConnected() { return agentConnected; }

function setAgentConnected(next: boolean) {
  if (agentConnected === next) return;
  agentConnected = next;
  try {
    chrome.runtime.sendMessage({ type: 'AGENT_PRESENCE_UPDATE', connected: next });
  } catch { /* SW gone — next status poll will reconcile */ }
}

// Lets content/index.ts plug in the cloud-tools dispatcher (CLOUD_GET_CHANGES
// etc.) without change-tracker needing to know about comments, sessions,
// or render formats. APPLY_CHANGES and CAPTURE_SCREENSHOT stay handled
// directly here because they touch the same managed-stylesheet path the
// rest of this file owns.
export function setUnhandledMessageHandler(fn: (msg: any) => void) {
  unhandledMessageHandler = fn;
}

function dispatchIncoming(msg: any) {
  try {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'AGENT_PRESENCE') {
      setAgentConnected(!!msg.payload?.connected);
      return;
    }
    if (msg.type === 'HELLO') {
      if (msg.payload?.agentConnected) setAgentConnected(true);
      return;
    }
    if (msg.type === 'APPLY_CHANGES' && msg.payload) {
      // Cloud may send `{ changes: [...] }` (ack-expected) or a single
      // `{ elementId, styles }` (legacy). Handle both shapes.
      const items: Array<{ elementId: string; styles: Record<string, string> }> =
        Array.isArray(msg.payload.changes) ? msg.payload.changes : [msg.payload];
      let totalProps = 0, totalEls = 0;
      for (const ch of items) {
        if (!ch || !ch.elementId || !ch.styles) continue;
        for (const [prop, val] of Object.entries(ch.styles)) {
          applyStyleChange(ch.elementId, prop, val as string);
          totalProps++;
        }
        totalEls++;
      }
      if (msg.requestId) sendRelayResponse(msg.requestId, { ok: true, totalProps, totalEls });
      return;
    }
    if (msg.type === 'CAPTURE_SCREENSHOT' && msg.requestId) {
      handleScreenshotRequest(msg.requestId, msg.payload || {});
      return;
    }
    // Anything else — let content/index.ts handle it (cloud tools, comments).
    unhandledMessageHandler?.(msg);
  } catch {}
}

export interface ConnectOpts {
  mode?: TransportMode;
  port?: number;
  cloudUrl?: string;
  cloudToken?: string;
}

export function connectToServer(opts: ConnectOpts | number = {}) {
  // Back-compat: callers passing a port number still work.
  const o: ConnectOpts = typeof opts === 'number' ? { port: opts } : opts;
  disconnectFromServer();
  transportMode = o.mode || 'local';

  if (transportMode === 'local') {
    const port = o.port ?? DEFAULT_WS_PORT;
    try {
      ws = new WebSocket(`ws://localhost:${port}`);
      ws.onopen = () => console.log('[Design Mode] Connected to companion server');
      ws.onclose = () => { ws = null; setAgentConnected(false); };
      ws.onerror = () => { ws = null; setAgentConnected(false); };
      ws.onmessage = (event) => {
        try { dispatchIncoming(JSON.parse(event.data)); } catch {}
      };
    } catch { ws = null; }
    return;
  }

  // Cloud / self-hosted — open the SSE stream and run a forever loop that
  // reconnects with backoff on disconnect.
  cloudToken = o.cloudToken || null;
  cloudBaseUrl = (o.cloudUrl || '').replace(/\/$/, '') || null;
  if (!cloudToken || !cloudBaseUrl) return;
  void runCloudStream();
}

async function runCloudStream() {
  let backoff = 1000;
  sseAbort = new AbortController();
  while (sseAbort && !sseAbort.signal.aborted && cloudToken && cloudBaseUrl) {
    // The extension may have been reloaded / disabled while the SSE was
    // open. The `chrome.runtime.id` check is the cheapest way to notice
    // an orphan content script — we'd otherwise loop forever calling
    // fetch and logging warnings.
    if (typeof chrome !== 'undefined' && !chrome.runtime?.id) {
      sseAbort?.abort();
      return;
    }
    try {
      const resp = await fetch(`${cloudBaseUrl}/api/extension/stream`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${cloudToken}`, 'Accept': 'text/event-stream' },
        signal: sseAbort.signal,
      });
      if (!resp.ok || !resp.body) {
        if (resp.status === 401) { console.warn('[Design Mode] cloud stream auth failed'); return; }
        throw new Error(`stream status ${resp.status}`);
      }
      console.log('[Design Mode] cloud stream open');
      backoff = 1000;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          parseSseFrame(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
        }
      }
    } catch (err) {
      if (sseAbort?.signal.aborted) return;
      // Quieted from warn → debug. Reconnect storms during a redeploy or
      // a brief network blip aren't worth crowding the console for.
      console.debug('[Design Mode] cloud stream lost, retrying:', err);
    }
    await new Promise(r => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 15000);
  }
}

function parseSseFrame(frame: string) {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue; // comment / heartbeat
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (event === 'relay' && data) {
    try { dispatchIncoming(JSON.parse(data)); } catch {}
  }
}

// Send a message to whichever transport is active. WS in local mode, POST
// `/extension/inbox` in cloud / self-hosted mode. Fire-and-forget.
function transportSend(msg: object) {
  if (transportMode === 'local') {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    return;
  }
  if (!cloudToken || !cloudBaseUrl) return;
  void fetch(`${cloudBaseUrl}/api/extension/inbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cloudToken}` },
    body: JSON.stringify(msg),
    keepalive: true,
  }).catch(() => {});
}

// Reply to a request received via the relay. Used by handleScreenshotRequest
// and by cloud tool dispatchers in content/index.ts (re-exported).
export function sendRelayResponse(responseTo: string, payload: any) {
  transportSend({ type: 'RELAY_RESPONSE', responseTo, payload });
}

export function isConnected() {
  if (transportMode === 'local') return ws?.readyState === WebSocket.OPEN;
  // Cloud: best-effort signal. We consider ourselves connected if we have
  // a token + a non-aborted stream worker. Real liveness requires a ping
  // round-trip — out of scope for v1.
  return !!cloudToken && !!sseAbort && !sseAbort.signal.aborted;
}

// Handle a screenshot request from the MCP server. Resolves to a base64 PNG
// data URL captured from the visible viewport, optionally cropped to an
// element matched by selector or by elementId. Failure paths return
// { error } so the server can surface a clean error to the agent. When the
// selector matches more than one element, return a helpful list of unique
// candidate paths so the agent can re-query with a specific one.
async function handleScreenshotRequest(
  requestId: string,
  payload: { selector?: string; elementId?: string }
) {
  let dataUrl: string | null = null;
  let error: string | undefined;
  let candidates: Array<{ path: string; label: string }> | undefined;
  try {
    if (payload.elementId) {
      dataUrl = await captureElementScreenshot(payload.elementId);
      if (!dataUrl) error = `Element with id "${payload.elementId}" not found`;
    } else if (payload.selector) {
      let matches: HTMLElement[] = [];
      try {
        matches = Array.from(document.querySelectorAll(payload.selector)) as HTMLElement[];
      } catch (e: any) {
        error = `Invalid selector "${payload.selector}": ${e?.message || e}`;
      }
      if (!error) {
        if (matches.length === 0) {
          error = `No element matched selector "${payload.selector}"`;
        } else if (matches.length > 1) {
          // Ambiguous — return up to 8 unique candidate paths so the agent
          // can re-query with a specific one.
          error = `Selector "${payload.selector}" matched ${matches.length} elements. Pass a more specific path (use list_layers to discover unique paths).`;
          candidates = matches.slice(0, 8).map(el => ({
            path: generateSelector(el),
            label: shortLabel(el),
          }));
        } else {
          const el = matches[0];
          const id = el.getAttribute('data-dm-id') || `ad-hoc-${Date.now()}`;
          if (!el.getAttribute('data-dm-id')) el.setAttribute('data-dm-id', id);
          dataUrl = await captureElementScreenshot(id);
          if (!dataUrl) error = 'Failed to crop element';
        }
      }
    } else {
      dataUrl = await captureViewportScreenshot();
      if (!dataUrl) error = 'Failed to capture viewport';
    }
  } catch (e: any) {
    error = e?.message || 'Capture failed';
  }
  const responsePayload: any = dataUrl ? { dataUrl } : { error: error || 'Capture failed' };
  if (candidates) responsePayload.candidates = candidates;
  transportSend({ type: 'SCREENSHOT_RESULT', responseTo: requestId, payload: responsePayload });
}

function shortLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = (typeof el.className === 'string' && el.className.trim())
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
    : '';
  const text = (el.textContent || '').trim().slice(0, 40);
  const textSuffix = text ? ` "${text}${(el.textContent || '').length > 40 ? '…' : ''}"` : '';
  return `${tag}${id}${cls}${textSuffix}`;
}


function syncChange(change: StyleChange) {
  transportSend({ type: 'STYLE_CHANGED', payload: change });
}

function syncTextChange(change: TextChange) {
  transportSend({ type: 'TEXT_CHANGED', payload: change });
}

function syncDomChange(change: DomChange) {
  transportSend({ type: 'DOM_CHANGED', payload: change });
}

export function syncAllChanges() {
  transportSend({ type: 'SESSION_UPDATE', payload: getChangeReport() });
}

export function disconnectFromServer() {
  if (ws) { try { ws.close(); } catch {} ws = null; }
  if (sseAbort) { try { sseAbort.abort(); } catch {} sseAbort = null; }
  setAgentConnected(false);
}
