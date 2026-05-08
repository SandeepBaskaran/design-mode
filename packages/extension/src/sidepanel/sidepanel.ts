// ============================================================
// Design Mode — Side Panel v0.8.0
// Figma-quality layers panel + property inspector
// Phase 1: morphdom + event delegation
// Phase 2: Tree layers with collapse/expand, icons, search
// Phase 3: Hover-edit, persistent sections, CSS variables
// Phase 4: Grouped changes, keyboard nav, transitions
// ============================================================

import morphdom from 'morphdom';
import { icon, icons } from '../content/icons';
import { escapeAttr, rgbToHex } from '../content/helpers';
import {
  ANIMATION_NAME_OPTIONS,
  ANIMATION_DIRECTION_OPTIONS,
  ANIMATION_FILL_OPTIONS,
  ANIMATION_PLAY_STATE_OPTIONS,
  TIMING_FUNCTION_OPTIONS,
  TRANSITION_PROPERTY_OPTIONS,
} from '@shared/constants';

/* ── Types ── */
interface ElementInfo {
  id: string; tagName: string; className: string;
  computedStyles: Record<string, string>;
  boundingRect: { x: number; y: number; width: number; height: number };
  breadcrumbs: string[]; element?: any; imgSrc?: string;
  textContent?: string; hasChildElements?: boolean;
  sourceLocation?: {
    file: string; line?: number; column?: number;
    component?: string; framework: string; cleanPath?: string;
  };
  componentHierarchy?: string[];
  // Parent context — used by Position section to dispatch alignment buttons
  // (flex parent → align/justify-self; grid parent → same; block parent →
  // margin auto). Captured by inspector.buildElementInfo and present on
  // both ELEMENT_SELECTED and ELEMENT_HOVERED_INFO payloads.
  parentDisplay?: string;
  parentFlexDirection?: string;
  parentJustifyContent?: string;
  parentAlignItems?: string;
  parentGap?: string;
}
interface StyleChange { id?: string; elementId: string; selector: string; property: string; oldValue: string; newValue: string; timestamp?: number; }
interface TextChange { id: string; elementId: string; selector: string; oldText: string; newText: string; timestamp?: number; }
interface DomChange { id?: string; action: string; tagName: string; selector: string; elementId?: string; timestamp?: number; }
interface CommentEntry { id: string; elementId: string; text: string; selector: string; timestamp: number; updatedAt?: number; resolved?: boolean; pinOffset?: { x: number; y: number } }
interface DomNode {
  id: string; tagName: string; displayName: string;
  depth: number; childCount: number; isVisible: boolean; hasText: boolean;
  parentId: string | null;
  zIndex?: string;
  backgroundColor?: string;
  componentName?: string;
  containerKind?: 'shadow' | 'iframe' | 'pseudo';
}

/* ── State ── */
type Tab = 'layers' | 'design' | 'changes';
type McpState = 'offline' | 'running' | 'connected';
type Theme = 'dark' | 'light' | 'system';
type ColorFormat = 'hex' | 'rgba' | 'hsl';
let tab: Tab = 'design';
let settingsOpen = false;
let enabled = false;
let inspecting = true;
let mcpState: McpState = 'offline';
let pinnedDomain = '';
let info: ElementInfo | null = null;
let hoverInfo: ElementInfo | null = null;
let styleChanges: StyleChange[] = [];
let textChanges: TextChange[] = [];
let domChanges: DomChange[] = [];
let comments: CommentEntry[] = [];
let batchAppliedChanges: Set<string> = new Set();
let mediaInfo: { kind: string; src: string; alt?: string; naturalWidth?: number; naturalHeight?: number; filename?: string; markup?: string; isObjectUrl?: boolean; poster?: string } | null = null;
let lastMediaElementId: string | null = null;
let activeColorPickerProp: string | null = null;
// Tokens-only dropdown (a focus-driven shortcut on hex inputs) — distinct
// from the full HSV+tokens panel that opens on swatch click.
let tokensDropdownProp: string | null = null;
let colorPickerSearch = '';
let domTree: DomNode[] = [];
let hoveredLayerId: string | null = null;
let undoCount = 0;
let redoCount = 0;
let theme: Theme = 'system';
let resolvedTheme: 'dark' | 'light' = 'dark';
let colorFormat: ColorFormat = 'hex';
type CaptureMode = 'clipboard' | 'download' | 'both';
let captureMode: CaptureMode = 'clipboard';
let multiSelectActive = false;
let multiSelectIds: string[] = [];
let animationsFrozen = false;
let captureToast: { kind: 'success' | 'error'; text: string } | null = null;
let captureToastTimer: ReturnType<typeof setTimeout> | null = null;
let commentMode = false;
let commentText = '';
let editingCommentId: string | null = null;
let viewingCommentId: string | null = null;
// Inline-confirm overlay for deleting a comment (mirrors Clear All).
let deletingCommentId: string | null = null;
let commentDirty = false;

// Phase 2: Tree state
const collapsedNodes = new Set<string>();
let layerSearch = '';

// Phase 3: Persistent section collapse state
const sectionStates: Record<string, boolean | undefined> = {};

// Layers tab UI state — lock, rename, visibility filter, inline edit.
const lockedLayerIds = new Set<string>();
const layerNameOverrides = new Map<string, string>();
type LayersFilter = 'all' | 'visible' | 'hidden' | 'modified';
let layersFilter: LayersFilter = 'all';
let renamingLayerId: string | null = null;

// Phase 4: Changes tab UI state.
const changesGroupCollapsed = new Set<string>();
// Filter narrows the visible items to one change kind.
type ChangesFilter = 'all' | 'style' | 'text' | 'dom' | 'comment';
let changesFilter: ChangesFilter = 'all';
// Free-text search across selector / property / value / comment text.
let changesSearch = '';
// Sort order for the change list. Default oldest-first matches the
// historical behaviour; the other two are user-pickable from the action row.
type ChangesSort = 'oldest' | 'newest' | 'element';
let changesSort: ChangesSort = 'oldest';
// Per-row checkbox selection for bulk-revert. Keys are the same change-ids
// the per-row trash button uses (`style-N`, text-id, `dom-N`, comment-id).
const changesSelected = new Set<string>();
// Sub-filter for comments (Open / Resolved / All). Only narrows comment
// items; other change kinds always pass.
type CommentsResolvedFilter = 'all' | 'open' | 'resolved';
let commentsResolvedFilter: CommentsResolvedFilter = 'all';
// Inline confirmation overlay state for the destructive Clear All button.
let clearAllConfirming = false;
// Anchored popover for the sort icon. Three options live inside it; clicking
// one writes to changesSort and closes the popover.
let changesSortMenuOpen = false;

// Phase 5: Design tokens
interface DesignToken { name: string; value: string; category: 'color' | 'spacing' | 'font' | 'shadow' | 'other'; }
let designTokens: DesignToken[] = [];
let pageFonts: Array<{ value: string; label: string }> = [];

// Drag state (for layer reorder)
let dragLayerId: string | null = null;

// v1.2: Presets
type PresetKind = 'position' | 'layout' | 'appearance' | 'typography' | 'fill' | 'stroke' | 'effects';
const PRESET_KIND_LABELS: Record<PresetKind, string> = {
  position: 'Position',
  layout: 'Layout',
  appearance: 'Appearance',
  typography: 'Typography',
  fill: 'Fill',
  stroke: 'Stroke',
  effects: 'Effects',
};
const PRESET_KIND_ORDER: PresetKind[] = ['position', 'layout', 'appearance', 'typography', 'fill', 'stroke', 'effects'];
let presetsOpen = false;
let customPresetsList: any[] = [];
let editingPresetData: { id: string; name: string; kind?: PresetKind; styles: Record<string, string> } | null = null;
let deletingPresetId: string | null = null;
let savePresetKind: PresetKind = 'typography';
let presetFilter: 'all' | PresetKind = 'all';

// v1.2: Computed CSS
let computedCssOpen = false;
let computedCssText = '';

// v1.2: Before/After
let previewingOriginal = false;

// v1.2: Transition/Animation visualizer
let vizProp: string | null = null;
let vizMode: 'ease' | 'spring' = 'ease';
let bezX1 = 0.42, bezY1 = 0, bezX2 = 0.58, bezY2 = 1;
let sprStiffness = 100, sprDamping = 10, sprMass = 1;

// Per-property linked toggles. Each defaults to *linked* (Figma's default
// behaviour) so editing the primary value writes to all four sides.
let borderWidthLinked = true;
let borderStyleLinked = true;
let borderColorLinked = true;
let paddingLinked = true;
let marginLinked = true;

// Stroke style intent — tracks user's chosen style (solid / dashed) per
// selected element. Needed because Inside mode (box-shadow inset) can't
// render dashed visually, but the user's design intent still controls
// which panel (dashed config) is shown in the side panel.
const strokeStyleByElement = new Map<string, 'solid' | 'dashed'>();

// Figma-style Design tab state
let cornerRadiusLinked = true;
let cornerRadiusExpanded = false;
const advancedOpen: Record<string, boolean> = {};   // keyed by section key
let sidesPopoverOpen = false;
let strokeStylePopoverOpen = false;
let effectsMenuOpen = false;
let fillAddOpen = false;
let strokeAddOpen = false;
let expandedFillIdx: number | null = null;
let expandedStrokeIdx: number | null = null;
let expandedEffectIdx: number | null = null;
// Per-element stash so swapping stroke position (Inside/Outside/Center)
// doesn't lose unrelated box-shadow / outline values authored elsewhere.
const previousStroke = new Map<string, { boxShadow?: string; outline?: string; outlineOffset?: string }>();
// Per-element stash for the Fill eye toggle so re-enabling restores the
// authored backgroundColor instead of leaving it transparent.
const previousFill = new Map<string, string>();

// v1.2: Spacing expand state

const root = document.getElementById('dm-root')!;

/* ── Theme ── */
function resolveTheme() {
  if (theme === 'system') resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  else resolvedTheme = theme;
  document.documentElement.dataset.theme = resolvedTheme;
}
resolveTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme === 'system') { resolveTheme(); render(); } });
// Persisted settings — restored from chrome.storage.local on boot.
let mcpPort = 9960;
let mcpAutoConnect = true;
// Cloud / self-hosted MCP. Mode picks where the extension dials; the
// other three are only meaningful when mode !== 'local'.
type McpMode = 'local' | 'cloud' | 'self-hosted';
let mcpMode: McpMode = 'local';
let mcpCloudToken = '';
let mcpCloudUrl = 'https://www.mcp.designmode.app';
let mcpCloudTenantId = '';
let mcpCloudRegistering = false;
let inspectorHoverColor = '#4F9EFF';
let inspectorSelectColor = '#FF6B35';

chrome.storage?.local?.get?.([
  'dm-theme', 'dm-color-format', 'dm-capture-mode',
  'dm-mcp-port', 'dm-mcp-auto-connect',
  'dm-mcp-mode', 'dm-mcp-cloud-token', 'dm-mcp-cloud-url', 'dm-mcp-cloud-tenant',
  'dm-inspector-hover-color', 'dm-inspector-select-color',
], (result: any) => {
  if (result?.['dm-theme']) { theme = result['dm-theme']; resolveTheme(); }
  if (result?.['dm-color-format']) { colorFormat = result['dm-color-format']; }
  if (result?.['dm-capture-mode']) { captureMode = result['dm-capture-mode']; }
  if (typeof result?.['dm-mcp-port'] === 'number') mcpPort = result['dm-mcp-port'];
  if (typeof result?.['dm-mcp-auto-connect'] === 'boolean') mcpAutoConnect = result['dm-mcp-auto-connect'];
  if (typeof result?.['dm-mcp-mode'] === 'string') mcpMode = result['dm-mcp-mode'];
  if (typeof result?.['dm-mcp-cloud-token'] === 'string') mcpCloudToken = result['dm-mcp-cloud-token'];
  if (typeof result?.['dm-mcp-cloud-url'] === 'string') mcpCloudUrl = result['dm-mcp-cloud-url'];
  if (typeof result?.['dm-mcp-cloud-tenant'] === 'string') mcpCloudTenantId = result['dm-mcp-cloud-tenant'];
  if (typeof result?.['dm-inspector-hover-color'] === 'string') inspectorHoverColor = result['dm-inspector-hover-color'];
  if (typeof result?.['dm-inspector-select-color'] === 'string') inspectorSelectColor = result['dm-inspector-select-color'];
  render();
});
// Layers tab — restore lock state + custom names from session storage so
// they survive panel reloads within the browser session. Element ids are
// stable per page (assigned via `data-dm-*`) so the keys round-trip
// faithfully even across SPA re-renders.
chrome.storage?.session?.get?.(['dm-layer-locks', 'dm-layer-names', 'dm-section-states'], (result: any) => {
  if (Array.isArray(result?.['dm-layer-locks'])) {
    for (const id of result['dm-layer-locks']) lockedLayerIds.add(String(id));
  }
  if (result?.['dm-layer-names'] && typeof result['dm-layer-names'] === 'object') {
    for (const [id, name] of Object.entries(result['dm-layer-names'])) {
      if (typeof name === 'string') layerNameOverrides.set(id, name);
    }
  }
  // Section expand/collapse — restore the user's per-section preference so
  // the panel opens at the same shape they last left it.
  if (result?.['dm-section-states'] && typeof result['dm-section-states'] === 'object') {
    Object.assign(sectionStates, result['dm-section-states']);
  }
  render();
});

let _saveLayerStateTimer: number | null = null;
function saveLayerState() {
  // Coalesce rapid edits — typing in the rename input fires once per
  // commit, but bulk lock/unlock writes 1 entry per layer. 200ms debounce
  // keeps the storage write count sane.
  if (_saveLayerStateTimer != null) clearTimeout(_saveLayerStateTimer);
  _saveLayerStateTimer = (setTimeout(() => {
    _saveLayerStateTimer = null;
    chrome.storage?.session?.set?.({
      'dm-layer-locks': Array.from(lockedLayerIds),
      'dm-layer-names': Object.fromEntries(layerNameOverrides),
    });
  }, 200) as unknown) as number;
}

function parseNumeric(val: string): { num: number; unit: string } | null {
  const m = val.match(/^(-?[\d.]+)\s*(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|deg|s|ms)?$/);
  if (m) return { num: parseFloat(m[1]), unit: m[2] || '' };
  return null;
}

function send(msg: any): Promise<any> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || {})));
}

/* ── Chrome Port ── */
const port = chrome.runtime.connect({ name: 'sidepanel' });
port.onMessage.addListener((msg) => {
  if (msg.type === 'INIT_STATE') {
    enabled = msg.enabled ?? false; inspecting = msg.inspecting ?? true;
    mcpState = msg.connected ? 'connected' : msg.serverRunning ? 'running' : 'offline';
    if (msg.pinnedUrl) { try { pinnedDomain = new URL(msg.pinnedUrl).hostname; } catch { pinnedDomain = msg.pinnedUrl; } }
    render(); refreshMcpStatus(); refreshDomTree(); refreshChanges(); refreshDesignTokens(); refreshPageFonts();
  }
});

// Immediately deactivate inspect mode when the side panel is closing.
// We only listen to *unload* events — visibilitychange would fire when the
// user switches tabs in the same window even though the panel itself is
// still attached, and that prematurely killed the inspector.
// `pagehide` covers panel close + browser-quit; `beforeunload` is a backup.
// The background's port.onDisconnect handler is the third belt in case
// either of these gets dropped while the service worker is spinning down.
function signalPanelClosing() {
  try { chrome.runtime.sendMessage({ type: 'SP_PANEL_CLOSING' }); } catch {}
}
window.addEventListener('pagehide', signalPanelClosing);
window.addEventListener('beforeunload', signalPanelClosing);

/* ── Async actions ── */
async function refreshMcpStatus() { const res = await send({ type: 'SP_GET_MCP_STATUS' }); if (res.mcpState) mcpState = res.mcpState; else if (res.connected && res.agentConnected) mcpState = 'connected'; else if (res.connected) mcpState = 'running'; else mcpState = 'offline'; render(); }
async function refreshState() { const res = await send({ type: 'SP_GET_STATE' }); enabled = res.enabled ?? enabled; inspecting = res.inspecting ?? inspecting; undoCount = res.undoCount ?? undoCount; redoCount = res.redoCount ?? redoCount; render(); }
async function refreshChanges() { const res = await send({ type: 'SP_GET_CHANGES' }); styleChanges = res.styleChanges || []; textChanges = res.textChanges || []; domChanges = res.domChanges || []; comments = res.comments || []; render(); }
async function refreshDomTree() { const res = await send({ type: 'SP_GET_DOM_TREE' }); domTree = res.tree || []; render(); }
// Scroll the currently-selected layer row into view (Layers tab). Tolerates
// the row not existing yet — caller may invoke it after a re-render where
// morphdom hasn't placed the element by the next microtask.
function scrollSelectedLayerIntoView() {
  const id = info?.id;
  if (!id) return;
  const tryScroll = (attempts: number) => {
    const layerEl = root.querySelector('[data-dm-layer="' + id + '"]');
    if (layerEl) { layerEl.scrollIntoView({ block: 'nearest' }); return; }
    if (attempts > 0) requestAnimationFrame(() => tryScroll(attempts - 1));
  };
  // Three rAFs is plenty for morphdom + the auto-expand of collapsed ancestors.
  requestAnimationFrame(() => tryScroll(3));
}
async function refreshDesignTokens() { const res = await send({ type: 'SP_GET_DESIGN_TOKENS' }); designTokens = res.tokens || []; }
async function refreshPageFonts() { const res = await send({ type: 'SP_GET_PAGE_FONTS' }); pageFonts = res.fonts || []; render(); }
async function refreshMedia() {
  if (!info) { mediaInfo = null; lastMediaElementId = null; return; }
  if (info.id === lastMediaElementId) return;
  lastMediaElementId = info.id;
  const res = await send({ type: 'SP_GET_MEDIA' });
  mediaInfo = res?.media || null;
  render();
}
async function refreshPresets() {
  // Built-in tab is gone — only user-saved presets live in the panel now.
  // Site-colour CSS tokens are surfaced inline on every colour input via
  // the focus-driven dropdown (see colorInp / renderTokensDropdown).
  const res = await send({ type: 'SP_GET_PRESETS', category: 'custom' });
  customPresetsList = res.presets || [];
  render();
}

// Recompose translate / scale from their X/Y inputs and apply.
function applyTransformComponentFromFields(group: 'translate' | 'scale') {
  const xEl = root.querySelector<HTMLInputElement>('[data-dm-tcomp-group="' + group + '"][data-dm-tcomp-axis="x"]');
  const yEl = root.querySelector<HTMLInputElement>('[data-dm-tcomp-group="' + group + '"][data-dm-tcomp-axis="y"]');
  const xRaw = (xEl?.value ?? '').trim();
  const yRaw = (yEl?.value ?? '').trim();
  if (group === 'translate') {
    const x = xRaw === '' ? '0' : xRaw;
    const y = yRaw === '' ? '0' : yRaw;
    // Append px when input is a bare number; users can also paste 'em'/'%' and we honor it.
    const fmt = (v: string) => /^-?\d+(?:\.\d+)?$/.test(v) ? v + 'px' : v;
    applyStyle('translate', `${fmt(x)} ${fmt(y)}`);
  } else {
    const x = xRaw === '' ? '1' : xRaw;
    const y = yRaw === '' ? '1' : yRaw;
    // CSS scale accepts unitless numbers — strip any accidental units.
    const num = (v: string) => v.replace(/[^0-9.\-]/g, '') || (group === 'scale' ? '1' : '0');
    applyStyle('scale', `${num(x)} ${num(y)}`);
  }
}

// Mirror a value to the slider+number duo for the same filter function so
// dragging the slider keeps the number in sync (and vice-versa) without
// waiting for a re-render. Called from input/keydown handlers.
function syncFilterSiblings(src: HTMLInputElement) {
  const group = src.dataset.dmFcompGroup;
  const field = src.dataset.dmFcompField;
  if (!group || !field) return;
  const siblings = root.querySelectorAll<HTMLInputElement>(
    '[data-dm-fcomp-group="' + group + '"][data-dm-fcomp-field="' + field + '"]'
  );
  siblings.forEach(sib => { if (sib !== src) sib.value = src.value; });
}

// Recompose filter / backdrop-filter from per-function fields and apply.
// Dedupes by function name (slider + number share a name) — first input
// in DOM order wins, which is the slider since we render it first. The
// sync helper above ensures slider/number agree before this runs.
function applyFilterComponentsFromFields(group: 'filter' | 'bfilter') {
  const inputs = root.querySelectorAll<HTMLInputElement>('[data-dm-fcomp-group="' + group + '"]');
  const seen = new Set<string>();
  const parts: string[] = [];
  inputs.forEach(inp => {
    const fn = inp.dataset.dmFcompField!;
    if (seen.has(fn)) return; // dedupe slider+number into one declaration
    seen.add(fn);
    const unit = inp.dataset.dmUnit || '';
    const raw = (inp.value ?? '').trim();
    if (!raw) return;
    const isDefault =
      (fn === 'blur' && raw === '0') ||
      (fn === 'hue-rotate' && raw === '0') ||
      (fn === 'grayscale' && raw === '0') ||
      ((fn === 'brightness' || fn === 'contrast' || fn === 'saturate') && raw === '1');
    if (isDefault) return;
    const isNum = /^-?\d+(?:\.\d+)?$/.test(raw);
    const arg = isNum && unit ? raw + unit : raw;
    parts.push(`${fn}(${arg})`);
  });
  const value = parts.length === 0 ? 'none' : parts.join(' ');
  applyStyle(group === 'filter' ? 'filter' : 'backdropFilter', value);
}

// Color-picker pointer drag handlers + input wiring. Single shared
// `pointermove`/`pointerup` listener kept on `window` while the user is
// dragging — we set a `currentDrag` ref on pointerdown and clear it on
// pointerup so we never accumulate listeners.
type ColorDrag = { kind: 'sv' | 'hue'; prop: string; el: HTMLElement } | null;
let colorDrag: ColorDrag = null;

function getDragHueFromAttr(prop: string): number {
  // The current hue is stashed on the SV gradient as `data-dm-color-h`
  // (set during render). For drags that happen on the SV plane, we use
  // that hue; for hue-slider drags, the new hue is computed from x.
  const sv = root.querySelector<HTMLElement>('[data-dm-color-sv="' + prop + '"]');
  return sv ? parseFloat(sv.dataset.dmColorH || '0') : 0;
}

function applyColorFromHsv(prop: string, h: number, sv: number, v: number) {
  const [r, g, b] = hsvToRgb(h, sv, v);
  let value: string;
  if (colorFormat === 'hsl') {
    // Convert HSV → HSL.
    const lL = (2 - sv) * v / 2;
    const sL = lL && lL < 1 ? sv * v / (lL < 0.5 ? lL * 2 : 2 - lL * 2) : 0;
    value = `hsl(${Math.round(h)}, ${Math.round(sL * 100)}%, ${Math.round(lL * 100)}%)`;
  } else if (colorFormat === 'rgba') {
    value = `rgb(${r}, ${g}, ${b})`;
  } else {
    value = rgbToHexStr(r, g, b);
  }
  applyStyle(prop, value);
}

function handleColorPointer(e: PointerEvent) {
  if (!colorDrag) return;
  const rect = colorDrag.el.getBoundingClientRect();
  if (colorDrag.kind === 'sv') {
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const h = getDragHueFromAttr(colorDrag.prop);
    applyColorFromHsv(colorDrag.prop, h, x, 1 - y);
  } else {
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const h = x * 360;
    // Preserve the current S/V by rebuilding from the current swatch RGB.
    const swatch = root.querySelector<HTMLButtonElement>('[data-dm-color-trigger="' + colorDrag.prop + '"]');
    let s = 1, v = 1;
    if (swatch) {
      const cs = window.getComputedStyle(swatch).backgroundColor;
      const rgb = parseColorRgb(cs);
      if (rgb) { const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]); s = hsv[1]; v = hsv[2]; }
    }
    applyColorFromHsv(colorDrag.prop, h, s, v);
  }
}

window.addEventListener('pointermove', handleColorPointer);
window.addEventListener('pointerup', () => { colorDrag = null; });
window.addEventListener('pointercancel', () => { colorDrag = null; });

// Pointerdown delegation for the inline color picker — the SV (saturation
// × value) gradient and the hue strip both rely on `colorDrag` being set.
// Without this listener, pointermove silently bails and the dot / slider
// never move.
window.addEventListener('pointerdown', (e) => {
  const target = e.target as HTMLElement;
  if (!target) return;
  const sv = target.closest<HTMLElement>('[data-dm-color-sv]');
  if (sv) {
    const prop = sv.dataset.dmColorSv!;
    colorDrag = { kind: 'sv', prop, el: sv };
    handleColorPointer(e);
    return;
  }
  const hue = target.closest<HTMLElement>('[data-dm-color-hue]');
  if (hue) {
    const prop = hue.dataset.dmColorHue!;
    colorDrag = { kind: 'hue', prop, el: hue };
    handleColorPointer(e);
    return;
  }
});

function applyTextShadowFromFields() {
  const get = (field: string, fallback: string) => {
    const el = root.querySelector<HTMLInputElement>('[data-dm-textshadow-field="' + field + '"]');
    return el ? el.value : fallback;
  };
  const x = parseFloat(get('x', '0')) || 0;
  const y = parseFloat(get('y', '1')) || 0;
  const blur = parseFloat(get('blur', '2')) || 0;
  const colorEl = root.querySelector<HTMLInputElement>('[data-dm-textshadow-field="color"]');
  const hexEl = root.querySelector<HTMLInputElement>('[data-dm-textshadow-field="colorhex"]');
  // Prefer the hex text field if user typed there; otherwise the color picker.
  let color = '#000000';
  if (hexEl?.value) {
    const v = hexEl.value.trim();
    color = v.startsWith('#') ? v : '#' + v;
  } else if (colorEl?.value) {
    color = colorEl.value;
  }
  const css = `${x}px ${y}px ${blur}px ${color}`;
  applyStyle('textShadow', css);
}

function applyShadowFromFields() {
  const get = (field: string, fallback: string) => {
    const el = root.querySelector<HTMLInputElement>('[data-dm-shadow-field="' + field + '"]');
    return el ? el.value : fallback;
  };
  const type = get('type', 'outer');
  const colorHex = get('colorhex', '000000').replace('#','');
  const opacity = parseFloat(get('opacity', '30')) || 0;
  const x = get('x', '0'); const y = get('y', '4');
  const blur = get('blur', '12'); const spread = get('spread', '0');
  const hex = colorHex.padEnd(6, '0');
  const r = parseInt(hex.slice(0,2),16)||0, g = parseInt(hex.slice(2,4),16)||0, b = parseInt(hex.slice(4,6),16)||0;
  const a = (opacity/100).toFixed(2);
  const colorStr = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  const insetStr = type === 'inset' ? 'inset ' : '';
  applyStyle('boxShadow', insetStr + x + 'px ' + y + 'px ' + blur + 'px ' + spread + 'px ' + colorStr);
}
async function applyStyle(property: string, value: string) {
  // Route virtual stroke props (`__stroke_color`, `__stroke_weight`,
  // `__stroke_style`) to their real CSS targets based on the active
  // stroke position (Inside / Outside / Center). This keeps the Stroke
  // section's UI mode-agnostic — fields write through one helper.
  if (property === '__stroke_color' || property === '__stroke_weight' || property === '__stroke_style') {
    applyStrokeProperty(property, value);
    return;
  }
  const res = await send({ type: 'SP_APPLY_STYLE', property, value });
  if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; render();
}

// Map the stroke section's virtual props to actual CSS targets. With the
// layered model, color / weight mutate the active layer and dispatch via
// `dispatchStrokeLayers` (which picks the right CSS path: border-* for
// Outside-single, box-shadow chain for Inside or Outside-multi, outline-*
// for Center). Style stays uniform across the chain (CSS limitation).
function applyStrokeProperty(prop: string, value: string) {
  const s = info?.computedStyles || {};
  const pos = inferStrokePosition(s);
  const id = info?.id || '';

  // Determine the current style keyword (used by the dispatcher to write
  // border-*-style / outline-style / etc.). Reads the in-memory intent map
  // first so dashed/dotted intent is preserved across mode switches.
  const intentStyle = id ? strokeStyleByElement.get(id) : undefined;
  const cssStyleNow = pos === 'center'
    ? (s.outlineStyle && s.outlineStyle !== 'none' ? s.outlineStyle : 'solid')
    : (s.borderTopStyle && s.borderTopStyle !== 'none' ? s.borderTopStyle : 'solid');
  const styleNow = intentStyle || cssStyleNow;

  if (prop === '__stroke_color' || prop === '__stroke_weight') {
    if (!id) return;
    const layers = getStrokeLayers(id, s, pos);
    // Seed a layer if the list is empty (e.g. Outside with no border yet
    // — first edit of color/weight implies the user wants a stroke).
    if (layers.length === 0) {
      layers.push({ weight: 1, color: '#000000', visible: true });
    }
    const idx = Math.min(activeStrokeIdx, layers.length - 1);
    if (prop === '__stroke_color') {
      layers[idx].color = value;
    } else {
      const num = parseFloat(value) || 0;
      layers[idx].weight = num;
    }
    strokeLayersByElement.set(id, layers);
    dispatchStrokeLayers(layers, pos, s, applyStyle, styleNow);
    return;
  }

  if (prop === '__stroke_style') {
    // 'auto' is outline-only (browser-native focus ring). When the user
    // picks it from the dropdown, switch mode to Center automatically.
    if (value === 'auto' && pos !== 'center') {
      applyStrokePosition('center');
      // Defer the auto write so it lands after the mode switch.
      setTimeout(() => applyStyle('outlineStyle', 'auto'), 0);
      return;
    }
    // Track user's intent regardless of mode so the dashed panel toggles
    // correctly even in Inside mode (where CSS can't render the dashed
    // visual). The actual border-style / outline-style is only written
    // when the active mode supports it.
    if (id) strokeStyleByElement.set(id, value as 'solid' | 'dashed');
    if (pos === 'outside') {
      ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'].forEach(p => applyStyle(p, value));
    } else if (pos === 'center') {
      applyStyle('outlineStyle', value);
    } else {
      // Inside: CSS can't dash an inset shadow. Re-render so the dashed
      // config panel toggles based on the new intent.
      render();
    }
    return;
  }
}

// Pragmatic mapping for Figma's Position-section alignment buttons.
// Flex/grid parents → align-self / justify-self.
// Block parent      → margin-left/right auto for horizontal centering.
// Absolute/fixed    → top/left + translate shortcuts on the element itself.
function applyPositionAlign(which: string, ctx: { isFlex: boolean; isGrid: boolean; isAbs: boolean }) {
  const isFlexLike = ctx.isFlex || ctx.isGrid;
  if (which === 'h-left') {
    if (isFlexLike) applyStyle('justifySelf', 'start');
    else if (ctx.isAbs) { applyStyle('left', '0px'); applyStyle('right', 'auto'); applyStyle('translate', '0px 0px'); }
    else { applyStyle('marginLeft', '0px'); applyStyle('marginRight', 'auto'); }
  } else if (which === 'h-center') {
    if (isFlexLike) applyStyle('justifySelf', 'center');
    else if (ctx.isAbs) { applyStyle('left', '50%'); applyStyle('right', 'auto'); applyStyle('translate', '-50% 0px'); }
    else { applyStyle('marginLeft', 'auto'); applyStyle('marginRight', 'auto'); }
  } else if (which === 'h-right') {
    if (isFlexLike) applyStyle('justifySelf', 'end');
    else if (ctx.isAbs) { applyStyle('left', 'auto'); applyStyle('right', '0px'); applyStyle('translate', '0px 0px'); }
    else { applyStyle('marginLeft', 'auto'); applyStyle('marginRight', '0px'); }
  } else if (which === 'v-top') {
    if (isFlexLike) applyStyle('alignSelf', 'start');
    else if (ctx.isAbs) { applyStyle('top', '0px'); applyStyle('bottom', 'auto'); }
  } else if (which === 'v-middle') {
    if (isFlexLike) applyStyle('alignSelf', 'center');
    else if (ctx.isAbs) { applyStyle('top', '50%'); applyStyle('bottom', 'auto'); applyStyle('translate', '-50% -50%'); }
  } else if (which === 'v-bottom') {
    if (isFlexLike) applyStyle('alignSelf', 'end');
    else if (ctx.isAbs) { applyStyle('top', 'auto'); applyStyle('bottom', '0px'); }
  }
}

// Pragmatic CSS mapping for Figma's Stroke position selector. Single
// stroke per element. Border-* longhands store the user's intent (color,
// per-side widths, style) regardless of mode; Inside/Center add a
// synthesized visual (inset shadow / outline) on top, hiding the border
// itself. Outside leaves the native border visible.
function applyStrokePosition(pos: 'inside' | 'outside' | 'center') {
  const s = info?.computedStyles || {};
  const oldPos = inferStrokePosition(s);
  if (oldPos === pos) return;

  // Read current stroke params from whichever mode was active.
  let weight: number; let color: string; let style: string;
  if (oldPos === 'center') {
    weight = parseFloat(s.outlineWidth || '0') || 0;
    color = s.outlineColor || s.borderTopColor || '#000000';
    style = (s.outlineStyle && s.outlineStyle !== 'none') ? s.outlineStyle : 'solid';
  } else {
    weight = parseFloat(s.borderTopWidth || '0') || 0;
    color = s.borderTopColor || '#000000';
    style = (s.borderTopStyle && s.borderTopStyle !== 'none') ? s.borderTopStyle : 'solid';
  }
  // Bootstrap a visible 1px stroke ONLY on truly pristine elements (no
  // border / no inset shadow / no outline). If the user has explicitly
  // set weight to 0 in the previous mode, preserve that intent.
  const noVisibleStroke = oldPos === 'outside' &&
    weight === 0 &&
    (s.borderTopStyle || 'none') === 'none';
  if (noVisibleStroke) weight = 1;

  const sides = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'];
  const styles = ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'];
  const colors = ['borderTopColor','borderRightColor','borderBottomColor','borderLeftColor'];

  // Always sync per-side storage so switching back to Outside restores intent.
  sides.forEach(p => applyStyle(p, weight + 'px'));
  colors.forEach(p => applyStyle(p, color));

  if (pos === 'outside') {
    styles.forEach(p => applyStyle(p, style));
    const cleared = serializeStrokeLayers([], oldPos === 'center' ? 'inside' : oldPos, s.boxShadow || '');
    applyStyle('boxShadow', cleared);
    applyStyle('outlineStyle', 'none');
    applyStyle('outlineWidth', '0px');
    applyStyle('outlineOffset', '0px');
  } else if (pos === 'inside') {
    styles.forEach(p => applyStyle(p, 'none'));
    const css = serializeStrokeLayers([{ weight, color }], 'inside', s.boxShadow || '');
    applyStyle('boxShadow', css);
    applyStyle('outlineStyle', 'none');
    applyStyle('outlineWidth', '0px');
    applyStyle('outlineOffset', '0px');
  } else { // center
    styles.forEach(p => applyStyle(p, 'none'));
    const cleared = serializeStrokeLayers([], oldPos === 'inside' ? 'inside' : oldPos, s.boxShadow || '');
    applyStyle('boxShadow', cleared);
    applyStyle('outlineStyle', style);
    applyStyle('outlineWidth', weight + 'px');
    applyStyle('outlineColor', color);
    applyStyle('outlineOffset', (-Math.round(weight / 2)) + 'px');
  }
}
async function applyText(text: string) { const res = await send({ type: 'SP_SET_TEXT', text }); if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.undoCount != null) undoCount = res.undoCount; if (res.redoCount != null) redoCount = res.redoCount; render(); }
async function applyHtml(html: string) { const res = await send({ type: 'SP_SET_HTML', html }); if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.undoCount != null) undoCount = res.undoCount; if (res.redoCount != null) redoCount = res.redoCount; render(); }
async function domAction(action: string) { const res = await send({ type: 'SP_DOM_ACTION', action }); if (res.info) info = res.info; else if (action === 'delete' || action === 'cut') info = null; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.comments) comments = res.comments; undoCount = res.undoCount ?? undoCount; redoCount = res.redoCount ?? redoCount; render(); await refreshDomTree(); await refreshChanges(); }
async function selectElement(elementId: string) {
  const res = await send({ type: 'SP_SELECT_ELEMENT', elementId });
  if (res.payload || res.info) info = res.payload || res.info;
  hoverInfo = null; render();
  setTimeout(() => {
    const layerEl = root.querySelector('[data-dm-layer="' + elementId + '"]');
    if (layerEl) layerEl.scrollIntoView({ block: 'nearest' });
  }, 60);
}
async function selectParent() { const res = await send({ type: 'SP_SELECT_PARENT' }); if (res.payload || res.info) info = res.payload || res.info; render(); }
async function selectChild() { const res = await send({ type: 'SP_SELECT_CHILD' }); if (res.payload || res.info) info = res.payload || res.info; render(); }
async function undoAction() { const res = await send({ type: 'SP_UNDO' }); if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.comments) comments = res.comments; if (res.info) info = res.info; undoCount = res.undoCount ?? Math.max(0, undoCount - 1); redoCount = res.redoCount ?? redoCount + 1; render(); await refreshDomTree(); await refreshChanges(); }
async function redoAction() { const res = await send({ type: 'SP_REDO' }); if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.comments) comments = res.comments; if (res.info) info = res.info; undoCount = res.undoCount ?? undoCount + 1; redoCount = res.redoCount ?? Math.max(0, redoCount - 1); render(); await refreshDomTree(); await refreshChanges(); }
async function moveLayer(dir: 'up' | 'down') { const res = await send({ type: 'SP_DOM_ACTION', action: 'move-' + dir }); if (res.domChanges) domChanges = res.domChanges; await refreshDomTree(); }
async function downloadMedia() {
  if (!mediaInfo) return;
  const m = mediaInfo;
  try {
    if (m.kind === 'svg' && m.markup) {
      const blob = new Blob([m.markup], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = m.filename || 'icon.svg'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const resp = await fetch(m.src);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = m.filename || (m.kind + '-' + Date.now()); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('[DM] Media download failed:', err);
    const a = document.createElement('a'); a.href = m.src; a.download = m.filename || ''; a.target = '_blank'; a.click();
  }
}
async function copySvgMarkup() {
  if (mediaInfo?.markup) {
    try { await navigator.clipboard.writeText(mediaInfo.markup); } catch {}
  }
}
function showCaptureToast(kind: 'success' | 'error', text: string) {
  captureToast = { kind, text };
  if (captureToastTimer) clearTimeout(captureToastTimer);
  captureToastTimer = setTimeout(() => { captureToast = null; render(); }, 2400);
  render();
}

async function takeScreenshot() {
  const target = info ? 'element' : 'viewport';
  const res = await send({ type: 'SP_SCREENSHOT', target });
  if (!res.dataUrl) { showCaptureToast('error', 'Capture failed'); return; }
  const filename = target + '-' + Date.now() + '.png';
  const wantClipboard = captureMode === 'clipboard' || captureMode === 'both';
  const wantDownload = captureMode === 'download' || captureMode === 'both';
  let clipboardOk = !wantClipboard;
  let downloadOk = !wantDownload;
  if (wantClipboard) {
    try {
      const resp = await fetch(res.dataUrl);
      const blob = await resp.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      clipboardOk = true;
    } catch (err) {
      console.warn('[DM] Clipboard write failed', err);
      clipboardOk = false;
    }
  }
  if (wantDownload) {
    try {
      const a = document.createElement('a');
      a.href = res.dataUrl; a.download = filename; a.click();
      downloadOk = true;
    } catch { downloadOk = false; }
  }
  const btn = root.querySelector('[data-dm-action="screenshot"]');
  if (btn && (clipboardOk || downloadOk)) { btn.innerHTML = icon('check', 14); setTimeout(() => render(), 1200); }
  if (clipboardOk && downloadOk && wantClipboard && wantDownload) showCaptureToast('success', 'Copied & saved as ' + filename);
  else if (clipboardOk && wantClipboard) showCaptureToast('success', 'Copied to clipboard');
  else if (downloadOk && wantDownload) showCaptureToast('success', 'Saved as ' + filename);
  else showCaptureToast('error', 'Capture failed');
}
async function submitComment() {
  const text = commentText.trim(); if (!text) return;
  if (editingCommentId) { await send({ type: 'SP_REMOVE_CHANGE', changeId: 'comment-' + editingCommentId }); editingCommentId = null; }
  await send({ type: 'SP_ADD_COMMENT', text }); commentMode = false; commentText = ''; await refreshChanges();
}
function cancelComment() { commentMode = false; commentText = ''; editingCommentId = null; viewingCommentId = null; commentDirty = false; render(); }
function startComment() { if (!info) return; commentMode = true; commentText = ''; editingCommentId = null; viewingCommentId = null; commentDirty = false; render(); }
function editComment(comment: CommentEntry) { commentMode = true; commentText = comment.text; editingCommentId = comment.id; viewingCommentId = null; commentDirty = false; render(); }
async function deleteCommentEntry(commentId: string) { await send({ type: 'SP_REMOVE_CHANGE', changeId: 'comment-' + commentId }); comments = comments.filter(c => c.id !== commentId); render(); }
async function removeChange(changeId: string) { styleChanges = styleChanges.filter(c => (c.id || 'style-' + styleChanges.indexOf(c)) !== changeId); textChanges = textChanges.filter(c => c.id !== changeId); domChanges = domChanges.filter(c => (c.id || 'dom-' + c.action) !== changeId); batchAppliedChanges.delete(changeId); render(); await send({ type: 'SP_REMOVE_CHANGE', changeId }); await refreshChanges(); await refreshState(); }
async function clearAllChanges() { await send({ type: 'SP_CLEAR_CHANGES' }); styleChanges = []; textChanges = []; domChanges = []; comments = []; batchAppliedChanges.clear(); render(); }

// Tiny markdown-ish renderer for comment bodies. Supports inline code,
// bold (`**text**`), italic (`*text*`), links (`[text](url)`), and
// newlines. Escapes the input before substituting so nothing the user
// types can become HTML directly.
function renderCommentMarkdown(s: string): string {
  let h = escapeAttr(s);
  // Inline code first so its delimiters can't be eaten by bold / italic.
  h = h.replace(/`([^`]+)`/g, '<code style="font-family:SF Mono,Monaco,monospace;background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>');
  // Bold then italic. The italic regex skips over the `**` markers we
  // just inserted by requiring a non-`*` before the opening `*`.
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Markdown link — only allow http(s) or root-relative URLs.
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--dm-accent);">$1</a>');
  // Bare URL → link.
  h = h.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--dm-accent);">$2</a>');
  // Preserve line breaks.
  h = h.replace(/\n/g, '<br/>');
  return h;
}

// Revert every change in a single group (one element). The group key is
// either the element id or, when the tracker couldn't capture one, the
// selector — match against the same fallback the renderer uses.
async function revertGroup(groupKey: string) {
  const inGroup = (c: { elementId?: string; selector?: string }) =>
    (c.elementId || c.selector || 'unknown') === groupKey;
  const styleIds = styleChanges.filter(inGroup).map((c, i) => c.id || 'style-' + styleChanges.indexOf(c));
  const textIds  = textChanges.filter(inGroup).map(c => c.id);
  const domIds   = domChanges.filter(inGroup).map(c => c.id || 'dom-' + c.action);
  // Drop comments locally — comments live in their own collection. We
  // remove them along with the rest of the group for visual consistency.
  comments = comments.filter(c => (c as any).elementId !== groupKey && (c as any).selector !== groupKey);
  // Remove styles / text / dom via the existing per-change path so undo
  // / redo / overlay cleanup all flow through the tracker.
  for (const id of [...styleIds, ...textIds, ...domIds]) {
    await send({ type: 'SP_REMOVE_CHANGE', changeId: id });
  }
  styleChanges = styleChanges.filter(c => !inGroup(c));
  textChanges  = textChanges.filter(c => !inGroup(c));
  domChanges   = domChanges.filter(c => !inGroup(c));
  for (const id of [...styleIds, ...textIds, ...domIds]) batchAppliedChanges.delete(id);
  render();
  await refreshChanges();
  await refreshState();
}

// Copy just one group's changes to the clipboard as a Copy-Prompt payload.
// Reuses the existing SP_COPY_PROMPT message but scopes it via groupKey
// so the agent sees only the relevant element's edits.
async function copyGroupAsPrompt(groupKey: string) {
  const r = await send({ type: 'SP_COPY_PROMPT', groupKey });
  if (r?.text) {
    try { await navigator.clipboard.writeText(r.text); showCaptureToast('success', 'Copied group prompt'); }
    catch { showCaptureToast('error', 'Copy failed'); }
  } else if (r?.error) {
    showCaptureToast('error', r.error);
  }
}
async function copyPrompt() { const res = await send({ type: 'SP_EXPORT', format: 'markdown', level: 'detailed' }); const output = res.output || res.markdown || ''; if (output) { await navigator.clipboard.writeText(output); const btn = root.querySelector('#dm-copy-prompt-btn'); if (btn) { btn.textContent = 'Copied!'; setTimeout(() => render(), 1500); } } }
async function sendToAgent() {
  const res = await send({ type: 'SP_EXPORT', format: 'markdown', level: 'detailed' }); const output = res.output || res.markdown || '';
  if (mcpState === 'connected') { await send({ type: 'SP_SEND_TO_AGENT', payload: output }); const btn = root.querySelector('#dm-send-agent-btn'); if (btn) { (btn as HTMLElement).textContent = 'Sent!'; setTimeout(() => render(), 1500); } }
  else if (mcpState === 'running') alert('MCP server is running but no coding agent is connected yet.');
  else alert('MCP server is not running. Start it with: npm start');
}
function toggleTheme() { if (theme === 'system') theme = resolvedTheme === 'dark' ? 'light' : 'dark'; else if (theme === 'dark') theme = 'light'; else theme = 'dark'; resolveTheme(); chrome.storage?.local?.set?.({ 'dm-theme': theme }); render(); }
async function scrollToComment(comment: CommentEntry) { await send({ type: 'SP_SELECT_ELEMENT', elementId: comment.elementId }); info = { id: comment.elementId, tagName: '', className: '', computedStyles: {}, boundingRect: { x: 0, y: 0, width: 0, height: 0 }, breadcrumbs: [] }; editComment(comment); }
async function toggleLayerVisibility(layerId: string) { await send({ type: 'SP_TOGGLE_VISIBILITY', elementId: layerId }); await refreshDomTree(); }
async function deleteLayer(layerId: string) { await send({ type: 'SP_DOM_ACTION', action: 'delete', elementId: layerId }); if (info?.id === layerId) info = null; await refreshDomTree(); await refreshChanges(); }
async function duplicateLayer(layerId: string) { await send({ type: 'SP_DOM_ACTION', action: 'duplicate', elementId: layerId }); await refreshDomTree(); await refreshChanges(); }
async function reorderLayer(sourceId: string, targetId: string, position: 'before' | 'after' = 'before') {
  await send({ type: 'SP_REORDER_LAYER', sourceId, targetId, position });
  await refreshDomTree();
  await refreshChanges();
}

/* ── Message handling ── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ELEMENT_SELECTED') {
    info = msg.payload; hoverInfo = null; commentMode = false;
    render();
    refreshMedia();
    setTimeout(() => {
      const layerEl = root.querySelector('[data-dm-layer="' + info?.id + '"]');
      if (layerEl) layerEl.scrollIntoView({ block: 'nearest' });
    }, 60);
  }
  if (msg.type === 'ELEMENT_HOVERED_INFO') {
    // If an element is selected, ignore hover updates (a stale 100ms-debounced hover
    // info can arrive after a click; this guard prevents it from polluting state).
    if (info && msg.payload) return;
    hoverInfo = msg.payload;
    if (tab === 'design' && !info) render();
  }
  if (msg.type === 'COMMENT_BUBBLE_CLICKED') {
    const c = comments.find(cc => cc.id === msg.commentId);
    if (c) { tab = 'changes'; viewingCommentId = msg.commentId; editingCommentId = null; commentMode = false; render(); }
  }
  if (msg.type === 'STATE_UPDATE') {
    enabled = msg.enabled ?? enabled;
    inspecting = msg.inspecting ?? inspecting;
    undoCount = msg.undoCount ?? undoCount;
    redoCount = msg.redoCount ?? redoCount;
    if (msg.multiSelect !== undefined) multiSelectActive = !!msg.multiSelect;
    if (msg.multiSelectIds) multiSelectIds = msg.multiSelectIds;
    if (msg.frozen !== undefined) animationsFrozen = !!msg.frozen;
    render();
  }
  if (msg.type === 'MULTI_SELECT_UPDATE') {
    multiSelectIds = msg.payload?.ids || [];
    multiSelectActive = multiSelectIds.length > 0 || multiSelectActive;
    render();
  }
  if (msg.type === 'CHANGES_UPDATE') { styleChanges = msg.styleChanges || styleChanges; textChanges = msg.textChanges || textChanges; domChanges = msg.domChanges || domChanges; comments = msg.comments || comments; render(); }
});

/* ── Phase 2: Tag icon mapping ── */
const TAG_ICON_MAP: Record<string, keyof typeof icons> = {
  div: 'layoutGrid', span: 'type', p: 'type',
  h1: 'type', h2: 'type', h3: 'type', h4: 'type', h5: 'type', h6: 'type',
  a: 'externalLink', img: 'image', button: 'box',
  input: 'pencil', textarea: 'pencil', select: 'sliders',
  form: 'fileText', label: 'type',
  ul: 'layers', ol: 'layers', li: 'minus',
  nav: 'compass', header: 'layoutDashboard', footer: 'layoutDashboard',
  main: 'layoutDashboard', section: 'layoutDashboard', article: 'layoutDashboard', aside: 'layoutDashboard',
  table: 'layoutGrid', tr: 'minus', td: 'minus', th: 'minus',
  svg: 'penTool', canvas: 'penTool',
  video: 'play', audio: 'activity',
  iframe: 'externalLink',
  strong: 'type', em: 'type', b: 'type', i: 'type', small: 'type',
  code: 'code', pre: 'code',
  body: 'box',
};

/* ── Phase 2: Tree helpers ── */
function buildNodeMap(): Map<string, DomNode> {
  const map = new Map<string, DomNode>();
  for (const n of domTree) map.set(n.id, n);
  return map;
}

function isAncestorCollapsed(node: DomNode, nodeMap: Map<string, DomNode>): boolean {
  let pid = node.parentId;
  while (pid) {
    if (collapsedNodes.has(pid)) return true;
    pid = nodeMap.get(pid)?.parentId ?? null;
  }
  return false;
}

// Helper: does this elementId have any tracked change of any kind?
function elementHasChanges(elementId: string): boolean {
  if (!elementId) return false;
  if (styleChanges.some(c => c.elementId === elementId)) return true;
  if (textChanges.some(c => c.elementId === elementId)) return true;
  if (domChanges.some(c => c.elementId === elementId)) return true;
  if (comments.some(c => (c as any).elementId === elementId)) return true;
  return false;
}

function getVisibleLayers(): DomNode[] {
  const nodeMap = buildNodeMap();
  let filtered = domTree;

  // Layer search filter
  if (layerSearch.trim()) {
    const q = layerSearch.toLowerCase();
    const matchIds = new Set<string>();
    for (const n of domTree) {
      // Apply rename override before matching so renamed layers are findable.
      const name = layerNameOverrides.get(n.id) || n.displayName;
      if (name.toLowerCase().includes(q) || n.tagName.toLowerCase().includes(q)) {
        matchIds.add(n.id);
        // Auto-expand parents of matches
        let pid = n.parentId;
        while (pid) {
          collapsedNodes.delete(pid);
          matchIds.add(pid);
          pid = nodeMap.get(pid)?.parentId ?? null;
        }
      }
    }
    filtered = filtered.filter(n => matchIds.has(n.id));
  }

  // Visibility / state filter chips
  if (layersFilter === 'visible') {
    filtered = filtered.filter(n => n.isVisible);
  } else if (layersFilter === 'hidden') {
    filtered = filtered.filter(n => !n.isVisible);
  } else if (layersFilter === 'modified') {
    filtered = filtered.filter(n => elementHasChanges(n.id));
  }

  return filtered.filter(n => !isAncestorCollapsed(n, nodeMap));
}

// Maps each design-tab section to the CSS properties it owns. Drives the
// per-section reset button on the section header — clicking it removes
// every recorded style change whose property is in this list. Properties
// that legitimately belong to multiple sections (e.g. `gap`) are listed
// where the user is most likely to look for them.
const SECTION_PROPS: Record<string, string[]> = {
  position: [
    'position','top','right','bottom','left','zIndex',
    'translate','rotate','scale','transform','transformOrigin','transformBox',
    'perspective','perspectiveOrigin','transformStyle','backfaceVisibility',
    'insetBlockStart','insetBlockEnd','insetInlineStart','insetInlineEnd',
    'anchorName','positionAnchor','positionArea','viewTransitionName',
    'positionTryFallbacks','positionTryOrder','positionVisibility',
    'alignSelf','justifySelf',
    'marginTop','marginRight','marginBottom','marginLeft',
  ],
  layout: [
    'width','height','minWidth','maxWidth','minHeight','maxHeight','aspectRatio',
    'display','overflow','overflowX','overflowY','clipPath','boxSizing',
    'flexDirection','flexWrap','justifyContent','alignItems','alignContent',
    'flexGrow','flexShrink','flexBasis','order',
    'gap','rowGap','columnGap',
    'gridTemplateColumns','gridTemplateRows','gridTemplateAreas',
    'gridAutoColumns','gridAutoRows','gridAutoFlow',
    'gridColumn','gridRow','gridArea',
    'placeItems','placeContent','placeSelf',
    'paddingTop','paddingRight','paddingBottom','paddingLeft',
    'marginTop','marginRight','marginBottom','marginLeft',
    'marginBlockStart','marginBlockEnd','marginInlineStart','marginInlineEnd',
  ],
  appearance: [
    // Primary
    'opacity','mixBlendMode','isolation',
    'borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius','borderRadius',
    'filter','backdropFilter',
    // Visibility & cursor
    'visibility','cursor','colorScheme','forcedColorAdjust',
    // Interaction
    'pointerEvents','userSelect','appearance',
    // Form-only
    'accentColor','caretColor',
    // Clip path
    'clipPath',
    // Scrollbars
    'scrollbarWidth','scrollbarColor','scrollbarGutter',
    // Performance
    'contain','contentVisibility','willChange',
  ],
  typography: [
    // Primary controls
    'fontFamily','fontSize','fontWeight','fontStyle','color',
    'lineHeight','letterSpacing','wordSpacing','textAlign','textTransform',
    'textDecorationLine','listStyleType',
    // Decoration cluster
    'textDecorationStyle','textDecorationColor','textDecorationThickness',
    'textUnderlineOffset','textUnderlinePosition','textDecorationSkipInk',
    // Wrapping / whitespace
    'whiteSpace','textWrap','wordBreak','overflowWrap','hyphens',
    'textJustify','textAlignLast','lineBreak',
    // Layout in text
    'textIndent','tabSize','verticalAlign','textOverflow',
    'webkitLineClamp','webkitBoxOrient',
    // Direction (i18n)
    'direction','writingMode','unicodeBidi',
    // Font features
    'fontStretch','fontSizeAdjust','fontKerning','fontOpticalSizing','fontSynthesis',
    'fontVariant','fontVariantCaps','fontVariantNumeric','fontVariantLigatures','fontVariantPosition',
    'fontFeatureSettings','fontVariationSettings','textRendering',
    // List
    'listStylePosition','listStyleImage',
  ],
  fill: [
    'backgroundColor','backgroundImage','backgroundSize','backgroundRepeat',
    'backgroundPosition','backgroundAttachment','backgroundClip','backgroundOrigin',
    'backgroundBlendMode','webkitBackgroundClip','webkitTextFillColor',
    // Mask family (lives in Fill Advanced)
    'maskImage','maskMode','maskRepeat','maskPosition','maskSize',
    'maskOrigin','maskClip','maskComposite',
    // SVG paint (Fill section variant for kind=svg)
    'fill','fillOpacity','fillRule','stroke','strokeWidth','strokeOpacity',
    'strokeDasharray','strokeDashoffset','strokeLinecap','strokeLinejoin',
  ],
  stroke: [
    'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
    'borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle',
    'borderTopColor','borderRightColor','borderBottomColor','borderLeftColor',
    'outlineWidth','outlineStyle','outlineColor','outlineOffset',
    'borderImageSource','borderImageSlice','borderImageWidth','borderImageOutset','borderImageRepeat',
  ],
  effects: [
    'boxShadow','textShadow','filter','backdropFilter',
    'transition','transitionProperty','transitionDuration','transitionTimingFunction','transitionDelay',
    'animation','animationName','animationDuration','animationTimingFunction','animationDelay',
    'animationIterationCount','animationDirection','animationFillMode','animationPlayState',
    // Motion path
    'offsetPath','offsetDistance','offsetRotate','offsetAnchor','offsetPosition',
    // View Transitions (Position section also exposes view-transition-name —
    // both sections are valid contexts for it)
    'viewTransitionName','viewTransitionClass',
    // Scroll-driven animations (animation-timeline + named timelines)
    'animationTimeline','animationRange','animationRangeStart','animationRangeEnd',
    'scrollTimeline','scrollTimelineName','scrollTimelineAxis',
    'viewTimeline','viewTimelineName','viewTimelineAxis','viewTimelineInset',
    'timelineScope',
  ],
};

/* ── Shared render helpers ── */
function sec(title: string, iconName: keyof typeof icons, content: string, defaultOpen = true, actions = ''): string {
  const id = 'dm-sec-' + title.toLowerCase().replace(/[\s&]+/g, '-');
  const resetKey = SECTION_PROPS[title.toLowerCase()] ? title.toLowerCase() : '';
  const isOpen = sectionStates[id] !== undefined ? sectionStates[id]! : defaultOpen;
  const chevIcon = isOpen ? 'chevronDown' : 'chevronRight';
  const bodyClass = isOpen ? 'dm-section-body dm-expanded' : 'dm-section-body dm-collapsed';
  const bodyStyle = isOpen ? 'padding:0 14px 14px;max-height:2000px;' : 'padding:0 14px 0;max-height:0;';
  // Per-section reset — only show when this section has a known property
  // list AND there's at least one tracked change in that property set.
  let resetBtn = '';
  if (resetKey && SECTION_PROPS[resetKey]) {
    const propSet = new Set(SECTION_PROPS[resetKey]);
    const hasChanges = styleChanges.some(c => propSet.has(c.property));
    if (hasChanges) {
      resetBtn = '<button class="dm-section-action" data-dm-reset-section="' + escapeAttr(resetKey) + '" title="Reset ' + escapeAttr(title) + ' changes on this element" aria-label="Reset section">' + icon('rotateCcw', 11) + '</button>';
    }
  }
  // Action cluster sits between the title and the chevron. Per-section
  // header buttons (eye, +, advanced toggle) are passed in via `actions`
  // and reset is appended last so it always lives next to the chevron.
  const actionCluster = (actions || resetBtn)
    ? '<div class="dm-section-actions">' + actions + resetBtn + '</div>'
    : '';
  return '<div style="border-bottom:1px solid var(--dm-separator);">' +
    '<div class="dm-section-header" data-dm-toggle-section="' + id + '" aria-expanded="' + isOpen + '" aria-label="' + title + ' section" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none;">' +
    '<span style="color:var(--dm-text-muted);display:flex;align-items:center;">' + icon(iconName, 14) + '</span>' +
    '<span style="font-size:11px;font-weight:600;color:var(--dm-text-secondary);flex:1;">' + title + '</span>' +
    actionCluster +
    '<span style="color:var(--dm-text-dim);display:flex;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>' +
    '</div><div class="' + bodyClass + '" data-dm-section-body="' + id + '" style="' + bodyStyle + '">' + content + '</div></div>';
}

function inp(label: string, prop: string, value: string, unit = 'px'): string {
  const parsed = parseNumeric(value);
  const displayVal = parsed ? String(parsed.num) : value;
  const displayUnit = parsed ? (parsed.unit || unit) : '';
  const isNum = !!parsed;
  const numAttrs = isNum ? ' data-dm-numeric="1" data-dm-unit="' + escapeAttr(displayUnit) + '" inputmode="decimal"' : '';
  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    (label ? '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' : '') +
    '<div style="display:flex;align-items:center;border-radius:5px;overflow:hidden;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);">' +
    '<input type="text" class="dm-input" data-dm-prop="' + prop + '"' + numAttrs + ' value="' + escapeAttr(displayVal) + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;"/>' +
    (displayUnit ? '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;flex-shrink:0;opacity:0.6;pointer-events:none;">' + displayUnit + '</span>' : '') +
    '</div></div>';
}

// Numeric input that knows about a CSS keyword default (e.g. `normal` for
// line-height / letter-spacing). If the live value is the keyword, the input
// renders empty with a `(Normal)` chip on the right at 0.4 opacity — making
// it obvious the user is on the default — and is still freely editable. As
// soon as the user types a number it overrides the default; clearing the
// field reverts to the keyword (applyStyleChange treats '' as "remove").
function inpKw(label: string, prop: string, value: string, unit: string, keyword: string): string {
  const isKeyword = !value || value === keyword;
  const parsed = isKeyword ? null : parseNumeric(value);
  const displayVal = isKeyword ? '' : (parsed ? String(parsed.num) : value);
  const displayUnit = parsed ? (parsed.unit || unit) : (isKeyword ? unit : '');
  const placeholder = isKeyword ? '0' : '';
  const keywordChip = isKeyword
    ? '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;flex-shrink:0;opacity:0.4;pointer-events:none;">(' + keyword.charAt(0).toUpperCase() + keyword.slice(1) + ')</span>'
    : (displayUnit ? '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;flex-shrink:0;opacity:0.6;pointer-events:none;">' + displayUnit + '</span>' : '');
  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    (label ? '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' : '') +
    '<div style="display:flex;align-items:center;border-radius:5px;overflow:hidden;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);">' +
    '<input type="text" class="dm-input" data-dm-prop="' + prop + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(unit) + '" data-dm-kw="' + escapeAttr(keyword) + '" inputmode="decimal" placeholder="' + placeholder + '" value="' + escapeAttr(displayVal) + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;"/>' +
    keywordChip +
    '</div></div>';
}

function sel(label: string, prop: string, value: string, options: string[]): string {
  const opts = options.map(o => '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + o + '</option>').join('');
  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' +
    '<select class="dm-select" data-dm-prop="' + prop + '" style="min-width:0;">' + opts + '</select></div>';
}

function selKV(label: string, prop: string, value: string, options: Array<{ value: string; label: string }>): string {
  const opts = options.map(o => '<option value="' + escapeAttr(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + escapeAttr(o.label) + '</option>').join('');
  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' +
    '<select class="dm-select" data-dm-prop="' + prop + '" style="min-width:0;">' + opts + '</select></div>';
}

const FONT_WEIGHTS: Array<{ value: string; label: string }> = [
  { value: '100', label: 'Thin (100)' },
  { value: '200', label: 'Extra Light (200)' },
  { value: '300', label: 'Light (300)' },
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semi Bold (600)' },
  { value: '700', label: 'Bold (700)' },
  { value: '800', label: 'Extra Bold (800)' },
  { value: '900', label: 'Black (900)' },
];

// ── Color math: HSV ↔ RGB ↔ HEX, plus a robust value parser. The custom
// inline color picker (built below) renders the HSV gradient + hue slider
// from these. Edge cases handled: 3/6/8-digit hex, rgb(...) with or
// without alpha, named colors via a temporary canvas-style fallback are
// not needed here because `value` arrives from getComputedStyle (always
// rgba) or our own `var()` strings (handled separately).

function clampInt(n: number, lo = 0, hi = 255): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function parseColorRgb(value: string): [number, number, number] | null {
  const v = (value || '').trim();
  if (!v) return null;
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    }
    if (/^[0-9a-fA-F]{6,8}$/.test(hex)) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

function rgbToHexStr(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(n => clampInt(n).toString(16).padStart(2, '0')).join('');
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  // h in 0..360, s and v in 0..1
  const c = v * s;
  const hp = (h % 360 + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = v - c;
  return [clampInt((r1 + m) * 255), clampInt((g1 + m) * 255), clampInt((b1 + m) * 255)];
}

// Renders the inline custom color picker: HSV gradient + hue slider +
// hex/R/G/B inputs. All interaction wires through `data-dm-color-*`
// attributes that the input + pointer handlers below recognize.
function renderInlineColorPicker(prop: string, value: string): string {
  const rgb = parseColorRgb(value) || [0, 0, 0];
  const [r, g, b] = rgb;
  const [h, s, v] = rgbToHsv(r, g, b);
  const hueColor = `hsl(${h.toFixed(1)}, 100%, 50%)`;
  const svX = (s * 100).toFixed(1);
  const svY = ((1 - v) * 100).toFixed(1);
  const hueX = (h / 360 * 100).toFixed(1);
  const hex = rgbToHexStr(r, g, b);

  return (
    // SV (saturation × value) gradient. Bottom→top black overlay handles
    // the V axis; left→right white→hue handles the S axis. Marker dot
    // positioned on top via percentage offsets.
    '<div data-dm-color-sv="' + escapeAttr(prop) + '" data-dm-color-h="' + h.toFixed(2) + '" style="position:relative;width:100%;height:140px;border-radius:5px;background:linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ' + hueColor + ');cursor:crosshair;user-select:none;touch-action:none;">' +
      '<div style="position:absolute;left:' + svX + '%;top:' + svY + '%;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.5);transform:translate(-50%,-50%);pointer-events:none;"></div>' +
    '</div>' +
    '<div data-dm-color-hue="' + escapeAttr(prop) + '" style="position:relative;width:100%;height:14px;margin-top:8px;border-radius:5px;background:linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);cursor:ew-resize;user-select:none;touch-action:none;">' +
      '<div style="position:absolute;left:' + hueX + '%;top:50%;width:14px;height:18px;background:#fff;border:1px solid rgba(0,0,0,0.4);border-radius:3px;transform:translate(-50%,-50%);pointer-events:none;"></div>' +
    '</div>' +
    // Format cycle button + eyedropper. The eyedropper uses Chrome's
    // built-in EyeDropper API (Chrome 95+). On unsupported browsers the
    // click handler shows a tooltip explaining the requirement.
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:10px;">' +
      '<button data-dm-eyedropper="' + escapeAttr(prop) + '" title="Eyedropper — pick a colour from anywhere on screen" style="display:flex;align-items:center;gap:4px;padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">' +
        icon('penTool', 11) +
        '<span>Pick</span>' +
      '</button>' +
      '<button data-dm-cycle-color-format style="display:flex;align-items:center;gap:4px;padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;letter-spacing:0.4px;text-transform:uppercase;" title="Cycle color format">' +
        '<span>' + (colorFormat === 'hex' ? 'HEX' : colorFormat === 'rgba' ? 'RGB' : 'HSL') + '</span>' +
        icon('chevronsUpDown', 11) +
      '</button>' +
    '</div>' +
    // When the format cycle is on HSL, swap the R/G/B sub-inputs for H/S/L
    // so the panel matches the format the user types in. Each H/S/L
    // input writes back via `data-dm-color-hsl` (handled in the input
    // listener below).
    (colorFormat === 'hsl' ? (() => {
      const hh = Math.round(h);
      const sPct = Math.round(s * 100);
      // HSL "L" is from HSL space (different from HSV "V"). Convert.
      // HSV {h,s,v} → HSL: l = v * (1 - s/2), s_hsl = (v-l) / min(l, 1-l)
      const lDec = v * (1 - s / 2);
      const lPct = Math.round(lDec * 100);
      return '<div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:6px;margin-top:6px;">' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Hex</label>' +
          '<input type="text" class="dm-input" data-dm-color-hex="' + escapeAttr(prop) + '" value="' + escapeAttr(hex.slice(1)) + '" style="padding:5px 6px;font-size:10px;font-family:SF Mono,Monaco,monospace;text-transform:uppercase;"/>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">H</label>' +
          '<input type="number" class="dm-input" data-dm-color-hsl="' + escapeAttr(prop) + '" data-c="h" min="0" max="360" value="' + hh + '" style="padding:5px 6px;font-size:10px;"/>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">S</label>' +
          '<input type="number" class="dm-input" data-dm-color-hsl="' + escapeAttr(prop) + '" data-c="s" min="0" max="100" value="' + sPct + '" style="padding:5px 6px;font-size:10px;"/>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">L</label>' +
          '<input type="number" class="dm-input" data-dm-color-hsl="' + escapeAttr(prop) + '" data-c="l" min="0" max="100" value="' + lPct + '" style="padding:5px 6px;font-size:10px;"/>' +
        '</div>' +
      '</div>';
    })() :
    '<div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:6px;margin-top:6px;">' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Hex</label>' +
        '<input type="text" class="dm-input" data-dm-color-hex="' + escapeAttr(prop) + '" value="' + escapeAttr(hex.slice(1)) + '" style="padding:5px 6px;font-size:10px;font-family:SF Mono,Monaco,monospace;text-transform:uppercase;"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">R</label>' +
        '<input type="number" class="dm-input" data-dm-color-rgb="' + escapeAttr(prop) + '" data-c="r" min="0" max="255" value="' + r + '" style="padding:5px 6px;font-size:10px;"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">G</label>' +
        '<input type="number" class="dm-input" data-dm-color-rgb="' + escapeAttr(prop) + '" data-c="g" min="0" max="255" value="' + g + '" style="padding:5px 6px;font-size:10px;"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">B</label>' +
        '<input type="number" class="dm-input" data-dm-color-rgb="' + escapeAttr(prop) + '" data-c="b" min="0" max="255" value="' + b + '" style="padding:5px 6px;font-size:10px;"/>' +
      '</div>' +
    '</div>')
  );
}

// Format the user's color value for display in the input field. Honors the
// configured `colorFormat` setting (HEX vs RGBA). `var(--token)` references
// pass through verbatim — they're more useful than the resolved hex would be.
function formatColorForDisplay(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  if (v.startsWith('var(')) return v;          // keep token references readable
  if (colorFormat === 'rgba') return v;         // value is already in rgb/rgba/hex form
  // 'hex' mode — convert any rgb()/rgba() to #RRGGBB. Hex passthrough.
  return rgbToHex(v);
}

// Format a token's display value the same way (used in the dropdown label).
function formatTokenForDisplay(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  if (colorFormat === 'rgba') return v;
  return rgbToHex(v);
}

// Font family — dropdown of fonts actually used on the page (parsed from
// every accessible stylesheet) plus a curated list of system fallbacks.
// Match against the *primary* family so a computed style like
// `Inter, Helvetica, sans-serif` lines up with the option whose primary
// family is `Inter`. If the current value isn't in the list (rare —
// e.g. inline font-family that no rule uses), prepend it so it renders.
function renderFontFamilyPicker(currentValue: string): string {
  const v = (currentValue || '').trim();
  const primary = (s: string) => s.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  const curPrimary = primary(v);
  let options = pageFonts.slice();
  let matchedValue = '';
  for (const opt of options) {
    if (primary(opt.value) === curPrimary) { matchedValue = opt.value; break; }
  }
  if (!matchedValue && v) {
    // Surface the current value as the first option so the dropdown reflects reality.
    options = [{ value: v, label: primary(v) || v.slice(0, 32) }, ...options];
    matchedValue = v;
  }
  return selKV('Font', 'fontFamily', matchedValue, options);
}

// Render the color picker panel (HSV / hex / RGB / token list) for a prop.
// Used both inline by colorInp and detached by sections (e.g. Stroke) that
// want the panel rendered below the row instead of inside the field.
function renderColorPanel(prop: string, value: string): string {
  const hex = rgbToHex(value);
  const colorTokens = designTokens.filter(t => t.category === 'color');
  const q = colorPickerSearch.toLowerCase();
  const filteredTokens = q
    ? colorTokens.filter(t => t.name.toLowerCase().includes(q) || t.value.toLowerCase().includes(q))
    : colorTokens;
  return '<div data-dm-color-popover="' + prop + '" style="margin-top:6px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;max-height:520px;overflow-y:auto;">' +
    '<div style="padding:10px;border-bottom:1px solid var(--dm-separator);">' +
    renderInlineColorPicker(prop, value) +
    '</div>' +
    (filteredTokens.length > 0
      ? '<div style="padding:6px 8px 4px;font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Site Colors (' + filteredTokens.length + ')</div>' +
        filteredTokens.map(t => {
          const tokenVal = t.value.trim();
          const tokenHex = rgbToHex(tokenVal);
          const tokenDisplay = formatTokenForDisplay(tokenVal);
          const isCurrent = tokenVal === value || tokenHex === hex || ('var(' + t.name + ')') === value;
          return '<button data-dm-pick-color="' + escapeAttr('var(' + t.name + ')') + '" data-dm-pick-prop="' + escapeAttr(prop) + '" style="width:100%;display:flex;align-items:center;gap:8px;padding:5px 8px;background:' + (isCurrent ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;border-radius:0;cursor:pointer;text-align:left;font-family:inherit;color:var(--dm-text);">' +
            '<span style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(tokenVal) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>' +
            '<span style="flex:1;font-size:10px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(t.name) + '</span>' +
            '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;max-width:90px;overflow:hidden;text-overflow:ellipsis;">' + escapeAttr(tokenDisplay) + '</span>' +
            '</button>';
        }).join('')
      : '<div style="padding:14px;font-size:10px;color:var(--dm-text-dim);text-align:center;">' + (q ? 'No matching colors. Press Enter to use "' + escapeAttr(q) + '" as custom value.' : 'No design tokens on this page.') + '</div>') +
    '</div>';
}

// Site-color tokens-only dropdown. Used as a focus-driven shortcut on the
// hex input — clicking into the input pops up just the site-colour list
// (not the full HSV picker), so users can apply a token without opening
// the full panel.
function renderTokensDropdown(prop: string, value: string): string {
  const hex = rgbToHex(value);
  const colorTokens = designTokens.filter(t => t.category === 'color');
  if (colorTokens.length === 0) return '';
  return '<div data-dm-tokens-dropdown="' + prop + '" style="position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:6px;max-height:240px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:4px 0;">' +
    '<div style="padding:6px 8px 4px;font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Site colours (' + colorTokens.length + ')</div>' +
    colorTokens.map(t => {
      const tokenVal = t.value.trim();
      const tokenHex = rgbToHex(tokenVal);
      const isCurrent = tokenVal === value || tokenHex === hex || ('var(' + t.name + ')') === value;
      const tokenDisplay = formatTokenForDisplay(tokenVal);
      return '<button data-dm-pick-color="' + escapeAttr('var(' + t.name + ')') + '" data-dm-pick-prop="' + escapeAttr(prop) + '" style="width:100%;display:flex;align-items:center;gap:8px;padding:5px 8px;background:' + (isCurrent ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;cursor:pointer;text-align:left;font-family:inherit;color:var(--dm-text);">' +
        '<span style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(tokenVal) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>' +
        '<span style="flex:1;font-size:10px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(t.name) + '</span>' +
        '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;max-width:90px;overflow:hidden;text-overflow:ellipsis;">' + escapeAttr(tokenDisplay) + '</span>' +
        '</button>';
    }).join('') +
    '</div>';
}

function colorInp(label: string, prop: string, value: string, omitPanel = false): string {
  const hex = rgbToHex(value);
  const displayColor = formatColorForDisplay(value);
  const isOpen = activeColorPickerProp === prop;
  const tokensOpen = tokensDropdownProp === prop;
  // Render the inline panel below the field unless caller asked us to
  // omit it (Stroke renders the panel detached, beneath the whole row).
  const panel = (isOpen && !omitPanel) ? renderColorPanel(prop, value) : '';
  // Tokens-only dropdown — opens when the hex input is focused. Doesn't
  // render when the full color panel is already open (avoid stacking).
  const tokensPanel = (tokensOpen && !isOpen && !omitPanel) ? renderTokensDropdown(prop, value) : '';
  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;position:relative;">' +
    (label ? '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' : '') +
    '<div style="display:flex;align-items:center;gap:4px;min-width:0;position:relative;">' +
    '<button type="button" data-dm-color-trigger="' + escapeAttr(prop) + '" title="Pick a color" style="width:28px;height:28px;border:1px solid var(--dm-input-border);border-radius:5px;cursor:pointer;background:' + escapeAttr(value || hex || '#000') + ';padding:0;flex-shrink:0;outline:' + (isOpen ? '2px solid var(--dm-accent)' : 'none') + ';"></button>' +
    '<input type="text" class="dm-input" data-dm-prop="' + prop + '" data-dm-tokens-trigger="' + escapeAttr(prop) + '" value="' + escapeAttr(displayColor) + '" style="background:var(--dm-input-bg);border:1px solid var(--dm-input-border);flex:1;min-width:0;"/>' +
    tokensPanel +
    '</div>' +
    panel +
    '</div>';
}

function grid(cols: number, ...children: string[]): string { return '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:8px;">' + children.join('') + '</div>'; }
function sp(): string { return '<div style="height:10px;"></div>'; }
function sub(text: string): string { return '<div style="color:var(--dm-text-dim);font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;margin-top:6px;">' + text + '</div>'; }
// 12-column grid helper. Each spec is a column span (1-12) and the HTML
// to drop in that cell. Cells stack into multiple rows automatically when
// spans don't fit a single 12-track row.
function grid12(cells: Array<{ span: number; content: string }>): string {
  return '<div style="display:grid;grid-template-columns:repeat(12, 1fr);gap:6px;align-items:end;">' +
    cells.map(c => '<div style="grid-column:span ' + c.span + ';min-width:0;">' + c.content + '</div>').join('') +
    '</div>';
}
// Wrap content as visually disabled (greyed out, non-interactive) — used
// when a control isn't applicable for the current context (e.g. anchor
// `position-area` while `position: static`). Children inputs stay in DOM
// so morphdom's focus-preservation logic doesn't churn.
function dis(content: string, disabled: boolean, reason = 'Not applicable for the current position type'): string {
  if (!disabled) return content;
  return '<div style="opacity:0.4;pointer-events:none;cursor:not-allowed;" aria-disabled="true" title="' + escapeAttr(reason) + '">' + content + '</div>';
}

/* ── v1.2: Linked 2×2 grid helper — link button centered between rows ── */
function linked2x2(linkKey: string, isLinked: boolean, ...items: string[]): string {
  const linkColor = isLinked ? 'var(--dm-accent)' : 'var(--dm-text-dim)';
  const linkBg = isLinked ? 'var(--dm-accent-bg)' : 'var(--dm-bg)';
  const linkBorder = isLinked ? 'var(--dm-accent-border)' : 'var(--dm-separator)';
  // Place the chain icon at the right edge, vertically centered between the
  // two rows, so it doesn't sit on top of the 4th cell's label glyph
  // (⊥ / ⊣ / ┘ etc.). Reserve 28px of right padding on the row so the
  // button has room without overlapping the right-column inputs either.
  const linkBtn = '<button data-dm-border-link="' + linkKey + '" title="' + (isLinked ? 'Linked — all change together' : 'Unlinked — edit individually') + '" style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:24px;height:24px;background:' + linkBg + ';border:1px solid ' + linkBorder + ';border-radius:50%;color:' + linkColor + ';cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 0 0 3px var(--dm-bg);">' +
    icon(isLinked ? 'link2' : 'unlink2', 11) + '</button>';
  return '<div style="position:relative;padding-right:30px;">' + grid(2, ...items) + linkBtn + '</div>';
}

/* ── Figma-style helpers ──
   Reused across Position, Layout, Fill, Stroke, Appearance, and Effects
   sections. Each helper produces a small, self-contained chunk of HTML
   that piggybacks the existing event-delegation pipeline via `data-dm-*`
   attributes — no fresh listeners required. */

type IconRowButton = {
  icon?: keyof typeof icons;
  label?: string;
  attr: string;
  active?: boolean;
  title?: string;
  size?: number;
};

function iconButtonRow(buttons: IconRowButton[]): string {
  return '<div class="dm-icon-row">' + buttons.map(b => {
    const sz = b.size || 14;
    const inner = b.icon
      ? icon(b.icon, sz)
      : '<span style="font-size:11px;font-weight:600;line-height:1;">' + escapeAttr(b.label || '') + '</span>';
    return '<button class="dm-icon-row-button" ' + b.attr +
      ' data-active="' + (b.active ? 'true' : 'false') + '"' +
      (b.title ? ' title="' + escapeAttr(b.title) + '"' : '') +
      '>' + inner + '</button>';
  }).join('') + '</div>';
}

function segmentedRow(items: IconRowButton[]): string {
  return '<div class="dm-segmented">' + items.map(i => {
    const ic = i.icon ? icon(i.icon, 12) : '';
    const lb = i.label ? '<span>' + escapeAttr(i.label) + '</span>' : '';
    return '<button class="dm-segmented-item" ' + i.attr +
      ' data-active="' + (i.active ? 'true' : 'false') + '"' +
      (i.title ? ' title="' + escapeAttr(i.title) + '"' : '') +
      '>' + ic + lb + '</button>';
  }).join('') + '</div>';
}

type PopoverItem = { icon?: keyof typeof icons; label: string; attr: string; active?: boolean; divider?: boolean };

function popover(items: PopoverItem[]): string {
  return '<div class="dm-popover">' + items.map(i => {
    if (i.divider) return '<div class="dm-popover-divider"></div>';
    const ic = i.icon ? '<span style="color:var(--dm-text-muted);display:flex;">' + icon(i.icon, 12) + '</span>' : '';
    return '<button class="dm-popover-item" ' + i.attr +
      ' data-active="' + (i.active ? 'true' : 'false') + '">' + ic +
      '<span style="flex:1;">' + escapeAttr(i.label) + '</span>' +
      (i.active ? '<span style="color:var(--dm-accent);display:flex;">' + icon('check', 11) + '</span>' : '') +
      '</button>';
  }).join('') + '</div>';
}

function detectParentContext(displayInfo: any, s: Record<string, string>): {
  display: string; isFlex: boolean; isGrid: boolean; isAbs: boolean;
} {
  const display = (displayInfo?.parentDisplay as string) || '';
  const ownPos = (s.position || '').trim();
  return {
    display,
    isFlex: display === 'flex' || display === 'inline-flex',
    isGrid: display === 'grid' || display === 'inline-grid',
    isAbs: ownPos === 'absolute' || ownPos === 'fixed',
  };
}

function positionAlignGrid(_s: Record<string, string>, _ctx: ReturnType<typeof detectParentContext>): string {
  // Object-alignment buttons (canonical Figma icons). No inline help text —
  // dispatch logic lives in applyPositionAlign() based on parent context.
  const horizontal = iconButtonRow([
    { icon: 'alignStartVertical', attr: 'data-dm-pos-align="h-left"', title: 'Align left' },
    { icon: 'alignCenterVertical', attr: 'data-dm-pos-align="h-center"', title: 'Align horizontal center' },
    { icon: 'alignEndVertical', attr: 'data-dm-pos-align="h-right"', title: 'Align right' },
  ]);
  const vertical = iconButtonRow([
    { icon: 'alignStartHorizontal', attr: 'data-dm-pos-align="v-top"', title: 'Align top' },
    { icon: 'alignCenterHorizontal', attr: 'data-dm-pos-align="v-middle"', title: 'Align vertical center' },
    { icon: 'alignEndHorizontal', attr: 'data-dm-pos-align="v-bottom"', title: 'Align bottom' },
  ]);
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + horizontal + vertical + '</div>';
}

// Distribute buttons — render only when 2+ siblings are selected.
function positionDistributeRow(): string {
  const enabled = multiSelectActive && multiSelectIds.length >= 2;
  if (!enabled) return '';
  return iconButtonRow([
    { icon: 'alignHorizontalSpaceAround', attr: 'data-dm-pos-distribute="horizontal"', title: 'Distribute horizontally' },
    { icon: 'alignVerticalSpaceAround', attr: 'data-dm-pos-distribute="vertical"', title: 'Distribute vertically' },
  ]);
}

function flipButtons(s: Record<string, string>): string {
  const scale = (s.scale || '').trim();
  const parts = (scale === 'none' || !scale) ? ['1','1'] : scale.split(/\s+/);
  const sx = parseFloat(parts[0] || '1') || 1;
  const sy = parseFloat(parts[1] || parts[0] || '1') || sx;
  return iconButtonRow([
    { icon: 'flipHorizontal2', attr: 'data-dm-flip="h"', active: sx < 0, title: 'Flip horizontally' },
    { icon: 'flipVertical2', attr: 'data-dm-flip="v"', active: sy < 0, title: 'Flip vertically' },
  ]);
}

// Rotation 90° quick buttons — bump the `rotate` longhand by ±90deg.
function rotateQuickButtons(s: Record<string, string>): string {
  void s;
  return iconButtonRow([
    { icon: 'rotateCcw', attr: 'data-dm-rotate-step="-90"', title: 'Rotate 90° counter-clockwise' },
    { icon: 'rotateCw', attr: 'data-dm-rotate-step="90"', title: 'Rotate 90° clockwise' },
  ]);
}

// Z-order — Bring forward / Send backward as ±1 increment buttons.
function zOrderButtons(s: Record<string, string>): string {
  void s;
  return iconButtonRow([
    { icon: 'arrowUpToLine', attr: 'data-dm-z-step="up"', title: 'Bring forward' },
    { icon: 'arrowDownToLine', attr: 'data-dm-z-step="down"', title: 'Send backward' },
  ]);
}

function layoutModeRow(s: Record<string, string>): string {
  const display = s.display || 'block';
  const flexDir = s.flexDirection || 'row';
  const isFree = display === 'block' || display === 'inline' || display === 'inline-block' || display === '';
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isHStack = isFlex && (flexDir === 'row' || flexDir === 'row-reverse');
  const isVStack = isFlex && (flexDir === 'column' || flexDir === 'column-reverse');
  const isGrid = display === 'grid' || display === 'inline-grid';
  return segmentedRow([
    { icon: 'squareDashed', attr: 'data-dm-layout-mode="free"', active: isFree, title: 'Freeform (no layout)' },
    { icon: 'columns3', attr: 'data-dm-layout-mode="hstack"', active: isHStack, title: 'Horizontal stack' },
    { icon: 'rows3', attr: 'data-dm-layout-mode="vstack"', active: isVStack, title: 'Vertical stack' },
    { icon: 'layoutGrid', attr: 'data-dm-layout-mode="grid"', active: isGrid, title: 'Grid' },
  ]);
}

// 9-cell children alignment pad (writes justify-content + align-items on
// flex containers, justify-items + align-items on grid). Each cell is a
// {h, v} combination.
function childrenAlignPad(s: Record<string, string>): string {
  const display = s.display || 'block';
  const isGrid = display === 'grid' || display === 'inline-grid';
  const justifyProp = isGrid ? 'justifyItems' : 'justifyContent';
  const justifyVal = (s[justifyProp] || s.justifyContent || 'flex-start').toLowerCase();
  const alignVal = (s.alignItems || 'stretch').toLowerCase();
  const hToCss: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const vToCss: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
  const cssToH: Record<string, string> = { 'flex-start': 'left', start: 'left', center: 'center', 'flex-end': 'right', end: 'right' };
  const cssToV: Record<string, string> = { 'flex-start': 'top', start: 'top', center: 'center', 'flex-end': 'bottom', end: 'bottom' };
  const curH = cssToH[justifyVal] || 'left';
  const curV = cssToV[alignVal] || 'top';
  const cells: { h: string; v: string }[] = [];
  for (const v of ['top','center','bottom'])
    for (const h of ['left','center','right'])
      cells.push({ h, v });
  void hToCss; void vToCss;
  return '<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2px;width:100%;aspect-ratio:1/1;">' +
    cells.map(c => {
      const active = c.h === curH && c.v === curV;
      const dot = '<span style="width:6px;height:6px;border-radius:50%;background:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';"></span>';
      return '<button class="dm-icon-row-button" data-dm-children-align="' + c.h + '-' + c.v + '" data-active="' + (active ? 'true' : 'false') + '" title="Align children: ' + c.v + ' / ' + c.h + '" style="padding:0;display:flex;align-items:center;justify-content:center;">' + dot + '</button>';
    }).join('') +
    '</div>';
}

// clip-path structured representation. CSS supports several shape
// functions; we model them so the visual editor can rebuild the value
// from typed fields without forcing the user to write CSS by hand.
type ClipPathDef =
  | { kind: 'none' }
  | { kind: 'inset'; top: string; right: string; bottom: string; left: string }
  | { kind: 'circle'; r: string; x: string; y: string }
  | { kind: 'ellipse'; rx: string; ry: string; x: string; y: string }
  | { kind: 'polygon'; points: string }
  | { kind: 'path'; d: string }
  | { kind: 'url'; target: string }
  | { kind: 'custom'; raw: string };

function parseClipPath(raw: string): ClipPathDef {
  const v = (raw || 'none').trim();
  if (!v || v === 'none') return { kind: 'none' };
  let m;
  if ((m = v.match(/^inset\(([^)]*)\)\s*$/i))) {
    const parts = m[1].trim().split(/\s+/);
    const t = parts[0] || '0';
    const r = parts[1] || t;
    const b = parts[2] || t;
    const l = parts[3] || r;
    return { kind: 'inset', top: t, right: r, bottom: b, left: l };
  }
  if ((m = v.match(/^circle\(([^)]*)\)\s*$/i))) {
    const inner = m[1].trim();
    const at = inner.match(/^(.+?)\s+at\s+(.+)$/i);
    const r = at ? at[1].trim() : (inner || '50%');
    const center = (at ? at[2].trim() : '50% 50%').split(/\s+/);
    return { kind: 'circle', r, x: center[0] || '50%', y: center[1] || '50%' };
  }
  if ((m = v.match(/^ellipse\(([^)]*)\)\s*$/i))) {
    const inner = m[1].trim();
    const at = inner.match(/^(.+?)\s+at\s+(.+)$/i);
    const radii = (at ? at[1].trim() : inner).split(/\s+/);
    const center = (at ? at[2].trim() : '50% 50%').split(/\s+/);
    return {
      kind: 'ellipse',
      rx: radii[0] || '50%',
      ry: radii[1] || radii[0] || '50%',
      x: center[0] || '50%',
      y: center[1] || '50%',
    };
  }
  if ((m = v.match(/^polygon\(([^)]*)\)\s*$/i))) {
    return { kind: 'polygon', points: m[1].trim() };
  }
  if ((m = v.match(/^path\(\s*['"]?(.+?)['"]?\s*\)\s*$/i))) {
    return { kind: 'path', d: m[1] };
  }
  if ((m = v.match(/^url\(\s*['"]?#?(.+?)['"]?\s*\)\s*$/i))) {
    return { kind: 'url', target: m[1] };
  }
  return { kind: 'custom', raw: v };
}

function serializeClipPath(cp: ClipPathDef): string {
  switch (cp.kind) {
    case 'none': return 'none';
    case 'inset': return `inset(${cp.top} ${cp.right} ${cp.bottom} ${cp.left})`;
    case 'circle': return `circle(${cp.r} at ${cp.x} ${cp.y})`;
    case 'ellipse': return `ellipse(${cp.rx} ${cp.ry} at ${cp.x} ${cp.y})`;
    case 'polygon': return cp.points.trim() ? `polygon(${cp.points})` : 'none';
    case 'path': return cp.d ? `path('${cp.d}')` : 'none';
    case 'url': return cp.target ? `url(#${cp.target.replace(/^#/, '')})` : 'none';
    case 'custom': return cp.raw;
  }
}

function defaultClipPathFor(kind: ClipPathDef['kind']): ClipPathDef {
  switch (kind) {
    case 'inset': return { kind: 'inset', top: '0', right: '0', bottom: '0', left: '0' };
    case 'circle': return { kind: 'circle', r: '50%', x: '50%', y: '50%' };
    case 'ellipse': return { kind: 'ellipse', rx: '50%', ry: '50%', x: '50%', y: '50%' };
    case 'polygon': return { kind: 'polygon', points: '50% 0%, 100% 50%, 50% 100%, 0% 50%' };
    case 'path': return { kind: 'path', d: 'M 0 0 H 100 V 100 H 0 Z' };
    case 'url': return { kind: 'url', target: 'mask' };
    case 'custom': return { kind: 'custom', raw: 'none' };
    case 'none': default: return { kind: 'none' };
  }
}

// Parse a border-*-radius value into its X and Y components. CSS allows
// a single length (circular: X = Y) or two lengths (elliptical: X then Y).
function parseRadiusXY(val: string): [string, string] {
  const parts = (val || '0px').trim().split(/\s+/);
  const x = parts[0] || '0px';
  const y = parts[1] || x;
  return [x, y];
}

function cornerRadiusGrid(s: Record<string, string>, isExpanded: boolean, _isLinked: boolean): string {
  const tl = s.borderTopLeftRadius || '0px';
  const tr = s.borderTopRightRadius || '0px';
  const bl = s.borderBottomLeftRadius || '0px';
  const br = s.borderBottomRightRadius || '0px';
  const allEqual = tl === tr && tr === bl && bl === br;
  const primaryDisplay = allEqual ? tl : 'Mixed';
  // Title row: label + primary input + scan toggle.
  const scanBtn = '<button class="dm-section-action" data-dm-corner-expand title="' +
    (isExpanded ? 'Collapse corners' : 'Edit each corner separately') +
    '" data-active="' + (isExpanded ? 'true' : 'false') + '" style="flex-shrink:0;align-self:flex-end;margin-bottom:6px;">' +
    icon('scan', 12) + '</button>';
  const titleRow = '<div style="display:flex;align-items:flex-end;gap:6px;">' +
    '<div style="flex:1;">' + inp('Corner radius', 'borderRadius', primaryDisplay) + '</div>' +
    scanBtn +
    '</div>';
  if (!isExpanded) return titleRow;
  // Expanded: 2×2 of corners. Each corner cell carries the corner glyph + an
  // X (horizontal) input and a Y (vertical) input — together they map to the
  // CSS form `border-*-radius: X Y` (elliptical when X !== Y, circular when
  // they match). Virtual __corner_*_x / _y props splice into the current
  // value so editing one axis doesn't clobber the other.
  const cornerCell = (glyph: string, key: 'tl'|'tr'|'bl'|'br', val: string): string => {
    const [x, y] = parseRadiusXY(val);
    return '<div style="display:flex;align-items:center;gap:4px;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:4px 6px;">' +
      '<span style="font-family:SF Mono,Monaco,monospace;font-size:11px;color:var(--dm-text-muted);width:14px;flex-shrink:0;text-align:center;">' + glyph + '</span>' +
      '<input class="dm-input" data-dm-prop="__corner_' + key + '_x" value="' + escapeAttr(x) + '" placeholder="X" title="Horizontal radius" aria-label="' + key + ' horizontal radius" style="background:none;border:none;padding:2px;flex:1;min-width:0;font-size:11px;"/>' +
      '<span style="font-size:10px;color:var(--dm-text-dim);flex-shrink:0;">/</span>' +
      '<input class="dm-input" data-dm-prop="__corner_' + key + '_y" value="' + escapeAttr(y) + '" placeholder="Y" title="Vertical radius" aria-label="' + key + ' vertical radius" style="background:none;border:none;padding:2px;flex:1;min-width:0;font-size:11px;"/>' +
    '</div>';
  };
  return titleRow +
    '<div class="dm-corner-grid" style="margin-top:6px;">' +
      cornerCell('┌', 'tl', tl) +
      cornerCell('┐', 'tr', tr) +
      cornerCell('└', 'bl', bl) +
      cornerCell('┘', 'br', br) +
    '</div>';
}

function inferStrokePosition(s: Record<string, string>): 'inside' | 'outside' | 'center' {
  const ol = (s.outlineStyle || '').trim();
  const off = parseFloat(s.outlineOffset || '0') || 0;
  if (ol && ol !== 'none' && off < 0) return 'center';
  // Browsers normalize box-shadow computed values to color-first format
  // (`rgb(0,0,0) 0px 0px 0px 1px inset`), so a regex on input format alone
  // misses the inset stroke. Use the unified parser. Match 0-spread inset
  // entries too so a user-set 0px weight preserves Inside mode state.
  const entries = parseCssCommaList(s.boxShadow || '');
  for (const e of entries) {
    const p = parseShadowEntry(e);
    if (p && p.inset && p.x === 0 && p.y === 0 && p.blur === 0 && p.spread >= 0) {
      return 'inside';
    }
  }
  return 'outside';
}

function strokePositionRow(_s: Record<string, string>, current: 'inside' | 'outside' | 'center'): string {
  return segmentedRow([
    { label: 'Inside', attr: 'data-dm-stroke-pos="inside"', active: current === 'inside', title: 'Stroke inside (inset shadow)' },
    { label: 'Outside', attr: 'data-dm-stroke-pos="outside"', active: current === 'outside', title: 'Stroke outside (border)' },
    { label: 'Center', attr: 'data-dm-stroke-pos="center"', active: current === 'center', title: 'Stroke centered (outline + offset)' },
  ]);
}

function sidesPopoverTrigger(s: Record<string, string>, isOpen: boolean): string {
  const trigger = '<button class="dm-section-action" data-dm-sides-popover title="Side selection" data-active="' + (isOpen ? 'true' : 'false') + '">' +
    icon('sliders', 11) + '</button>';
  if (!isOpen) return '<div style="position:relative;display:inline-flex;">' + trigger + '</div>';
  const bt = parseFloat(s.borderTopWidth || '0') || 0;
  const br = parseFloat(s.borderRightWidth || '0') || 0;
  const bb = parseFloat(s.borderBottomWidth || '0') || 0;
  const bl = parseFloat(s.borderLeftWidth || '0') || 0;
  const allEqual = bt === br && br === bb && bb === bl && bt > 0;
  const items: PopoverItem[] = [
    { icon: 'squareDashed', label: 'All', attr: 'data-dm-side="all"', active: allEqual },
    { icon: 'arrowUp', label: 'Top', attr: 'data-dm-side="top"', active: bt > 0 && !allEqual },
    { icon: 'arrowDown', label: 'Bottom', attr: 'data-dm-side="bottom"', active: bb > 0 && !allEqual },
    { icon: 'chevronLeft', label: 'Left', attr: 'data-dm-side="left"', active: bl > 0 && !allEqual },
    { icon: 'chevronRight', label: 'Right', attr: 'data-dm-side="right"', active: br > 0 && !allEqual },
    { divider: true, label: '', attr: '' },
    { icon: 'sliders', label: 'Custom', attr: 'data-dm-side="custom"', active: !allEqual && (bt > 0 || br > 0 || bb > 0 || bl > 0) },
  ];
  return '<div style="position:relative;display:inline-flex;">' + trigger + popover(items) + '</div>';
}

function effectsAddMenuTrigger(isOpen: boolean): string {
  const trigger = '<button class="dm-section-action" data-dm-effects-menu title="Add effect" data-active="' + (isOpen ? 'true' : 'false') + '">' +
    icon('plus', 12) + '</button>';
  if (!isOpen) return '<div style="position:relative;display:inline-flex;">' + trigger + '</div>';
  const items: PopoverItem[] = [
    { icon: 'sparkles', label: 'Drop shadow', attr: 'data-dm-add-effect="drop-shadow"' },
    { icon: 'squareStack', label: 'Inner shadow', attr: 'data-dm-add-effect="inner-shadow"' },
    { icon: 'type', label: 'Text shadow', attr: 'data-dm-add-effect="text-shadow"' },
    { icon: 'sparkles', label: 'Filter drop-shadow', attr: 'data-dm-add-effect="filter-drop-shadow"' },
    { icon: 'eye', label: 'Layer blur', attr: 'data-dm-add-effect="layer-blur"' },
    { icon: 'panelRight', label: 'Background blur', attr: 'data-dm-add-effect="backdrop-blur"' },
    { divider: true, label: '', attr: '' },
    // Composed presets — multi-property recipes the user can apply with
    // one click. Each writes a small bundle of CSS.
    { icon: 'sparkles', label: 'Preset · Soft drop', attr: 'data-dm-add-effect="preset-soft-drop"' },
    { icon: 'sparkles', label: 'Preset · Hard drop', attr: 'data-dm-add-effect="preset-hard-drop"' },
    { icon: 'sparkles', label: 'Preset · Layered drop', attr: 'data-dm-add-effect="preset-layered-drop"' },
    { icon: 'sparkles', label: 'Preset · Glow', attr: 'data-dm-add-effect="preset-glow"' },
    { icon: 'sparkles', label: 'Preset · Embossed', attr: 'data-dm-add-effect="preset-embossed"' },
    { icon: 'sparkles', label: 'Preset · Frosted glass', attr: 'data-dm-add-effect="preset-frosted-glass"' },
    { icon: 'sparkles', label: 'Preset · Neon text', attr: 'data-dm-add-effect="preset-neon-text"' },
    { divider: true, label: '', attr: '' },
    { icon: 'play', label: 'Transition', attr: 'data-dm-add-effect="transition"' },
    { icon: 'activity', label: 'Animation', attr: 'data-dm-add-effect="animation"' },
    { icon: 'move', label: 'Transform', attr: 'data-dm-add-effect="transform"' },
    { icon: 'compass', label: 'Motion path', attr: 'data-dm-add-effect="motion-path"' },
    { icon: 'shuffle', label: 'View transition', attr: 'data-dm-add-effect="view-transition"' },
    { icon: 'arrowUpDown', label: 'Scroll-driven animation', attr: 'data-dm-add-effect="scroll-driven"' },
  ];
  return '<div style="position:relative;display:inline-flex;">' + trigger + popover(items) + '</div>';
}

function advancedDisclosure(key: string, isOpen: boolean, content: string): string {
  if (!isOpen) return '';
  return '<div data-dm-advanced-body="' + escapeAttr(key) + '" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--dm-separator);">' + content + '</div>';
}

function advancedToggleBtn(key: string, isOpen: boolean): string {
  return '<button class="dm-section-action dm-advanced-toggle" data-dm-advanced-toggle="' + escapeAttr(key) + '" data-open="' + (isOpen ? 'true' : 'false') + '" title="' +
    (isOpen ? 'Hide advanced' : 'Show advanced') + '">' + icon('sliders', 11) + '</button>';
}

function eyeToggleBtn(attr: string, isOff: boolean, title: string): string {
  return '<button class="dm-section-action" ' + attr + ' data-active="' + (isOff ? 'false' : 'true') + '" title="' + escapeAttr(title) + '">' +
    icon(isOff ? 'eyeOff' : 'eye', 12) + '</button>';
}

function plusActionBtn(attr: string, title: string): string {
  return '<button class="dm-section-action" ' + attr + ' title="' + escapeAttr(title) + '">' + icon('plus', 12) + '</button>';
}

void strokeStylePopoverOpen; void plusActionBtn; void eyeToggleBtn; void advancedDisclosure;
void advancedToggleBtn; void cornerRadiusGrid; void strokePositionRow; void sidesPopoverTrigger;
void effectsAddMenuTrigger; void inferStrokePosition; void layoutModeRow; void positionAlignGrid;
void flipButtons; void detectParentContext;

/* ── Layered-list helpers (Fill / Stroke / Effects) ──
   CSS comma-separated lists with paren-balanced respect. Used by every
   layered editor below. */
function parseCssCommaList(input: string): string[] {
  if (!input || input === 'none' || input === 'normal') return [];
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Fill layers — top of array paints on TOP (CSS comma-list order). The
// solid (bgColorOnly) sits at the bottom of the array since
// `background-color` always paints under the `background-image` stack.
type FillLayerKind = 'solid' | 'linear' | 'radial' | 'conic' | 'image';
type FillLayer = {
  kind: FillLayerKind;
  raw: string;             // for solid: color; otherwise the full CSS entry for background-image
  bgColorOnly?: boolean;   // true for the solid layer
  visible: boolean;        // when false, the layer is dropped from CSS but kept in our state
  // Per-layer comma-positional background-* properties. Default to undefined
  // so the serializer can omit slots and let CSS use the default.
  size?: string;
  repeat?: string;
  position?: string;
  blendMode?: string;
};

// Per-element fill state. Once an element's layers are mutated through the
// panel, this map becomes the source of truth (we no longer reparse from
// computed styles for that element). Re-seeded on first edit; survives
// across selections so hidden layers don't get lost.
const fillLayersByElement = new Map<string, FillLayer[]>();

function parseFillLayers(s: Record<string, string>): FillLayer[] {
  // Per-property comma lists, aligned to background-image entries by index.
  const sizes = parseCssCommaList(s.backgroundSize || '');
  const repeats = parseCssCommaList(s.backgroundRepeat || '');
  const positions = parseCssCommaList(s.backgroundPosition || '');
  const blends = parseCssCommaList((s as any).backgroundBlendMode || '');

  const layers: FillLayer[] = [];
  const bgImg = s.backgroundImage || 'none';
  let i = 0;
  for (const v of parseCssCommaList(bgImg)) {
    let kind: FillLayerKind = 'image';
    if (/^(linear|repeating-linear)-gradient/.test(v)) kind = 'linear';
    else if (/^(radial|repeating-radial)-gradient/.test(v)) kind = 'radial';
    else if (/^(conic|repeating-conic)-gradient/.test(v)) kind = 'conic';
    else if (v.startsWith('url(')) kind = 'image';
    else { i++; continue; } // unknown — skip
    layers.push({
      kind,
      raw: v,
      visible: true,
      size: sizes[i],
      repeat: repeats[i],
      position: positions[i],
      blendMode: blends[i],
    });
    i++;
  }
  // Solid — append at bottom of our list (paints under image stack).
  const bgColor = (s.backgroundColor || 'transparent').replace(/\s+/g, '');
  if (bgColor && bgColor !== 'rgba(0,0,0,0)' && bgColor !== 'transparent') {
    layers.push({
      kind: 'solid',
      raw: s.backgroundColor || 'transparent',
      bgColorOnly: true,
      visible: true,
    });
  }
  return layers;
}

// Serialize the full fill state into the four comma-positional CSS
// properties. Hidden layers are skipped (preserved in state but not in CSS).
function serializeFillLayers(layers: FillLayer[]): {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundPosition: string;
  backgroundBlendMode: string;
} {
  const visible = layers.filter(l => l.visible !== false);
  const solid = visible.find(l => l.bgColorOnly);
  const imageLayers = visible.filter(l => !l.bgColorOnly);
  const sizes = imageLayers.map(l => l.size || 'auto');
  const repeats = imageLayers.map(l => l.repeat || 'repeat');
  const positions = imageLayers.map(l => l.position || '0% 0%');
  const blends = imageLayers.map(l => l.blendMode || 'normal');
  const allDefault = (arr: string[], def: string) => arr.every(v => v === def);
  return {
    backgroundColor: solid ? solid.raw : 'transparent',
    backgroundImage: imageLayers.length ? imageLayers.map(l => l.raw).join(', ') : 'none',
    backgroundSize: imageLayers.length && !allDefault(sizes, 'auto') ? sizes.join(', ') : 'auto',
    backgroundRepeat: imageLayers.length && !allDefault(repeats, 'repeat') ? repeats.join(', ') : 'repeat',
    backgroundPosition: imageLayers.length && !allDefault(positions, '0% 0%') ? positions.join(', ') : '0% 0%',
    backgroundBlendMode: imageLayers.length && !allDefault(blends, 'normal') ? blends.join(', ') : 'normal',
  };
}

// Get-or-create the per-element layer state. Once an element has been edited
// through the panel, this is authoritative; otherwise parse fresh from CSS.
function getFillLayers(id: string, s: Record<string, string>): FillLayer[] {
  const existing = fillLayersByElement.get(id);
  if (existing) return existing;
  const fresh = parseFillLayers(s);
  fillLayersByElement.set(id, fresh);
  return fresh;
}

// After a mutation, dispatch the four CSS properties at once.
function dispatchFillLayers(layers: FillLayer[], applyStyle: (p: string, v: string) => void): void {
  const css = serializeFillLayers(layers);
  applyStyle('backgroundColor', css.backgroundColor);
  applyStyle('backgroundImage', css.backgroundImage);
  applyStyle('backgroundSize', css.backgroundSize);
  applyStyle('backgroundRepeat', css.backgroundRepeat);
  applyStyle('backgroundPosition', css.backgroundPosition);
  applyStyle('backgroundBlendMode', css.backgroundBlendMode);
}

// Gradient stop parsing — split the function args, peel off the angle/shape
// prefix, and parse remaining tokens as stops. Forgiving: any token without
// a recognisable position becomes a stop with empty position.
type GradientStop = { color: string; position: string };
function parseGradientStops(raw: string): { prefix: string; stops: GradientStop[] } {
  const m = raw.match(/^[a-z-]+\((.*)\)\s*$/i);
  if (!m) return { prefix: '', stops: [] };
  const parts = parseCssCommaList(m[1]);
  let prefix = '';
  let stopParts = parts;
  // First part is config (no leading color token) when it looks like an angle / shape / from-clause
  const first = (parts[0] || '').trim();
  const looksLikeConfig = /^(\d|to\b|from\b|circle|ellipse|at\b|farthest|closest|-?\d*\.?\d+(deg|turn|grad|rad)\b)/i.test(first)
    && !/^(rgb|rgba|hsl|hsla|#|var|currentcolor|transparent)/i.test(first);
  if (looksLikeConfig) {
    prefix = first;
    stopParts = parts.slice(1);
  }
  const stops: GradientStop[] = stopParts.map(p => {
    const t = p.trim();
    // Strip a trailing length/percentage token from the end
    const posMatch = t.match(/^(.+?)\s+(-?\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh|vmin|vmax|fr|deg|turn|grad|rad)?)\s*$/);
    if (posMatch) return { color: posMatch[1].trim(), position: posMatch[2] };
    return { color: t, position: '' };
  });
  return { prefix, stops };
}

function buildGradient(kind: 'linear' | 'radial' | 'conic', prefix: string, stops: GradientStop[]): string {
  const stopStr = stops.map(s => s.color + (s.position ? ' ' + s.position : '')).join(', ');
  const def = kind === 'linear' ? '180deg' : kind === 'radial' ? 'circle' : 'from 0deg';
  const head = prefix.trim() || def;
  return kind + '-gradient(' + head + ', ' + stopStr + ')';
}

// Build a single fill row using the existing layeredRow head, plus a
// draggable wrapper so the user can reorder via HTML5 drag-and-drop.
function renderFillRow(layer: FillLayer, idx: number, swatch: string, label: string, expanded: boolean, body: string): string {
  const inner = layeredRow({
    idx,
    prefix: 'fill',
    swatch,
    label,
    visible: layer.visible !== false,
    expanded,
    body,
  });
  // The wrapper carries `draggable` + the row index. Drop targets are the
  // same wrappers — handled by global dragover/drop listeners.
  return '<div data-dm-fill-row="' + idx + '" draggable="true">' + inner + '</div>';
}

// Per-layer expanded body. Gradients get a visual stop list. Solids get a
// colour picker (writes to virtual __fill_color__N). Images get a URL
// input. All non-solid layers get the per-layer size / repeat / position /
// blend selects beneath the type-specific editor.
// Parse a `background-position` value (1 or 2 tokens) into "X Y". Maps the
// CSS keywords (`left`, `center`, `right`, `top`, `bottom`) to their
// percentage equivalents so the 9-cell pad can match against canonical
// "<x>% <y>%" cell values.
function normalizePosition(raw: string): string {
  const map: Record<string, string> = {
    'left': '0%', 'center': '50%', 'right': '100%',
    'top': '0%', 'bottom': '100%',
  };
  const parts = (raw || '0% 0%').trim().split(/\s+/).map(t => map[t.toLowerCase()] ?? t);
  const x = parts[0] || '0%';
  // CSS: when only one value is given, the other defaults to `center`.
  const y = parts[1] || (parts.length === 1 ? '50%' : '0%');
  return x + ' ' + y;
}

// 9-cell position pad — replaces the 3×3 keyword select with a visual
// grid of buttons. Each cell carries the `X% Y%` it writes.
function fillPositionPad(idx: number, value: string): string {
  const norm = normalizePosition(value);
  const cells: Array<{ pos: string; glyph: string; title: string }> = [
    { pos: '0% 0%',     glyph: '↖', title: 'Top-left' },
    { pos: '50% 0%',    glyph: '↑', title: 'Top' },
    { pos: '100% 0%',   glyph: '↗', title: 'Top-right' },
    { pos: '0% 50%',    glyph: '←', title: 'Left' },
    { pos: '50% 50%',   glyph: '·', title: 'Center' },
    { pos: '100% 50%',  glyph: '→', title: 'Right' },
    { pos: '0% 100%',   glyph: '↙', title: 'Bottom-left' },
    { pos: '50% 100%',  glyph: '↓', title: 'Bottom' },
    { pos: '100% 100%', glyph: '↘', title: 'Bottom-right' },
  ];
  const cellHtml = cells.map(c => {
    const active = c.pos === norm;
    return '<button data-dm-fill-pos-cell="' + c.pos + '" data-dm-fill-pos-idx="' + idx + '" data-active="' + (active ? 'true' : 'false') + '" title="' + c.title + ' (' + c.pos + ')" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'transparent') + ';color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-muted)') + ';border-radius:3px;cursor:pointer;font-size:11px;padding:0;">' + c.glyph + '</button>';
  }).join('');
  return '<div style="display:flex;flex-direction:column;gap:3px;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Position</label>' +
    '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:2px;border:1px solid var(--dm-input-border);border-radius:4px;padding:2px;background:var(--dm-input-bg);">' +
    cellHtml +
    '</div>' +
    '</div>';
}

// Image fit mode segmented row — Fill / Fit / Crop / Tile. Each writes a
// {size, repeat} pair atomically, mapping to Figma's image fit modes.
function fillFitRow(idx: number, layer: FillLayer): string {
  const size = (layer.size || 'auto').toLowerCase();
  const repeat = (layer.repeat || 'repeat').toLowerCase();
  const isFill = size === 'cover' && repeat === 'no-repeat';
  const isFit = size === 'contain' && repeat === 'no-repeat';
  const isCrop = size === '100% 100%' && repeat === 'no-repeat';
  const isTile = repeat === 'repeat' || repeat === 'space' || repeat === 'round';
  const btn = (mode: string, lbl: string, active: boolean, title: string): string =>
    '<button class="dm-icon-row-button" data-dm-fill-fit-mode="' + mode + '" data-dm-fill-fit-idx="' + idx + '" data-active="' + (active ? 'true' : 'false') + '" title="' + escapeAttr(title) + '" style="flex:1;height:30px;font-size:11px;font-weight:500;">' + lbl + '</button>';
  return '<div style="display:flex;gap:6px;">' +
    btn('fill', 'Fill', isFill, 'Cover the box; crop overflow (background-size: cover)') +
    btn('fit',  'Fit',  isFit,  'Fit inside the box; preserve aspect (background-size: contain)') +
    btn('crop', 'Crop', isCrop, 'Stretch to exact box dimensions (background-size: 100% 100%)') +
    btn('tile', 'Tile', isTile, 'Repeat at native size (background-repeat: repeat)') +
  '</div>';
}

function renderFillLayerBody(layer: FillLayer, idx: number): string {
  const sizeOpts = ['auto','cover','contain','100% 100%','50% 50%'];
  const repeatOpts = ['repeat','no-repeat','repeat-x','repeat-y','space','round'];
  const blendOpts = ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'];

  let head = '';
  if (layer.kind === 'solid') {
    head = colorInp('Color', '__fill_color__' + idx, layer.raw);
  } else if (layer.kind === 'image') {
    head = inp('URL', '__fill_url__' + idx, (layer.raw.match(/url\((['"]?)([^'")]+)\1\)/) || ['','',layer.raw])[2], '');
  } else {
    // gradient (linear / radial / conic) — visual stop editor
    const parsed = parseGradientStops(layer.raw);
    const prefixLabel = layer.kind === 'linear' ? 'Angle' : layer.kind === 'radial' ? 'Shape' : 'From';
    const prefixDef = layer.kind === 'linear' ? '180deg' : layer.kind === 'radial' ? 'circle' : 'from 0deg';
    const stopRows = parsed.stops.map((stop, sIdx) => {
      return '<div style="display:grid;grid-template-columns:1fr 80px 28px;gap:6px;align-items:end;">' +
        colorInp('Stop ' + (sIdx + 1), '__fill_stop_color__' + idx + '_' + sIdx, stop.color || '#000000') +
        inp('Pos', '__fill_stop_pos__' + idx + '_' + sIdx, stop.position || '', '') +
        '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">_</label>' +
        '<button class="dm-section-action" data-dm-fill-stop-remove="' + idx + '_' + sIdx + '" title="Remove stop" style="width:100%;height:28px;color:var(--dm-danger);">' + icon('trash', 11) + '</button>' +
        '</div></div>';
    }).join('<div style="height:4px;"></div>');
    const addStopBtn = '<button class="dm-btn" data-dm-fill-stop-add="' + idx + '" style="width:100%;padding:6px;font-size:11px;display:flex;align-items:center;gap:4px;justify-content:center;">' + icon('plus', 11) + ' Add stop</button>';
    head =
      grid12([
        { span: 12, content: inp(prefixLabel, '__fill_grad_prefix__' + idx, parsed.prefix || prefixDef, '') },
      ]) + sp() +
      sub('Stops') +
      stopRows + sp() +
      addStopBtn;
  }
  // Per-layer comma-positional properties — only meaningful for non-solid layers.
  const perLayer = layer.kind === 'solid' ? '' :
    sp() +
    // 4-mode segmented (image only). Atomically writes {size, repeat} pairs.
    (layer.kind === 'image' ? fillFitRow(idx, layer) + sp() : '') +
    grid12([
      { span: 6, content: sel('Size', '__fill_size__' + idx, layer.size || 'auto', sizeOpts) },
      { span: 6, content: sel('Repeat', '__fill_repeat__' + idx, layer.repeat || 'repeat', repeatOpts) },
    ]) + sp() +
    grid12([
      { span: 6, content: fillPositionPad(idx, layer.position || '0% 0%') },
      { span: 6, content: sel('Blend', '__fill_blend__' + idx, layer.blendMode || 'normal', blendOpts) },
    ]);
  return head + perLayer;
}

type StrokeLayer = { weight: number; color: string; visible?: boolean };

// Corner-aware dashed-stroke SVG generator. Returns a `url("data:...")`
// suitable for `border-image-source`, plus the `slice` value to use with
// `border-image-slice` so the 9-region split lands cleanly.
//
// How it works:
//   • SVG canvas is `(weight + tile + weight)` square, where `tile = dash + gap`.
//   • Four single-tile-long lines are drawn — one per side, each oriented
//     correctly (horizontal on top/bottom, vertical on left/right) so the
//     border-image slicer maps each edge region to the right pattern.
//   • The corner regions (`weight × weight`) are left transparent so dashes
//     stop short of the actual box corners.
//   • Pair with `border-image-repeat: round` so the browser tiles each
//     middle region with a whole number of dashes (auto-aligning at corners).
//
// The SVG does NOT depend on the element's box dimensions — `round` handles
// scaling per side, so the same source works for any sized element.
function buildCornerAwareDashSvg(opts: {
  weight: number;
  dash: number;
  gap: number;
  cap: 'square' | 'round';
  color: string;
}): { dataUri: string; slice: number } {
  const w = Math.max(0.5, opts.weight);
  const dash = Math.max(1, opts.dash);
  const gap = Math.max(1, opts.gap);
  const tile = dash + gap;
  const corner = w;
  const span = corner + tile + corner;
  const stroke = `stroke="${opts.color}" stroke-width="${w}" stroke-dasharray="${dash} ${gap}" stroke-linecap="${opts.cap}" fill="none"`;
  const top    = `<line x1="${corner}" y1="${w/2}" x2="${corner + tile}" y2="${w/2}" ${stroke}/>`;
  const right  = `<line x1="${span - w/2}" y1="${corner}" x2="${span - w/2}" y2="${corner + tile}" ${stroke}/>`;
  const bottom = `<line x1="${corner}" y1="${span - w/2}" x2="${corner + tile}" y2="${span - w/2}" ${stroke}/>`;
  const left   = `<line x1="${w/2}" y1="${corner}" x2="${w/2}" y2="${corner + tile}" ${stroke}/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${span}" height="${span}" viewBox="0 0 ${span} ${span}">` +
    top + right + bottom + left +
    `</svg>`;
  return {
    dataUri: 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")',
    slice: corner,
  };
}

// Per-element multi-stroke state. Once a 2nd stroke is added (or the user
// otherwise mutates layers through the panel) this map becomes the source
// of truth for that element. The dispatcher knows when to fall back to the
// single-stroke `border-*` path (1 layer, Outside) vs. the chained
// `box-shadow` path (multi-stroke). `activeStrokeIdx` and the previously
// declared `expandedStrokeIdx` (top of file) live elsewhere.
const strokeLayersByElement = new Map<string, StrokeLayer[]>();
let activeStrokeIdx = 0;

// Parse a single box-shadow entry into structured form. Browsers normalize
// computed values to color-first format (`rgb(0,0,0) 0px 0px 0px 1px [inset]`)
// while authored CSS is usually `[inset] 0 0 0 1px <color>`. We accept both.
function parseShadowEntry(e: string): { x: number; y: number; blur: number; spread: number; color: string; inset: boolean } | null {
  const trimmed = e.trim();
  if (!trimmed) return null;
  const insetStart = /^inset\b/i.test(trimmed);
  const insetEnd = /\binset$/i.test(trimmed);
  const inset = insetStart || insetEnd;
  const core = trimmed.replace(/^inset\s+/i, '').replace(/\s+inset$/i, '').trim();
  const colorRe = '(rgba?\\([^)]+\\)|hsla?\\([^)]+\\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)';
  // Color first: <color> <x> <y> <blur> <spread>
  let m = core.match(new RegExp('^' + colorRe + '\\s+(.+)$'));
  if (m) {
    const color = m[1];
    const nums = m[2].split(/\s+/).map(p => parseFloat(p)).filter(n => !isNaN(n));
    if (nums.length >= 2) {
      const [x = 0, y = 0, blur = 0, spread = 0] = nums;
      return { x, y, blur, spread, color, inset };
    }
  }
  // Color last: <x> <y> <blur> <spread> <color>
  m = core.match(new RegExp('^(.+?)\\s+' + colorRe + '$'));
  if (m) {
    const color = m[2];
    const nums = m[1].split(/\s+/).map(p => parseFloat(p)).filter(n => !isNaN(n));
    if (nums.length >= 2) {
      const [x = 0, y = 0, blur = 0, spread = 0] = nums;
      return { x, y, blur, spread, color, inset };
    }
  }
  return null;
}

// A stroke entry is a box-shadow with x=y=blur=0 and spread>0 (`0 0 0 Npx`).
function shadowEntryIsStroke(e: string): boolean {
  const p = parseShadowEntry(e);
  return !!p && p.x === 0 && p.y === 0 && p.blur === 0 && p.spread > 0;
}

// Stroke layers live in box-shadow as `[inset?] 0 0 0 Npx <color>` entries,
// matching Figma's mental model: Outside → no inset, Inside → inset. Center
// is outline-only (single stroke). Other unrelated box-shadows in the chain
// (drop shadows etc.) are preserved untouched on serialize.
function parseStrokeLayers(s: Record<string, string>, position: 'inside' | 'outside' | 'center'): StrokeLayer[] {
  if (position === 'center') {
    const w = parseFloat(s.outlineWidth || '0') || 0;
    return w > 0 ? [{ weight: w, color: s.outlineColor || '#000' }] : [];
  }
  const entries = parseCssCommaList(s.boxShadow || '');
  const wantInset = position === 'inside';
  const out: StrokeLayer[] = [];
  for (const e of entries) {
    const p = parseShadowEntry(e);
    if (!p) continue;
    if (p.inset !== wantInset) continue;
    if (p.x !== 0 || p.y !== 0 || p.blur !== 0 || p.spread < 0) continue;
    out.push({ weight: p.spread, color: p.color });
  }
  return out;
}

function serializeStrokeLayers(layers: StrokeLayer[], position: 'inside' | 'outside' | 'center', existingShadow: string): string {
  if (position === 'center') return existingShadow || 'none';
  const entries = parseCssCommaList(existingShadow);
  const wantInset = position === 'inside';
  // Preserve non-stroke shadows in the chain (drop shadows, custom shadows).
  const preserved = entries.filter(e => {
    const p = parseShadowEntry(e);
    if (!p) return true;
    if (p.inset !== wantInset) return true;     // different mode → preserve
    return !(p.x === 0 && p.y === 0 && p.blur === 0 && p.spread > 0);
  });
  const visible = layers.filter(l => l.visible !== false);
  const newEntries = visible.map(l => {
    const prefix = position === 'inside' ? 'inset ' : '';
    return prefix + '0 0 0 ' + l.weight + 'px ' + l.color;
  });
  const all = [...newEntries, ...preserved];
  return all.length ? all.join(', ') : 'none';
}

// Get-or-seed the per-element stroke-layer state. If the map is empty for
// this element, parse from CSS. For Outside mode where strokes live in
// `border-*-width/-color` (not box-shadow), synthesise a single primary
// layer so the layered-list UI shows the existing stroke.
function getStrokeLayers(id: string, s: Record<string, string>, position: 'inside' | 'outside' | 'center'): StrokeLayer[] {
  const cached = strokeLayersByElement.get(id);
  if (cached) return cached;
  let layers = parseStrokeLayers(s, position);
  if (layers.length === 0 && position === 'outside') {
    // Outside single-stroke stored in border-*; synthesise a primary layer.
    const w = parseFloat(s.borderTopWidth || '0') || 0;
    if (w > 0) layers = [{ weight: w, color: s.borderTopColor || '#000000', visible: true }];
  }
  layers = layers.map(l => ({ ...l, visible: l.visible !== false }));
  strokeLayersByElement.set(id, layers);
  return layers;
}

// Dispatch the layered model to CSS. Three position cases × single/multi:
//   Inside  → always box-shadow chain (existing).
//   Outside × 1 layer → border-*-width / -color / -style (preserves per-side).
//   Outside × 2+      → box-shadow chain; clear border-*-width to 0 so the
//                        chain is the only visible stroke.
//   Center  → outline-* (single only; UI prevents multi).
function dispatchStrokeLayers(
  layers: StrokeLayer[],
  position: 'inside' | 'outside' | 'center',
  s: Record<string, string>,
  applyStyleFn: (p: string, v: string) => void,
  styleKeyword: string,
): void {
  const visibleCount = layers.filter(l => l.visible !== false).length;
  if (position === 'center') {
    const layer = layers.find(l => l.visible !== false) || layers[0];
    if (!layer) return;
    applyStyleFn('outlineWidth', layer.weight + 'px');
    applyStyleFn('outlineColor', layer.color);
    applyStyleFn('outlineStyle', styleKeyword || 'solid');
    applyStyleFn('outlineOffset', (-Math.round(layer.weight / 2)) + 'px');
    return;
  }
  if (position === 'outside' && visibleCount <= 1 && layers.length === 1) {
    // Outside, single layer → border-* path. Clear any stroke-shaped
    // box-shadow entries we might have written previously.
    const layer = layers[0];
    if (!layer) return;
    const w = layer.visible !== false ? layer.weight : 0;
    ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].forEach(p => applyStyleFn(p, w + 'px'));
    ['borderTopColor','borderRightColor','borderBottomColor','borderLeftColor'].forEach(p => applyStyleFn(p, layer.color));
    if (styleKeyword) {
      ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'].forEach(p => applyStyleFn(p, styleKeyword));
    }
    // Strip any stroke-shaped non-inset entries from box-shadow.
    applyStyleFn('boxShadow', serializeStrokeLayers([], 'outside', s.boxShadow || ''));
    return;
  }
  // Inside (any count) OR Outside multi-stroke → box-shadow chain.
  const css = serializeStrokeLayers(layers, position, s.boxShadow || '');
  applyStyleFn('boxShadow', css);
  if (position === 'outside') {
    // Clear border-*-width so the chain is the visible stroke. Leave
    // border-*-color/-style alone so dropping back to single restores
    // them (we re-write them in the single-layer branch above).
    ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].forEach(p => applyStyleFn(p, '0px'));
  }
  // Inside: also reflect color/weight back to border-* so the existing
  // single-stroke readback (used by primary controls) stays in sync with
  // layer 0. Without this the primary Color picker reads the wrong value
  // after a multi-stroke edit.
  if (position === 'inside') {
    const top = layers[0];
    if (top) {
      ['borderTopColor','borderRightColor','borderBottomColor','borderLeftColor'].forEach(p => applyStyleFn(p, top.color));
    }
  }
}

// Reusable single-row renderer for a layered-list item. The trailing
// children slot is the per-layer body shown when the row is expanded.
function layeredRow(opts: {
  idx: number;
  prefix: string;        // 'fill' | 'stroke' | 'effect'
  swatch: string;        // HTML for the leading swatch / type icon
  label: string;         // primary value text (hex / url / gradient / 'Drop shadow')
  meta?: string;         // secondary text (e.g. '100%')
  visible: boolean;
  expanded: boolean;
  body?: string;         // expanded body
}): string {
  const headRow = '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:5px;">' +
    '<button class="dm-section-action" data-dm-' + opts.prefix + '-drag="' + opts.idx + '" title="Drag to reorder (use ↑/↓ buttons)" aria-label="Drag" style="cursor:grab;">' + icon('gripVertical', 12) + '</button>' +
    opts.swatch +
    '<span style="flex:1;min-width:0;font-size:11px;font-family:SF Mono,Monaco,monospace;color:var(--dm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(opts.label) + '</span>' +
    (opts.meta ? '<span style="font-size:10px;color:var(--dm-text-muted);">' + escapeAttr(opts.meta) + '</span>' : '') +
    '<button class="dm-section-action" data-dm-' + opts.prefix + '-toggle="' + opts.idx + '" title="' + (opts.visible ? 'Hide' : 'Show') + '" data-active="' + (opts.visible ? 'true' : 'false') + '">' + icon(opts.visible ? 'eye' : 'eyeOff', 12) + '</button>' +
    '<button class="dm-section-action" data-dm-' + opts.prefix + '-expand="' + opts.idx + '" title="' + (opts.expanded ? 'Collapse' : 'Settings') + '" data-active="' + (opts.expanded ? 'true' : 'false') + '">' + icon('slidersHorizontal', 12) + '</button>' +
    '<button class="dm-section-action" data-dm-' + opts.prefix + '-remove="' + opts.idx + '" title="Remove" style="color:var(--dm-danger);">' + icon('trash', 12) + '</button>' +
    '</div>';
  const bodyRow = (opts.expanded && opts.body)
    ? '<div style="margin:6px 0 10px 24px;padding:8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:5px;">' + opts.body + '</div>'
    : '';
  return '<div style="margin-bottom:6px;">' + headRow + bodyRow + '</div>';
}

/* ── v1.2: Box Shadow parser/builder ── */
function parseBoxShadowComputed(val: string): { inset: boolean; x: number; y: number; blur: number; spread: number; color: string; opacity: number } {
  const d = { inset: false, x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 12 };
  if (!val || val === 'none') return d;
  try {
    const inset = val.includes('inset');
    let color = '#000000'; let opacity = 12;
    const rgbaM = val.match(/rgba?\([\d\s,./]+\)/);
    if (rgbaM) {
      const nums = rgbaM[0].match(/[\d.]+/g) || [];
      const r = parseInt(nums[0])||0, g = parseInt(nums[1])||0, b = parseInt(nums[2])||0;
      const a = parseFloat(nums[3] ?? '1');
      color = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
      opacity = Math.round(a * 100);
    } else {
      const hexM = val.match(/#[0-9a-fA-F]{3,8}/);
      if (hexM) color = hexM[0];
    }
    const rest = val.replace(/rgba?\([^)]+\)/g,'').replace('inset','').trim();
    const nums = rest.match(/-?[\d.]+/g) || [];
    return { inset, x: parseFloat(nums[0])||0, y: parseFloat(nums[1])||0, blur: parseFloat(nums[2])||0, spread: parseFloat(nums[3])||0, color, opacity };
  } catch { return d; }
}

/* ── v1.2: Shadow structured editor ── */
function renderShadowEditor(s: Record<string, string>): string {
  const hasShadow = s.boxShadow && s.boxShadow !== 'none';
  if (!hasShadow) {
    return '<button data-dm-action="add-shadow" style="width:100%;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('plus', 10) + ' Add Shadow</button>';
  }
  const p = parseBoxShadowComputed(s.boxShadow || 'none');
  const numInp = (lbl: string, field: string, val: number) =>
    '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + lbl + '</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
    '<input type="number" data-dm-shadow-field="' + field + '" value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
    '</div></div>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    // Type + delete
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
    '<select data-dm-shadow-field="type" class="dm-select" style="flex:1;">' +
    '<option value="outer"' + (!p.inset?' selected':'') + '>Outer Shadow</option>' +
    '<option value="inset"' + (p.inset?' selected':'') + '>Inner Shadow</option>' +
    '</select>' +
    '<button data-dm-action="clear-shadow" title="Remove shadow" style="padding:4px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-muted);cursor:pointer;display:flex;">' + icon('trash', 10) + '</button>' +
    '</div>' +
    // Color + opacity
    sub('Color') +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
    '<input type="color" data-dm-shadow-field="color" value="' + p.color + '" style="width:28px;height:28px;border:1px solid var(--dm-input-border);border-radius:5px;cursor:pointer;background:none;padding:0;flex-shrink:0;"/>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;flex:1;">' +
    '<input type="text" class="dm-input" data-dm-shadow-field="colorhex" value="' + p.color.replace('#','') + '" style="background:none;border:none;padding:6px;flex:1;min-width:0;font-family:SF Mono,Monaco,monospace;"/>' +
    '<input type="number" data-dm-shadow-field="opacity" min="0" max="100" value="' + p.opacity + '" style="width:36px;background:none;border:none;padding:6px 4px;text-align:right;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;flex-shrink:0;">%</span>' +
    '</div></div>' +
    grid(2, numInp('Offset X','x',p.x), numInp('Offset Y','y',p.y)) + sp() +
    grid(2, numInp('Blur','blur',p.blur), numInp('Spread','spread',p.spread)) +
    '</div>';
}

/* ── Text shadow editor (structured: x/y/blur/color) ── */
function parseTextShadow(val: string): { x: number; y: number; blur: number; color: string } {
  const d = { x: 0, y: 1, blur: 2, color: 'rgba(0,0,0,0.4)' };
  if (!val || val === 'none') return d;
  try {
    const colorM = val.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|hsla?\([^)]+\))/);
    const color = colorM ? colorM[0] : '#000000';
    const rest = val.replace(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|hsla?\([^)]+\))/g, '').trim();
    const nums = rest.split(/\s+/).filter(Boolean).map(s => parseFloat(s) || 0);
    return { x: nums[0] ?? 0, y: nums[1] ?? 1, blur: nums[2] ?? 2, color };
  } catch { return d; }
}

function renderTextShadowEditor(s: Record<string, string>): string {
  const p = parseTextShadow(s.textShadow || 'none');
  const numField = (label: string, prop: string, val: number) =>
    '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
    '<input type="number" data-dm-textshadow-field="' + prop + '" value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
    '</div></div>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    grid(2, numField('Offset X', 'x', p.x), numField('Offset Y', 'y', p.y)) + sp() +
    grid(2, numField('Blur', 'blur', p.blur), '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Color</label><div style="display:flex;align-items:center;gap:4px;"><input type="color" data-dm-textshadow-field="color" value="' + rgbToHex(p.color) + '" style="width:28px;height:28px;border:1px solid var(--dm-input-border);border-radius:5px;cursor:pointer;background:none;padding:0;flex-shrink:0;"/><input type="text" class="dm-input" data-dm-textshadow-field="colorhex" value="' + rgbToHex(p.color).replace('#','') + '" style="flex:1;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:6px;font-family:SF Mono,Monaco,monospace;"/></div></div>') +
    '<div style="margin-top:6px;display:flex;justify-content:flex-end;"><button data-dm-action="clear-text-shadow" style="padding:3px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-dim);cursor:pointer;font-size:9px;font-family:inherit;">Remove</button></div>' +
    '</div>';
}

// ─── Effects layered model ───────────────────────────────────────────────
// Per-effect visibility lives in memory, keyed by element id + a stable
// effect id. Hidden effects are dropped from CSS but kept in the chain
// (and therefore in the visible list) so re-toggling restores them.
const hiddenEffectsByElement = new Map<string, Set<string>>();
const stashedEffectByKey = new Map<string, string>(); // `${elementId}::${effectId}` → original CSS entry

type ShadowParts = { inset: boolean; x: number; y: number; blur: number; spread: number; color: string };
type EffectEntry =
  | { id: string; kind: 'drop-shadow' | 'inner-shadow'; chain: 'box'; chainIdx: number; raw: string; shadow: ShadowParts; visible: boolean }
  | { id: string; kind: 'filter-drop-shadow'; chain: 'filter'; chainIdx: number; raw: string; shadow: ShadowParts; visible: boolean }
  | { id: string; kind: 'text-shadow'; raw: string; shadow: ShadowParts; visible: boolean }
  | { id: string; kind: 'layer-blur'; chain: 'filter'; chainIdx: number; raw: string; radius: number; visible: boolean }
  | { id: string; kind: 'backdrop-blur'; chain: 'backdrop'; chainIdx: number; raw: string; radius: number; visible: boolean };

// Filter functions are space-separated, each call wrapped in parens. A
// dumb whitespace split would tear apart `drop-shadow(0 4px 8px ...)`. This
// preserves nested whitespace inside parens.
function splitFilterFunctions(value: string): string[] {
  const v = (value || '').trim();
  if (!v || v === 'none') return [];
  const out: string[] = [];
  let depth = 0; let cur = '';
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (/\s/.test(ch) && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else { cur += ch; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseEffects(s: Record<string, string>, elementId: string, isText: boolean): EffectEntry[] {
  const hidden = hiddenEffectsByElement.get(elementId) ?? new Set<string>();
  const out: EffectEntry[] = [];

  // box-shadow chain — drop + inner. Stroke-shaped entries belong to Stroke.
  const bsRaw = parseCssCommaList(s.boxShadow || '');
  bsRaw.forEach((raw, i) => {
    if (shadowEntryIsStroke(raw)) return;
    const p = parseShadowEntry(raw);
    if (!p) return;
    const id = 'box:' + i;
    out.push({
      id,
      kind: p.inset ? 'inner-shadow' : 'drop-shadow',
      chain: 'box',
      chainIdx: i,
      raw,
      shadow: { inset: p.inset, x: p.x, y: p.y, blur: p.blur, spread: p.spread, color: p.color },
      visible: !hidden.has(id),
    });
  });

  // filter drop-shadow() calls — distinct from box-shadow because they
  // follow the alpha edge of the layer (great for SVG icons / non-rect).
  const fnList = splitFilterFunctions(s.filter || '');
  fnList.forEach((fn, i) => {
    const ds = fn.match(/^drop-shadow\((.*)\)\s*$/i);
    if (ds) {
      const inner = ds[1];
      const p = parseShadowEntry(inner);
      if (!p) return;
      const id = 'filter-drop:' + i;
      out.push({
        id,
        kind: 'filter-drop-shadow',
        chain: 'filter',
        chainIdx: i,
        raw: fn,
        shadow: { inset: false, x: p.x, y: p.y, blur: p.blur, spread: 0, color: p.color },
        visible: !hidden.has(id),
      });
    } else if (/^blur\(/i.test(fn)) {
      const m = fn.match(/^blur\(([^)]+)\)\s*$/i);
      const id = 'layer-blur:' + i;
      out.push({
        id,
        kind: 'layer-blur',
        chain: 'filter',
        chainIdx: i,
        raw: fn,
        radius: m ? (parseFloat(m[1]) || 0) : 0,
        visible: !hidden.has(id),
      });
    }
  });

  // text-shadow — only on text-bearing layers. CSS has just one chain,
  // so we parse one entry (multiple text-shadows are valid CSS but rare;
  // we surface only the first to keep the panel honest).
  if (isText && s.textShadow && s.textShadow !== 'none') {
    const p = parseShadowEntry(s.textShadow);
    if (p) {
      const id = 'text-shadow';
      out.push({
        id,
        kind: 'text-shadow',
        raw: s.textShadow,
        shadow: { inset: false, x: p.x, y: p.y, blur: p.blur, spread: 0, color: p.color },
        visible: !hidden.has(id),
      });
    }
  }

  // backdrop blur — same pattern, on `backdrop-filter`.
  const bdList = splitFilterFunctions((s as any).backdropFilter || '');
  bdList.forEach((fn, i) => {
    const m = fn.match(/^blur\(([^)]+)\)\s*$/i);
    if (m) {
      const id = 'backdrop-blur:' + i;
      out.push({
        id,
        kind: 'backdrop-blur',
        chain: 'backdrop',
        chainIdx: i,
        raw: fn,
        radius: parseFloat(m[1]) || 0,
        visible: !hidden.has(id),
      });
    }
  });

  return out;
}

function formatShadowEntry(p: ShadowParts): string {
  const ins = p.inset ? 'inset ' : '';
  return ins + p.x + 'px ' + p.y + 'px ' + p.blur + 'px ' + p.spread + 'px ' + p.color;
}

function formatFilterDropShadow(p: ShadowParts): string {
  return 'drop-shadow(' + p.x + 'px ' + p.y + 'px ' + p.blur + 'px ' + p.color + ')';
}

// Per-shadow editor. Writes via virtual props that encode (chain, chainIdx,
// field) so the input handler can splice exactly the right entry in the
// right shorthand chain. `kind` selects the editor variant: filter-drop /
// text-shadow lack `spread` and `inset`; box-shadow has both.
function renderShadowEntryEditor(entry: EffectEntry & { shadow: ShadowParts }): string {
  const sh = entry.shadow;
  // Pick the prop prefix for the field-level edits below. We use one
  // prefix per chain to keep the regex match in the input handler tidy.
  const prefix =
    entry.kind === 'filter-drop-shadow' ? '__effd_fx_' + entry.chainIdx + '_' :
    entry.kind === 'text-shadow' ? '__effd_text_0_' :
    '__effd_box_' + (entry as any).chainIdx + '_';
  const numField = (label: string, field: 'x' | 'y' | 'blur' | 'spread', val: number, withSpread = true) =>
    (!withSpread && field === 'spread') ? '' :
    '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
    '<input type="number" data-dm-prop="' + prefix + field + '" value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
    '</div></div>';

  const supportsSpread = entry.kind === 'drop-shadow' || entry.kind === 'inner-shadow';
  const supportsInset = entry.kind === 'drop-shadow' || entry.kind === 'inner-shadow';

  // Inset toggle (box-shadow only — flips a drop into an inner and back).
  const insetRow = supportsInset
    ? '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
        '<select data-dm-prop="' + prefix + 'inset" class="dm-select" style="flex:1;">' +
          '<option value="outer"' + (!sh.inset ? ' selected' : '') + '>Outer (drop)</option>' +
          '<option value="inset"' + (sh.inset ? ' selected' : '') + '>Inner</option>' +
        '</select>' +
      '</div>'
    : '';

  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    insetRow +
    sub('Colour') +
    '<div style="margin-bottom:8px;">' +
      colorInp('', prefix + 'color', sh.color || '#000000') +
    '</div>' +
    grid(2, numField('Offset X', 'x', sh.x), numField('Offset Y', 'y', sh.y)) + sp() +
    grid(supportsSpread ? 2 : 1,
      numField('Blur', 'blur', sh.blur),
      numField('Spread', 'spread', sh.spread, supportsSpread)
    ) +
    '</div>';
}

// Per-blur editor — single radius input for `filter: blur` / `backdrop-filter: blur`.
function renderBlurEntryEditor(entry: { kind: 'layer-blur' | 'backdrop-blur'; chainIdx: number; radius: number }): string {
  const prefix = entry.kind === 'layer-blur'
    ? '__effd_lblur_' + entry.chainIdx + '_'
    : '__effd_bblur_' + entry.chainIdx + '_';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    '<div style="display:flex;flex-direction:column;gap:3px;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Radius</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
    '<input type="number" data-dm-prop="' + prefix + 'radius" min="0" value="' + entry.radius + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
    '</div></div>' +
    '</div>';
}

/* ── Filter presets ── */
const FILTER_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'blur(4px)', label: 'Blur — light' },
  { value: 'blur(12px)', label: 'Blur — strong' },
  { value: 'brightness(1.2)', label: 'Brighter' },
  { value: 'brightness(0.7)', label: 'Darker' },
  { value: 'contrast(1.2)', label: 'High contrast' },
  { value: 'saturate(1.5)', label: 'Vivid' },
  { value: 'saturate(0)', label: 'Grayscale' },
  { value: 'sepia(1)', label: 'Sepia' },
  { value: 'invert(1)', label: 'Invert' },
  { value: 'hue-rotate(90deg)', label: 'Hue shift +90°' },
  { value: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))', label: 'Drop shadow' },
];

function renderFilterEditor(prop: string, label: string, value: string): string {
  // Legacy entry point — retained for back-compat with any external callers.
  // The structured editor (renderFilterFunctions / renderTransformComponents)
  // is what the design tab now uses.
  const cur = (value || 'none').trim();
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    selKV(label, prop, FILTER_PRESETS.find(p => p.value === cur) ? cur : 'custom', [
      ...FILTER_PRESETS,
      ...(FILTER_PRESETS.find(p => p.value === cur) ? [] : [{ value: 'custom', label: 'Custom (below)' }]),
    ] as any) + sp() +
    inp('Custom value', prop, cur, '') +
    '</div>';
}

// ── Structured Transform Components ──
// translate / scale ship as standalone CSS properties — break each into
// X/Y inputs pre-filled from computed style. Each edit recomposes the
// owning property and fires one applyStyle.
interface TwoComp { x: string; y: string; }

function parseTranslate(val: string): TwoComp {
  if (!val || val === 'none') return { x: '0', y: '0' };
  const parts = val.trim().split(/\s+/);
  const strip = (v: string) => (v || '0').replace(/px$/, '').trim();
  return { x: strip(parts[0]), y: strip(parts[1] || '0') };
}

function parseScale(val: string): TwoComp {
  if (!val || val === 'none') return { x: '1', y: '1' };
  const parts = val.trim().split(/\s+/);
  return { x: (parts[0] || '1').trim(), y: (parts[1] || parts[0] || '1').trim() };
}

function tcompField(group: 'translate' | 'scale', axis: 'x' | 'y', label: string, value: string, unit: string): string {
  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' +
    '<div style="display:flex;align-items:center;border-radius:5px;overflow:hidden;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);">' +
    '<input type="text" class="dm-input" data-dm-tcomp-group="' + group + '" data-dm-tcomp-axis="' + axis + '" data-dm-numeric="1" data-dm-unit="' + unit + '" inputmode="decimal" value="' + escapeAttr(value) + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;"/>' +
    (unit ? '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;flex-shrink:0;opacity:0.6;pointer-events:none;">' + unit + '</span>' : '') +
    '</div></div>';
}

function renderTransformComponents(s: Record<string, string>): string {
  const t = parseTranslate(s.translate || '');
  const sc = parseScale(s.scale || '');
  return grid(2,
    '<div style="display:flex;flex-direction:column;gap:3px;">' +
      '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Translate</label>' +
      grid(2, tcompField('translate', 'x', 'X', t.x, 'px'), tcompField('translate', 'y', 'Y', t.y, 'px')) +
    '</div>',
    '<div style="display:flex;flex-direction:column;gap:3px;">' +
      '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Scale</label>' +
      grid(2, tcompField('scale', 'x', 'X', sc.x, ''), tcompField('scale', 'y', 'Y', sc.y, '')) +
    '</div>'
  );
}

// ── Structured Filter / Backdrop-filter ──
// Common filter functions surfaced as labelled number fields. Pre-filled
// from the element's current value (parsed) or sane defaults. Each edit
// recomposes the whole shorthand and writes via applyStyle.

// Each filter function gets a slider with a paired number field. The slider
// range is chosen so the *neutral* value (no visible effect) sits at the
// middle of the track for the multiplier filters (brightness/contrast/
// saturate, neutral=1, range 0..2) and at zero for hue-rotate (range
// -180..180). Blur and Grayscale have no negative concept — slider sweeps
// from default toward max.
interface FilterField {
  name: string;
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
}
const FILTER_FIELDS: FilterField[] = [
  { name: 'blur',        label: 'Blur',        unit: 'px',  default: 0, min: 0,    max: 20,  step: 0.1 },
  { name: 'brightness',  label: 'Brightness',  unit: '',    default: 1, min: 0,    max: 2,   step: 0.05 },
  { name: 'contrast',    label: 'Contrast',    unit: '',    default: 1, min: 0,    max: 2,   step: 0.05 },
  { name: 'saturate',    label: 'Saturate',    unit: '',    default: 1, min: 0,    max: 2,   step: 0.05 },
  { name: 'hue-rotate',  label: 'Hue rotate',  unit: 'deg', default: 0, min: -180, max: 180, step: 1 },
  { name: 'grayscale',   label: 'Grayscale',   unit: '',    default: 0, min: 0,    max: 1,   step: 0.01 },
];

function parseFilter(val: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FILTER_FIELDS) out[f.name] = f.default;
  if (!val || val === 'none') return out;
  const re = /(blur|brightness|contrast|saturate|hue-rotate|grayscale|invert|sepia)\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(val)) !== null) {
    const fn = m[1];
    const arg = m[2].trim().replace(/(px|deg|%)$/, '').trim();
    const n = parseFloat(arg);
    if (!isNaN(n)) out[fn] = n;
  }
  return out;
}

// One row per filter function: [label · slider · number+unit].
// `input` event recomposes the filter shorthand and writes via applyStyle
// so the page repaints live; slider+number for the same field are kept in
// sync via syncFilterSiblings on every input.
function renderFilterFunctions(propName: 'filter' | 'backdropFilter', value: string): string {
  const parsed = parseFilter(value);
  const groupAttr = propName === 'filter' ? 'filter' : 'bfilter';
  const row = (f: FilterField) => {
    const v = parsed[f.name] ?? f.default;
    return (
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;margin-bottom:6px;">' +
      '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;width:64px;flex-shrink:0;">' + f.label + '</label>' +
      '<input type="range" class="dm-fslider" data-dm-fcomp-group="' + groupAttr + '" data-dm-fcomp-field="' + f.name + '" data-dm-fcomp-slider="1" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '" style="flex:1;min-width:0;"/>' +
      '<div style="display:flex;align-items:center;border-radius:5px;overflow:hidden;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);width:64px;flex-shrink:0;">' +
      '<input type="text" class="dm-input" data-dm-fcomp-group="' + groupAttr + '" data-dm-fcomp-field="' + f.name + '" data-dm-numeric="1" data-dm-unit="' + f.unit + '" inputmode="decimal" value="' + v + '" style="background:none;border:none;padding:5px 6px;width:100%;min-width:0;font-size:10px;text-align:right;"/>' +
      (f.unit ? '<span style="font-size:9px;color:var(--dm-text-dim);padding:0 4px;flex-shrink:0;opacity:0.6;pointer-events:none;">' + f.unit + '</span>' : '') +
      '</div></div>'
    );
  };
  return FILTER_FIELDS.map(row).join('');
}

/* ── Transition + Animation editors ── */
function renderTransitionEditor(s: Record<string, string>): string {
  const prop = (s.transitionProperty || 'all').split(',')[0].trim();
  const dur = (s.transitionDuration || '0s').split(',')[0].trim();
  const timing = (s.transitionTimingFunction || 'ease').split(',')[0].trim();
  const delay = (s.transitionDelay || '0s').split(',')[0].trim();
  const customCurveActive = vizProp === 'transition';
  const customCurveBtn =
    '<button data-dm-viz-open="transition" title="Open the cubic-bezier / spring visualizer to author a custom timing curve" style="padding:6px;background:' + (customCurveActive ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (customCurveActive ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';border-radius:5px;color:' + (customCurveActive ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('activity', 11) + ' Custom curve</button>';
  const previewBtn =
    '<button data-dm-action="preview-transition" title="Preview transition" style="padding:6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('play', 11) + ' Preview</button>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    grid(2,
      selKV('Property', 'transitionProperty', prop, TRANSITION_PROPERTY_OPTIONS as any),
      selKV('Timing', 'transitionTimingFunction', timing, TIMING_FUNCTION_OPTIONS as any)
    ) + sp() +
    grid(2,
      inp('Duration', 'transitionDuration', dur, 's'),
      inp('Delay', 'transitionDelay', delay, 's')
    ) + sp() +
    grid(2, customCurveBtn, previewBtn) +
    '</div>';
}

function renderAnimationEditor(s: Record<string, string>): string {
  const name = (s.animationName && s.animationName !== 'none') ? s.animationName.split(',')[0].trim() : 'none';
  const dur = (s.animationDuration || '0s').split(',')[0].trim();
  const timing = (s.animationTimingFunction || 'ease').split(',')[0].trim();
  const delay = (s.animationDelay || '0s').split(',')[0].trim();
  const iter = (s.animationIterationCount || '1').split(',')[0].trim();
  const isInfinite = iter === 'infinite';
  const dir = (s.animationDirection || 'normal').split(',')[0].trim();
  const fill = (s.animationFillMode || 'none').split(',')[0].trim();
  const playState = (s.animationPlayState || 'running').split(',')[0].trim();
  const isBuiltin = name.startsWith('dm-');
  const knownName = isBuiltin || name === 'none' ? name : '';
  const customLabel = isBuiltin || name === 'none' ? '' :
    '<div style="margin-top:4px;font-size:9px;color:var(--dm-text-dim);">Custom: <span style="font-family:monospace;color:var(--dm-text-muted);">' + escapeAttr(name) + '</span> (page must define @keyframes)</div>';
  const iterInput =
    '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Iterations</label>' +
    '<div style="display:flex;align-items:center;gap:4px;">' +
    '<input type="text" class="dm-input" data-dm-prop="animationIterationCount" value="' + escapeAttr(iter) + '" style="flex:1;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:6px;"/>' +
    '<button data-dm-prop="animationIterationCount" data-dm-value="' + (isInfinite ? '1' : 'infinite') + '" title="Toggle infinite" style="padding:6px 8px;background:' + (isInfinite ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (isInfinite ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';border-radius:4px;color:' + (isInfinite ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';cursor:pointer;font-size:11px;font-family:inherit;">∞</button>' +
    '</div></div>';
  const previewBtn =
    '<button data-dm-action="preview-animation" title="Restart animation" style="padding:6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;align-self:flex-end;">' + icon('play', 11) + ' Preview</button>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    selKV('Animation', 'animationName', knownName, ANIMATION_NAME_OPTIONS as any) +
    customLabel + sp() +
    grid(2,
      inp('Duration', 'animationDuration', dur, 's'),
      selKV('Timing', 'animationTimingFunction', timing, TIMING_FUNCTION_OPTIONS as any)
    ) + sp() +
    grid(2,
      inp('Delay', 'animationDelay', delay, 's'),
      iterInput
    ) + sp() +
    grid(2,
      selKV('Direction', 'animationDirection', dir, ANIMATION_DIRECTION_OPTIONS as any),
      selKV('Fill', 'animationFillMode', fill, ANIMATION_FILL_OPTIONS as any)
    ) + sp() +
    grid(2,
      selKV('State', 'animationPlayState', playState, ANIMATION_PLAY_STATE_OPTIONS as any),
      previewBtn
    ) +
    '</div>';
}

/* ── v1.2: Curve math helpers ── */
function sampleBezier(x1: number, y1: number, x2: number, y2: number, n = 40): {x: number; y: number}[] {
  function b(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
  }
  const pts: {x: number; y: number}[] = [];
  for (let i = 0; i <= n; i++) { const t = i/n; pts.push({ x: b(t,0,x1,x2,1), y: b(t,0,y1,y2,1) }); }
  return pts;
}

function simulateSpring(stiffness: number, damping: number, mass: number, steps = 40): number[] {
  const dt = 0.025;
  let pos = 0, vel = 0;
  const result: number[] = [0];
  for (let i = 0; i < steps; i++) {
    const acc = (-stiffness*(pos-1) - damping*vel) / Math.max(mass, 0.1);
    vel += acc*dt; pos += vel*dt;
    result.push(pos);
  }
  return result;
}

function bptsToPolyline(pts: {x: number; y: number}[], w: number, h: number): string {
  const yMin = -0.2, yMax = 1.2, yr = yMax - yMin;
  return pts.map(p => (p.x*w).toFixed(1) + ',' + ((1-(p.y-yMin)/yr)*h).toFixed(1)).join(' ');
}

function narrToPolyline(arr: number[], w: number, h: number): string {
  const yMin = -0.2, yMax = 1.2, yr = yMax - yMin;
  return arr.map((y, i) => ((i/(arr.length-1))*w).toFixed(1) + ',' + ((1-(y-yMin)/yr)*h).toFixed(1)).join(' ');
}

/* ── v1.2: Transition Visualizer ── */
function renderVizPanel(): string {
  const isEase = vizMode === 'ease';
  const mBtn = (m: 'ease' | 'spring', label: string) => {
    const a = vizMode === m;
    return '<button data-dm-viz-mode="' + m + '" style="flex:1;padding:3px 6px;background:' + (a?'var(--dm-accent-bg)':'var(--dm-btn-bg)') + ';border:1px solid ' + (a?'var(--dm-accent-border)':'var(--dm-btn-border)') + ';border-radius:4px;color:' + (a?'var(--dm-accent)':'var(--dm-text-secondary)') + ';cursor:pointer;font-size:9px;font-family:inherit;">' + label + '</button>';
  };
  const srow = (lbl: string, param: string, val: number, mn: number, mx: number, st: number) =>
    '<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">' +
    '<span style="width:22px;font-size:9px;color:var(--dm-text-muted);flex-shrink:0;">' + lbl + '</span>' +
    '<input type="range" data-dm-viz-param="' + param + '" min="' + mn + '" max="' + mx + '" step="' + st + '" value="' + val + '" style="flex:1;accent-color:var(--dm-accent);height:3px;"/>' +
    '<span style="width:28px;text-align:right;font-size:9px;color:var(--dm-text-dim);font-family:monospace;">' + val.toFixed(2) + '</span>' +
    '</div>';
  const polyline = isEase
    ? bptsToPolyline(sampleBezier(bezX1, bezY1, bezX2, bezY2), 74, 36)
    : narrToPolyline(simulateSpring(sprStiffness, sprDamping, sprMass), 74, 36);
  const svg = '<svg width="78" height="40" style="display:block;border-radius:4px;border:1px solid var(--dm-separator);background:var(--dm-bg);flex-shrink:0;">' +
    '<polyline points="' + polyline + '" fill="none" stroke="var(--dm-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(2,2)"/></svg>';
  const sliders = isEase
    ? srow('x1','bezX1',bezX1,-1,2,0.01)+srow('y1','bezY1',bezY1,-1,2,0.01)+srow('x2','bezX2',bezX2,-1,2,0.01)+srow('y2','bezY2',bezY2,-1,2,0.01)
    : srow('K','sprStiffness',sprStiffness,10,500,1)+srow('B','sprDamping',sprDamping,0,100,0.5)+srow('M','sprMass',sprMass,0.1,10,0.1);
  let cssVal = '';
  if (isEase) {
    cssVal = 'all 0.3s cubic-bezier(' + [bezX1,bezY1,bezX2,bezY2].map(v=>v.toFixed(2)).join(',') + ')';
  } else {
    const dur = Math.max(0.1, 2*Math.PI*Math.sqrt(Math.max(sprMass,0.1)/Math.max(sprStiffness,1))).toFixed(2);
    cssVal = 'all ' + dur + 's ease-in-out';
  }
  return '<div data-dm-viz style="margin-top:6px;padding:8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;">' +
    '<div style="display:flex;gap:4px;margin-bottom:8px;align-items:center;">' +
    mBtn('ease','Easing') + mBtn('spring','Spring') +
    '<button data-dm-action="close-viz" style="margin-left:auto;background:none;border:none;color:var(--dm-text-muted);cursor:pointer;padding:2px;display:flex;">' + icon('x',10) + '</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">' + svg +
    '<div style="flex:1;min-width:0;">' + sliders + '</div></div>' +
    '<button data-dm-action="apply-viz" style="width:100%;padding:4px 6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:4px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
    'Apply: ' + escapeAttr(cssVal) + '</button>' +
    '</div>';
}

/* ── Presets View — user-saved styles, 7 kinds (one per Design-tab section). ── */
function renderPresetsView(): string {
  const hasElement = !!info;

  // Import/Export buttons live in the header.
  const btnBase = 'display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:5px;font-size:10px;font-family:inherit;cursor:pointer;';
  const ioButtons = '<div style="display:flex;gap:4px;">' +
    '<label style="' + btnBase + 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);" title="Import presets from JSON file">' +
    icon('upload', 11) + ' Import<input type="file" accept=".json" data-dm-import-presets style="display:none;"/></label>' +
    '<button data-dm-action="export-presets" style="' + btnBase + 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);" title="Export presets as JSON">' + icon('download', 11) + ' Export</button>' +
    '</div>';

  const presetsHeader = '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dm-separator-strong);flex-shrink:0;">' +
    '<button data-dm-action="close-presets" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:2px;">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:13px;font-weight:600;color:var(--dm-text);flex:1;">Presets</span>' +
    ioButtons + '</div>';

  let content = '';
  let deleteOverlay = '';

  {
    if (editingPresetData) {
      // Edit view: name + editable style properties
      const styleRows = Object.entries(editingPresetData.styles).map(([prop, val]) =>
        '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">' +
        '<span style="font-size:9px;color:var(--dm-text-secondary);min-width:90px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeAttr(prop) + '">' + escapeAttr(prop) + '</span>' +
        '<input class="dm-input" data-dm-edit-prop="' + escapeAttr(prop) + '" value="' + escapeAttr(String(val)) + '" style="flex:1;font-size:9px;padding:3px 5px;min-width:0;font-family:SF Mono,Monaco,monospace;"/>' +
        '<button data-dm-remove-edit-prop="' + escapeAttr(prop) + '" title="Remove property" style="padding:2px;background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;flex-shrink:0;">' + icon('x', 9) + '</button>' +
        '</div>'
      ).join('');
      const editKind = editingPresetData.kind || 'typography';
      const editKindBadgeStyle = (() => {
        // One pastel pair per kind. Reuse semantic CSS variables where they
        // exist; otherwise hard-code accents that read on both themes.
        const colors: Record<string, [string, string]> = {
          position:   ['rgba(34,197,94,0.16)', 'rgb(34,197,94)'],
          layout:     ['rgba(20,184,166,0.18)', 'rgb(20,184,166)'],
          appearance: ['rgba(139,92,246,0.18)', 'var(--dm-purple)'],
          typography: ['rgba(79,158,255,0.15)', 'var(--dm-accent)'],
          fill:       ['rgba(245,158,11,0.18)', '#f59e0b'],
          stroke:     ['rgba(244,63,94,0.18)', 'rgb(244,63,94)'],
          effects:    ['rgba(168,85,247,0.18)', 'rgb(168,85,247)'],
        };
        const [bg, fg] = colors[editKind] || colors.typography;
        return `font-size:8px;padding:2px 8px;border-radius:9999px;background:${bg};color:${fg};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;flex-shrink:0;`;
      })();
      content = '<div style="padding:10px;">' +
        '<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">' +
        '<div style="flex:1;">' +
        '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:4px;">Preset Name</div>' +
        '<input class="dm-input" data-dm-edit-preset-name value="' + escapeAttr(editingPresetData.name) + '" style="width:100%;font-size:11px;padding:5px 7px;box-sizing:border-box;"/>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;">' +
        '<div style="font-size:9px;color:var(--dm-text-dim);">Type</div>' +
        '<span style="' + editKindBadgeStyle + '" title="Type cannot be changed — create a new preset to switch kinds">' + escapeAttr(editKind) + '</span>' +
        '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
        '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:6px;">Style Properties</div>' +
        (styleRows || '<div style="font-size:10px;color:var(--dm-text-dim);">No styles</div>') +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
        '<button data-dm-action="save-edit-preset" style="flex:1;padding:6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Save Changes</button>' +
        '<button data-dm-action="cancel-edit-preset" style="padding:6px 10px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
        '</div></div>';
    } else {
      // List view — save form always shown, disabled when no element selected.
      // The Kind dropdown spans all 7 Design-tab sections (Position, Layout,
      // Appearance, Typography, Fill, Stroke, Effects). The selected kind
      // drives which properties get captured — the side panel's
      // SECTION_PROPS is the single source of truth for that list and is
      // sent across with the save message.
      const saveDisabled = !hasElement;
      // Kind picker — pill chips wrap onto multiple rows when needed.
      // We tried a dropdown earlier; chips give better discoverability of
      // the seven kinds at a glance.
      const kindChip = (k: PresetKind) => {
        const active = savePresetKind === k;
        return '<button data-dm-preset-kind="' + k + '"' + (saveDisabled ? ' disabled' : '') +
          ' style="padding:3px 9px;background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') +
          ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') +
          ';border-radius:9999px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') +
          ';cursor:' + (saveDisabled ? 'default' : 'pointer') +
          ';font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') +
          ';opacity:' + (saveDisabled ? '0.45' : '1') + ';">' + PRESET_KIND_LABELS[k] + '</button>';
      };
      const saveForm = '<div style="padding:8px 10px;border-bottom:1px solid var(--dm-separator);">' +
        (saveDisabled
          ? '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:6px;">Click an element on the page to enable saving</div>'
          : '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:6px;">What are you saving from this element?</div>') +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">' +
        PRESET_KIND_ORDER.map(k => kindChip(k)).join('') +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '<input type="text" class="dm-input" data-dm-preset-name placeholder="Name this preset..." ' +
        (saveDisabled ? 'disabled style="flex:1;min-width:0;font-size:10px;opacity:0.4;"' : 'style="flex:1;min-width:0;font-size:10px;"') + '/>' +
        '<button data-dm-action="save-preset" ' +
        (saveDisabled ? 'disabled style="padding:4px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-dim);font-size:9px;font-family:inherit;white-space:nowrap;display:flex;align-items:center;gap:3px;opacity:0.4;cursor:default;pointer-events:none;"' :
          'style="padding:4px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;white-space:nowrap;display:flex;align-items:center;gap:3px;"') +
        '>' + icon('save', 9) + ' Save</button>' +
        '</div></div>';

      // Filter chips — appear once the user has presets across more than
      // one kind. Pills wrap cleanly when there are many kinds, so we
      // get the discoverability win without crowding when there's only
      // a handful.
      const visibleKinds = new Set<string>(customPresetsList.map((p: any) => p.kind || 'typography'));
      const filterRow = customPresetsList.length > 1 && visibleKinds.size > 1
        ? (() => {
            const fchip = (f: 'all' | PresetKind, label: string) => {
              const active = presetFilter === f;
              return '<button data-dm-preset-filter="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') +
                ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-separator)') +
                ';border-radius:9999px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') +
                ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' + label + '</button>';
            };
            const visibleChips = PRESET_KIND_ORDER
              .filter(k => visibleKinds.has(k))
              .map(k => fchip(k, PRESET_KIND_LABELS[k]))
              .join('');
            return '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dm-separator);">' +
              fchip('all', 'All') + visibleChips +
              '</div>';
          })()
        : '';

      // Apply preset disabled state
      const applyPresetStyle = hasElement
        ? 'padding:2px 6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:3px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;flex-shrink:0;'
        : 'padding:2px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:3px;color:var(--dm-text-dim);cursor:default;font-size:9px;font-family:inherit;flex-shrink:0;opacity:0.45;pointer-events:none;';

      const filteredPresets = presetFilter === 'all'
        ? customPresetsList
        : customPresetsList.filter((p: any) => (p.kind || 'typography') === presetFilter);
      const kindBadgeStyle = (kind: string): string => {
        const colors: Record<string, [string, string]> = {
          position:   ['rgba(34,197,94,0.16)', 'rgb(34,197,94)'],
          layout:     ['rgba(20,184,166,0.18)', 'rgb(20,184,166)'],
          appearance: ['rgba(139,92,246,0.18)', 'var(--dm-purple)'],
          typography: ['rgba(79,158,255,0.15)', 'var(--dm-accent)'],
          fill:       ['rgba(245,158,11,0.18)', '#f59e0b'],
          stroke:     ['rgba(244,63,94,0.18)', 'rgb(244,63,94)'],
          effects:    ['rgba(168,85,247,0.18)', 'rgb(168,85,247)'],
        };
        const [bg, fg] = colors[kind] || colors.typography;
        return `font-size:8px;padding:1px 6px;border-radius:9999px;background:${bg};color:${fg};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;flex-shrink:0;`;
      };
      // Best-effort visual preview per preset. Anything we can't visualise
      // falls through to a small kind-tinted dot.
      const previewSwatch = (p: any): string => {
        const k = p.kind || 'typography';
        const styles = p.styles || {};
        if (styles.color && (k === 'typography' || k === 'fill')) {
          return '<span title="' + escapeAttr(styles.color) + '" style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(styles.color) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>';
        }
        if (k === 'fill' && styles.backgroundColor) {
          return '<span style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(styles.backgroundColor) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>';
        }
        if (k === 'fill' && styles.backgroundImage) {
          return '<span style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(styles.backgroundImage) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>';
        }
        if (k === 'effects' && styles.boxShadow) {
          return '<span style="width:14px;height:14px;border-radius:3px;background:white;box-shadow:' + escapeAttr(styles.boxShadow) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>';
        }
        if (k === 'stroke' && styles.borderTopColor) {
          return '<span style="width:14px;height:14px;border-radius:3px;background:white;border:2px solid ' + escapeAttr(styles.borderTopColor) + ';flex-shrink:0;"></span>';
        }
        // Fallback — small kind-tinted square.
        return '<span style="width:10px;height:10px;border-radius:50%;background:var(--dm-accent);opacity:0.5;flex-shrink:0;"></span>';
      };
      const presetsHtml = customPresetsList.length === 0
        ? '<div style="text-align:center;padding:28px 16px;color:var(--dm-text-dim);font-size:11px;line-height:1.7;">No presets yet.<br/><br/>Pick an element on the page, choose a Kind<br/>(Position, Layout, Appearance, Typography, Fill, Stroke, or Effects),<br/>name it, and click Save.</div>'
        : filteredPresets.length === 0
        ? '<div style="text-align:center;padding:24px 16px;color:var(--dm-text-dim);font-size:11px;">No presets in this kind.</div>'
        : '<div style="padding:8px;">' +
          filteredPresets.map((p: any) => {
            const kind = p.kind || 'typography';
            return '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;margin-bottom:4px;">' +
              previewSwatch(p) +
              '<span style="flex:1;font-size:10px;font-weight:500;color:var(--dm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeAttr(p.name) + '">' + escapeAttr(p.name) + '</span>' +
              '<span style="' + kindBadgeStyle(kind) + '">' + escapeAttr(kind) + '</span>' +
              '<button data-dm-apply-preset-id="' + escapeAttr(p.id) + '" title="' + (hasElement ? 'Apply to selected element' : 'Select an element first') + '" style="' + applyPresetStyle + '">Apply</button>' +
              '<button data-dm-edit-preset="' + escapeAttr(p.id) + '" title="Edit" style="padding:2px 4px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:3px;color:var(--dm-text-secondary);cursor:pointer;display:flex;flex-shrink:0;">' + icon('pencil', 9) + '</button>' +
              '<button data-dm-delete-preset="' + escapeAttr(p.id) + '" title="Delete" style="padding:2px 4px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:3px;color:var(--dm-danger);cursor:pointer;display:flex;flex-shrink:0;">' + icon('trash', 9) + '</button>' +
              '</div>';
          }).join('') + '</div>';

      // Delete confirmation overlay
      if (deletingPresetId) {
        deleteOverlay = '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);z-index:30;display:flex;align-items:center;justify-content:center;">' +
          '<div style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;padding:16px;width:168px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.3);">' +
          '<div style="font-size:12px;font-weight:600;color:var(--dm-text);margin-bottom:6px;">Delete preset?</div>' +
          '<div style="font-size:10px;color:var(--dm-text-secondary);margin-bottom:14px;">This cannot be undone.</div>' +
          '<div style="display:flex;gap:6px;">' +
          '<button data-dm-action="cancel-delete-preset" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
          '<button data-dm-action="confirm-delete-preset" style="flex:1;padding:6px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:6px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Delete</button>' +
          '</div></div></div>';
      }

      content = saveForm + filterRow + presetsHtml;
    }
  }

  return presetsHeader +
    '<div style="flex:1;overflow-y:auto;position:relative;">' + content + deleteOverlay + '</div>';
}

/* ── v1.2: Computed CSS Overlay ── */
function renderComputedCssOverlay(): string {
  if (!computedCssOpen) return '';
  return '<div style="position:absolute;left:0;right:0;bottom:0;top:0;background:var(--dm-bg);z-index:20;display:flex;flex-direction:column;">' +
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dm-separator-strong);flex-shrink:0;">' +
    '<button data-dm-action="close-computed-css" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('x',14) + '</button>' +
    '<span style="font-size:12px;font-weight:600;color:var(--dm-text);">Computed CSS</span>' +
    '<button data-dm-action="copy-computed-css" style="margin-left:auto;padding:4px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;gap:4px;">' + icon('copy',10) + ' Copy</button>' +
    '</div>' +
    '<pre style="flex:1;overflow:auto;margin:0;padding:12px;font-family:SF Mono,Monaco,monospace;font-size:10px;line-height:1.6;color:var(--dm-text);white-space:pre-wrap;word-break:break-all;">' + escapeAttr(computedCssText) + '</pre>' +
    '</div>';
}

function alignBtn(align: string, currentAlign: string, iconName: keyof typeof icons): string {
  const active = align === currentAlign;
  return '<button data-dm-prop="textAlign" data-dm-value="' + align + '" title="' + align + '" style="flex:1;padding:6px;background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-input-bg)') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-input-border)') + ';border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;">' + icon(iconName, 12) + '</button>';
}

function textDecBtn(prop: string, activeVal: string, inactiveVal: string, currentVal: string, iconName: keyof typeof icons, title: string): string {
  const active = currentVal === activeVal || currentVal.includes(activeVal);
  return '<button data-dm-prop="' + prop + '" data-dm-value="' + (active ? inactiveVal : activeVal) + '" title="' + title + '" style="flex:1;padding:6px;background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-input-bg)') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-input-border)') + ';border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;">' + icon(iconName, 12) + '</button>';
}

// Text-transform as a 4-icon toggle group (matches alignBtn shape).
// Glyph labels (`Tt`, `AB`, `ab`, `Aa`) read more clearly than abstract
// SVG icons for a typographic transform — they are the transform.
function transformBtn(value: string, currentVal: string, label: string, title: string): string {
  const active = (currentVal || 'none') === value;
  return '<button data-dm-prop="textTransform" data-dm-value="' + value + '" title="' + title + '" style="flex:1;padding:6px;background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-input-bg)') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-input-border)') + ';border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:11px;font-weight:600;letter-spacing:0.5px;">' + label + '</button>';
}

function renderMediaSection(displayInfo: any, s: Record<string, string>, isImg: boolean): string {
  if (!mediaInfo) {
    if (isImg && displayInfo?.imgSrc) {
      // Fallback: render a basic image section when async media data hasn't loaded yet
      return sec('Media', 'image',
        '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:120px;"><img src="' + escapeAttr(displayInfo.imgSrc) + '" style="max-width:100%;display:block;"/></div>' +
        inp('Src', 'src', displayInfo.imgSrc || '', '') + sp() +
        grid(2, sel('Fit', 'objectFit', s.objectFit || 'fill', ['fill','contain','cover','none','scale-down']), inp('Alt', 'alt', '', ''))
      );
    }
    return '';
  }

  const m = mediaInfo;
  let preview = '';
  if (m.kind === 'image' || m.kind === 'background') {
    preview = '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:140px;background:var(--dm-bg-secondary);display:flex;align-items:center;justify-content:center;"><img src="' + escapeAttr(m.src) + '" style="max-width:100%;max-height:140px;display:block;"/></div>';
  } else if (m.kind === 'video') {
    preview = '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:140px;background:var(--dm-bg-secondary);"><video src="' + escapeAttr(m.src) + '"' + (m.poster ? ' poster="' + escapeAttr(m.poster) + '"' : '') + ' controls style="max-width:100%;max-height:140px;display:block;"></video></div>';
  } else if (m.kind === 'audio') {
    preview = '<div style="margin-bottom:8px;"><audio src="' + escapeAttr(m.src) + '" controls style="width:100%;"></audio></div>';
  } else if (m.kind === 'svg') {
    preview = '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:140px;background:var(--dm-bg-secondary);display:flex;align-items:center;justify-content:center;padding:12px;"><img src="' + escapeAttr(m.src) + '" style="max-width:100%;max-height:120px;display:block;"/></div>';
  }

  const meta = (m.naturalWidth && m.naturalHeight)
    ? '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:6px;">' + m.naturalWidth + ' × ' + m.naturalHeight + 'px · ' + m.kind + '</div>'
    : '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:6px;text-transform:capitalize;">' + m.kind + '</div>';

  const downloadBtn = '<button data-dm-action="download-media" style="width:100%;padding:7px 10px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:500;">' + icon('download', 11) + ' Download ' + escapeAttr(m.filename || m.kind) + '</button>';

  let extra = '';
  if (m.kind === 'image' || m.kind === 'background') {
    extra = sp() + inp('Src', 'src', m.src, '') + sp() +
      grid(2, sel('Fit', 'objectFit', s.objectFit || 'fill', ['fill','contain','cover','none','scale-down']), inp('Alt', 'alt', m.alt || '', ''));
  } else if (m.kind === 'svg') {
    extra = sp() + '<button data-dm-action="copy-svg-markup" style="width:100%;padding:5px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('copy', 9) + ' Copy SVG markup</button>';
  }

  return sec('Media', 'image', preview + meta + downloadBtn + extra);
}

function spacingBox(s: Record<string, string>, displayInfo: any): string {
  const px = (v: string | undefined) => {
    if (!v || v === 'auto' || v === 'normal') return '-';
    const m = v.match(/^(-?\d+(?:\.\d+)?)/);
    if (!m) return '-';
    const n = parseFloat(m[1]);
    return n === 0 ? '0' : String(Math.round(n));
  };
  const mT = px(s.marginTop), mR = px(s.marginRight), mB = px(s.marginBottom), mL = px(s.marginLeft);
  const pT = px(s.paddingTop), pR = px(s.paddingRight), pB = px(s.paddingBottom), pL = px(s.paddingLeft);

  const w = displayInfo?.rect?.width ? Math.round(displayInfo.rect.width) : 0;
  const h = displayInfo?.rect?.height ? Math.round(displayInfo.rect.height) : 0;

  const fld = (prop: string, val: string, ariaLabel: string) =>
    '<input data-dm-prop="' + prop + '" data-dm-numeric="1" data-dm-unit="px" value="' + escapeAttr(val) + '" aria-label="' + ariaLabel + '" style="width:30px;height:18px;background:transparent;border:none;color:var(--dm-text-secondary);font-family:inherit;font-size:10px;text-align:center;outline:none;padding:0;border-radius:3px;" onfocus="this.style.background=\'var(--dm-input-bg)\';this.select()" onblur="this.style.background=\'transparent\'"/>';

  return '<div style="position:relative;background:var(--dm-bg-secondary);border:1px dashed var(--dm-separator-strong);border-radius:10px;padding:28px 32px;margin:6px 0 4px;">' +
    // Margin labels (centered on outer box edges)
    '<div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);">' + fld('marginTop', mT, 'Margin top') + '</div>' +
    '<div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);">' + fld('marginBottom', mB, 'Margin bottom') + '</div>' +
    '<div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);">' + fld('marginLeft', mL, 'Margin left') + '</div>' +
    '<div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);">' + fld('marginRight', mR, 'Margin right') + '</div>' +

    // Inner padding box
    '<div style="position:relative;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:8px;padding:24px 28px;">' +
    '<div style="position:absolute;top:3px;left:50%;transform:translateX(-50%);">' + fld('paddingTop', pT, 'Padding top') + '</div>' +
    '<div style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);">' + fld('paddingBottom', pB, 'Padding bottom') + '</div>' +
    '<div style="position:absolute;left:1px;top:50%;transform:translateY(-50%);">' + fld('paddingLeft', pL, 'Padding left') + '</div>' +
    '<div style="position:absolute;right:1px;top:50%;transform:translateY(-50%);">' + fld('paddingRight', pR, 'Padding right') + '</div>' +

    // Element dimensions display
    '<div style="background:var(--dm-text);color:var(--dm-bg);border-radius:5px;padding:7px 10px;text-align:center;font-size:10px;font-family:SF Mono,Monaco,monospace;font-weight:500;">' + w + ' × ' + h + '</div>' +
    '</div></div>';
}

/* ── Layout render helpers ── */
function renderMcpStatus(): string {
  let dotStyle = '', tooltipText = '', textColor = '';
  const isCloud = mcpMode === 'cloud' || mcpMode === 'self-hosted';
  const offlineHint = isCloud
    ? (mcpCloudToken
        ? 'Cloud relay unreachable. Click to retry. Check Settings → MCP for the server URL + token.'
        : 'No cloud token yet. Open Settings → MCP and click Connect to Cloud.')
    : 'MCP not running. Click to retry the connection.\n\nStart the server with `npm start --prefix packages/mcp-local`.';
  if (mcpState === 'offline') {
    dotStyle = 'width:7px;height:7px;border-radius:50%;background:var(--dm-text-muted);flex-shrink:0;';
    tooltipText = offlineHint;
    textColor = 'var(--dm-text-muted)';
  } else if (mcpState === 'running') {
    dotStyle = 'width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0;animation:dm-pulse 2s ease-in-out infinite;';
    tooltipText = isCloud
      ? 'Cloud relay connected. Side panel must stay open for agent calls to land.'
      : 'MCP server is running, but no agent is connected yet. Click to refresh.';
    textColor = '#22c55e';
  } else {
    dotStyle = 'width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,0.4);flex-shrink:0;';
    tooltipText = isCloud
      ? 'Cloud relay connected and serving an agent.'
      : 'MCP connected. Click to refresh status.';
    textColor = '#22c55e';
  }
  // The whole chip is now clickable — clicking it calls refreshMcpStatus()
  // which re-pings the content script + server. The icon to the right
  // signals refreshability without crowding the indicator with two
  // overlapping click targets.
  return '<button data-dm-action="refresh-mcp" style="display:flex;align-items:center;gap:5px;padding:4px 8px;background:var(--dm-bg-secondary);border:none;border-radius:6px;cursor:pointer;font-family:inherit;" title="' + escapeAttr(tooltipText) + '">' +
    '<span style="' + dotStyle + '"></span><span style="font-size:10px;color:' + textColor + ';font-weight:500;">MCP</span>' +
    '<span style="color:var(--dm-text-secondary);display:flex;padding:2px;">' + icon('rotateCw', 10) + '</span>' +
    '</button>';
}

function renderHeader(): string {
  const domain = pinnedDomain ? '<span style="font-size:11px;color:var(--dm-text-secondary);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(pinnedDomain) + '</span>' : '';
  const themeIcon = resolvedTheme === 'dark' ? 'sun' : 'moon';
  return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dm-separator-strong);flex-shrink:0;background:var(--dm-bg);position:sticky;top:0;z-index:10;">' +
    domain + '<div style="flex:1;"></div>' + renderMcpStatus() +
    '<button data-dm-action="toggle-theme" title="Toggle theme" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon(themeIcon as keyof typeof icons, 15) + '</button>' +
    '<button data-dm-action="settings" title="Settings" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('settings', 16) + '</button></div>';
}

function renderActionRow(): string {
  const dis = !info;
  const bs = (cc?: string, alwaysEnabled?: boolean) => {
    const d = alwaysEnabled ? false : dis;
    const c = d ? 'var(--dm-text-dim)' : (cc || 'var(--dm-text-secondary)');
    return 'background:' + (d ? 'var(--dm-btn-bg-disabled)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (d ? 'var(--dm-btn-border-disabled)' : 'var(--dm-btn-border)') + ';border-radius:5px;color:' + c + ';padding:5px 7px;cursor:' + (d ? 'default' : 'pointer') + ';display:flex;align-items:center;justify-content:center;opacity:' + (d ? '0.5' : '1') + ';pointer-events:' + (d ? 'none' : 'auto') + ';';
  };
  return '<div style="display:flex;align-items:center;gap:3px;padding:6px 12px;border-bottom:1px solid var(--dm-separator);flex-shrink:0;">' +
    '<button data-dm-action="select-parent" title="Parent" style="' + bs() + '">' + icon('arrowUp', 14) + '</button>' +
    '<button data-dm-action="select-child" title="Child" style="' + bs() + '">' + icon('arrowDown', 14) + '</button>' +
    '<div style="width:1px;height:16px;background:var(--dm-separator-strong);margin:0 2px;"></div>' +
    '<button data-dm-action="duplicate" title="Duplicate" style="' + bs() + '">' + icon('copy', 14) + '</button>' +
    '<button data-dm-action="delete" title="Remove" style="' + bs('var(--dm-danger)') + '">' + icon('trash', 14) + '</button>' +
    '<button data-dm-action="comment" title="Comment" style="' + bs() + '">' + icon('messageSquare', 14) + '</button>' +
    '<button data-dm-action="toggle-freeze" title="' + (animationsFrozen ? 'Resume animations' : 'Pause every animation, transition and video on the page') + '" style="' + bs(undefined, true) + ';' + (animationsFrozen ? 'color:var(--dm-accent);background:var(--dm-accent-bg);border-color:var(--dm-accent-border);' : '') + '">' + icon(animationsFrozen ? 'circlePlay' : 'circlePause', 14) + '</button>' +
    '<button data-dm-action="screenshot" title="Screenshot" style="' + bs(undefined, true) + '">' + icon('camera', 14) + '</button>' +
    '<div style="width:1px;height:16px;background:var(--dm-separator-strong);margin:0 2px;"></div>' +
    '<button data-dm-action="open-presets" title="Presets" style="' + bs(undefined, true) + ';' + (presetsOpen ? 'color:var(--dm-accent);background:var(--dm-accent-bg);border-color:var(--dm-accent-border);' : '') + '">' + icon('bookmark', 14) + '</button>' +
    '<div style="flex:1;"></div>' +
    '<button data-dm-action="undo" title="Undo (Ctrl+Z)" style="' + bs(undefined, true) + '">' + icon('undo', 14) + '</button>' +
    '<button data-dm-action="redo" title="Redo (Ctrl+Shift+Z)" style="' + bs(undefined, true) + ';transform:scaleX(-1);">' + icon('undo', 14) + '</button></div>';
}

function renderCommentCard(): string {
  if (!commentMode) return '';
  const isEditing = !!editingCommentId;
  const tagLabel = info ? '&lt;' + escapeAttr(info.tagName?.toLowerCase() || 'div') + '&gt;' : '';
  return '<div style="padding:10px 12px;border-bottom:1px solid var(--dm-separator-strong);background:var(--dm-purple-bg);">' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
    '<span style="color:var(--dm-purple);display:flex;">' + icon('messageSquare', 14) + '</span>' +
    '<span style="font-size:11px;font-weight:600;color:var(--dm-text);">' + (isEditing ? 'Edit Comment' : 'Add Comment') + '</span>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,monospace;">' + tagLabel + '</span></div>' +
    '<textarea data-dm-comment-input style="width:100%;min-height:60px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:6px;color:var(--dm-text);font-size:11px;padding:8px;outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;">' + escapeAttr(commentText) + '</textarea>' +
    '<div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">' +
    '<button data-dm-action="cancel-comment" style="padding:5px 12px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
    '<button data-dm-action="submit-comment" ' + (isEditing && !commentDirty ? 'disabled style="padding:5px 12px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.1);border-radius:5px;color:rgba(139,92,246,0.4);cursor:default;font-size:10px;font-weight:500;font-family:inherit;opacity:0.5;"' : 'style="padding:5px 12px;background:rgba(139,92,246,0.15);border:1px solid var(--dm-purple-border);border-radius:5px;color:var(--dm-purple);cursor:pointer;font-size:10px;font-weight:500;font-family:inherit;"') + '>' + (isEditing ? 'Save' : 'Add') + '</button></div></div>';
}

function renderTabs(): string {
  const tabs: { key: Tab; label: string; iconName: keyof typeof icons; badge?: number }[] = [
    { key: 'layers', label: 'Layers', iconName: 'layers' },
    { key: 'design', label: 'Design', iconName: 'sliders' },
    { key: 'changes', label: 'Changes', iconName: 'sparkles', badge: styleChanges.length + textChanges.length + domChanges.length + comments.length },
  ];
  return '<div style="display:flex;padding:4px 12px;gap:2px;border-bottom:1px solid var(--dm-separator);flex-shrink:0;">' +
    tabs.map(tt => {
      const a = tt.key === tab;
      const badgeHtml = tt.badge && tt.badge > 0 ? ' <span style="font-size:8px;background:var(--dm-success-bg);color:var(--dm-success);border-radius:8px;padding:1px 4px;">' + tt.badge + '</span>' : '';
      return '<button role="tab" aria-selected="' + a + '" data-dm-tab="' + tt.key + '" style="flex:1;padding:5px 2px;background:' + (a ? 'var(--dm-bg-active)' : 'transparent') + ';border:none;border-radius:5px;color:' + (a ? 'var(--dm-text)' : 'var(--dm-text-muted)') + ';cursor:pointer;font-size:10px;font-weight:' + (a ? '600' : '400') + ';font-family:inherit;display:flex;align-items:center;justify-content:center;gap:3px;">' + icon(tt.iconName, 11) + ' ' + tt.label + badgeHtml + '</button>';
    }).join('') + '</div>';
}

function renderStickyBottom(): string {
  const hasChanges = styleChanges.length > 0 || textChanges.length > 0 || domChanges.length > 0 || comments.length > 0;
  const copyDis = previewingOriginal || !hasChanges;
  // Send-to-Agent gating is independent of changes: even if there's
  // something to send, MCP must be both running and connected to an
  // agent. The tooltip names the specific blocker so the user knows
  // whether to start the server (`offline`) or connect a coding agent
  // (`running`).
  const sendDis = previewingOriginal || !hasChanges || mcpState !== 'connected';
  let sendTitle = 'Send these changes to a connected coding agent';
  if (mcpState === 'offline') sendTitle = 'MCP server is not running. Start it to enable Send to Agent.';
  else if (mcpState === 'running') sendTitle = 'MCP server is running but no coding agent is connected.';
  else if (previewingOriginal) sendTitle = 'Disable “Preview original” first.';
  else if (!hasChanges) sendTitle = 'No changes to send.';
  const copyTitle = previewingOriginal ? 'Disable “Preview original” first.' : !hasChanges ? 'No changes to copy.' : 'Copy as prompt to clipboard';
  const copyS = 'flex:1;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:500;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;' +
    (copyDis ? 'background:var(--dm-btn-bg-disabled);border:1px solid var(--dm-btn-border-disabled);color:var(--dm-text-dim);cursor:default;opacity:0.5;pointer-events:none;' : 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);cursor:pointer;');
  // pointer-events:auto on the disabled send button so hover/title still
  // works — the click handler is the gate, not CSS.
  const sendS = 'flex:1;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:500;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;' +
    (sendDis ? 'background:var(--dm-btn-bg-disabled);border:1px solid var(--dm-btn-border-disabled);color:var(--dm-text-dim);cursor:not-allowed;opacity:0.5;' : 'background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);color:var(--dm-accent);cursor:pointer;');
  return '<div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--dm-separator-strong);flex-shrink:0;background:var(--dm-bg);position:sticky;bottom:0;z-index:10;">' +
    '<button id="dm-copy-prompt-btn" data-dm-action="copy-prompt" title="' + escapeAttr(copyTitle) + '" style="' + copyS + '">' + icon('clipboard', 13) + ' Copy Prompt</button>' +
    '<button id="dm-send-agent-btn" data-dm-action="send-to-agent"' + (sendDis ? ' disabled aria-disabled="true"' : '') + ' title="' + escapeAttr(sendTitle) + '" style="' + sendS + '">' + icon('send', 13) + ' Send to Agent</button></div>';
}

/* ── Phase 2: Layers Tab ── */
function renderLayersTab(): string {
  if (domTree.length === 0) return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('crosshair', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">Click the inspector icon to start selecting elements</div></div>';

  const selectedId = info?.id || '';
  const visible = getVisibleLayers();

  // Search bar + multi-select toggle. Off by default; flipping it on lets
  // clicks in the page or the layers list ADD elements to a selection set.
  // Shows a count badge while active so the user always knows the size.
  const msActive = multiSelectActive;
  const msCount = multiSelectIds.length;
  const msTitle = msActive
    ? `Multi-select on — ${msCount} layer${msCount === 1 ? '' : 's'}. Click to exit.`
    : 'Multi-select: pick many layers and apply one edit to all of them.';
  const msBtn =
    '<button data-dm-action="toggle-multi-select" title="' + escapeAttr(msTitle) + '" style="display:flex;align-items:center;gap:4px;padding:6px 9px;background:' + (msActive ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (msActive ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';border-radius:6px;color:' + (msActive ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;font-size:10px;font-family:inherit;flex-shrink:0;">' +
    icon('layers', 12) +
    '<span>Multi-select</span>' +
    (msActive && msCount > 0 ? '<span style="font-weight:700;background:var(--dm-accent);color:white;border-radius:9999px;padding:0 6px;font-size:9px;line-height:14px;">' + msCount + '</span>' : '') +
    '</button>';
  const searchBar = '<div style="padding:8px 12px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;gap:6px;">' +
    '<div style="position:relative;flex:1;min-width:0;">' +
    '<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--dm-text-dim);display:flex;pointer-events:none;">' + icon('search', 12) + '</span>' +
    '<input type="text" class="dm-layer-search" data-dm-layer-search placeholder="Search layers..." value="' + escapeAttr(layerSearch) + '"/></div>' +
    msBtn +
    '</div>';

  // Visibility / state filter chips. Each chip carries a count badge so
  // the user can see at a glance which buckets have entries.
  const counts = {
    all: domTree.length,
    visible: domTree.filter(n => n.isVisible).length,
    hidden: domTree.filter(n => !n.isVisible).length,
    modified: domTree.filter(n => elementHasChanges(n.id)).length,
  };
  const fchip = (f: LayersFilter, label: string) => {
    const active = layersFilter === f;
    return '<button data-dm-layers-filter="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') +
      ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-separator)') +
      ';border-radius:9999px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') +
      ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' +
      label + ' <span style="opacity:0.6;">' + counts[f] + '</span></button>';
  };
  const filterChipsRow = '<div style="display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dm-separator);flex-wrap:wrap;">' +
    fchip('all', 'All') + fchip('visible', 'Visible') + fchip('hidden', 'Hidden') + fchip('modified', 'Modified') +
    '</div>';

  // Bulk-action toolbar — shows when multi-select has 2+ layers. Each
  // action operates on every selected layer at once.
  const bulkBar = (msActive && msCount >= 2) ? (
    '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dm-separator);background:var(--dm-accent-bg);">' +
      '<span style="font-size:9px;color:var(--dm-accent);font-weight:600;align-self:center;margin-right:4px;">' + msCount + ' selected:</span>' +
      '<button data-dm-bulk-action="show-all" title="Make all visible" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('eye', 10) + ' Show</button>' +
      '<button data-dm-bulk-action="hide-all" title="Hide all" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('eyeOff', 10) + ' Hide</button>' +
      '<button data-dm-bulk-action="lock-all" title="Lock all" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('pin', 10) + ' Lock</button>' +
      '<button data-dm-bulk-action="unlock-all" title="Unlock all" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">Unlock</button>' +
      '<button data-dm-bulk-action="duplicate-all" title="Duplicate all" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('copy', 10) + ' Duplicate</button>' +
      '<button data-dm-bulk-action="delete-all" title="Delete all" style="padding:3px 8px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:4px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('trash', 10) + ' Delete</button>' +
      '<button data-dm-bulk-action="clear-selection" title="Exit multi-select" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;margin-left:auto;">' + icon('x', 10) + ' Clear</button>' +
    '</div>'
  ) : '';

  const nodeMapForDim = buildNodeMap();
  const dimmedByAncestor = new Set<string>();
  for (const n of visible) {
    let pid = n.parentId;
    while (pid) {
      const parent = nodeMapForDim.get(pid);
      if (!parent) break;
      if (!parent.isVisible) { dimmedByAncestor.add(n.id); break; }
      pid = parent.parentId;
    }
  }

  const multiSet = new Set(multiSelectIds);
  const rows = visible.map(n => {
    const indent = n.depth * 16;
    const isSel = n.id === selectedId;
    const isHov = n.id === hoveredLayerId;
    const isMulti = multiSet.has(n.id);
    const isLocked = lockedLayerIds.has(n.id);
    const isRenaming = renamingLayerId === n.id;
    const hasChanges = elementHasChanges(n.id);
    const overrideName = layerNameOverrides.get(n.id);
    // Display name precedence: user rename > component name > smart name.
    const displayName = overrideName || n.componentName || n.displayName;
    const bg = isSel ? 'var(--dm-accent-bg)' : isMulti ? 'var(--dm-accent-bg)' : isHov ? 'var(--dm-bg-secondary)' : 'transparent';

    // Chevron for expand/collapse
    const isCollapsed = collapsedNodes.has(n.id);
    let chevron = '<span style="width:14px;flex-shrink:0;"></span>';
    if (n.childCount > 0) {
      const chevIcon = isCollapsed ? 'chevronRight' : 'chevronDown';
      chevron = '<span data-dm-toggle-collapse="' + n.id + '" style="color:var(--dm-text-dim);display:flex;cursor:pointer;flex-shrink:0;width:14px;align-items:center;justify-content:center;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>';
    }

    // Tag icon — components get a special component icon; shadow-roots
    // get the box-stack icon; pseudo-elements get a small letter-glyph.
    const tagIconName: keyof typeof icons = n.componentName
      ? 'component'
      : n.containerKind === 'shadow'
        ? 'squareStack'
        : n.containerKind === 'pseudo'
          ? 'sparkles'
          : (TAG_ICON_MAP[n.tagName] || 'box');
    const tagIcon = '<span style="color:' + (isSel ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';display:flex;flex-shrink:0;">' + icon(tagIconName, 10) + '</span>';

    // Indentation guides
    let guides = '';
    for (let d = 1; d <= n.depth; d++) {
      guides += '<span class="dm-indent-guide" style="left:' + (4 + (d - 1) * 16 + 7) + 'px;"></span>';
    }

    // Drag handle — disabled if the layer is locked.
    const dragHandle = isLocked
      ? '<span class="dm-layer-drag" title="Locked — unlock to drag" style="color:var(--dm-text-dimmer);display:flex;flex-shrink:0;opacity:0.4;cursor:not-allowed;">' + icon('gripVertical', 12) + '</span>'
      : '<span class="dm-layer-drag" style="color:var(--dm-text-dimmer);display:flex;cursor:grab;flex-shrink:0;">' + icon('gripVertical', 12) + '</span>';

    // Hover actions — visibility, scroll-into-view, lock toggle, rename.
    const hoverActions = '<span class="dm-layer-hover-actions" style="display:flex;gap:2px;margin-left:auto;flex-shrink:0;">' +
      '<button data-dm-rename-layer="' + n.id + '" title="Rename layer" aria-label="Rename" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:2px;">' + icon('pencil', 11) + '</button>' +
      '<button data-dm-scroll-to="' + n.id + '" title="Scroll page to this layer" aria-label="Scroll to layer" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:2px;">' + icon('target', 11) + '</button>' +
      '<button data-dm-toggle-lock="' + n.id + '" title="' + (isLocked ? 'Unlock' : 'Lock — prevents selection / drag') + '" aria-label="Toggle lock" style="background:none;border:none;color:' + (isLocked ? 'var(--dm-accent)' : 'var(--dm-text-muted)') + ';cursor:pointer;display:flex;padding:2px;">' + icon(isLocked ? 'pin' : 'pin', 11) + '</button>' +
      '<button data-dm-toggle-vis="' + n.id + '" title="Toggle visibility" aria-label="Toggle visibility" style="background:none;border:none;color:' + (n.isVisible ? 'var(--dm-text-muted)' : 'var(--dm-accent)') + ';cursor:pointer;display:flex;padding:2px;">' + icon(n.isVisible ? 'eye' : 'eyeOff', 12) + '</button></span>';

    const tagColor = isSel ? 'var(--dm-accent)' : 'var(--dm-text-secondary)';
    const borderColor = isSel ? 'var(--dm-accent)' : (isMulti ? 'var(--dm-accent-border)' : 'transparent');
    const multiBadge = isMulti && !isSel
      ? '<span title="Part of multi-select" style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('checkSquare', 11) + '</span>'
      : '';
    // Tracked-change indicator dot — shown when the element has any
    // tracked change (style / text / DOM / comment). Click does nothing
    // beyond the row's own select handler.
    const changeDot = hasChanges
      ? '<span title="This layer has tracked changes" style="width:6px;height:6px;border-radius:50%;background:var(--dm-accent);flex-shrink:0;display:inline-block;"></span>'
      : '';
    // Comment-count chip — small `💬 N` next to the change dot when this
    // layer has at least one comment.
    const commentCount = comments.filter(cc => cc.elementId === n.id).length;
    const commentChip = commentCount > 0
      ? '<span title="' + commentCount + ' comment' + (commentCount === 1 ? '' : 's') + ' on this layer" style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;border-radius:9999px;background:rgba(251,191,36,0.18);color:#92400e;font-size:9px;font-weight:600;flex-shrink:0;font-family:SF Mono,Monaco,monospace;">' + icon('messageSquare', 8) + ' ' + commentCount + '</span>'
      : '';
    // Lock badge — small lock icon when locked, even outside hover.
    const lockBadge = isLocked
      ? '<span title="Locked" style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('pin', 10) + '</span>'
      : '';
    // Container-kind badge — surfaces shadow / iframe / pseudo subtrees.
    const containerBadge = n.containerKind === 'shadow'
      ? '<span title="Shadow DOM (open)" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(139,92,246,0.18);color:var(--dm-purple);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">shadow</span>'
      : n.containerKind === 'iframe'
        ? '<span title="Same-origin iframe" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(245,158,11,0.18);color:#f59e0b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">iframe</span>'
        : n.containerKind === 'pseudo'
          ? '<span title="CSS pseudo-element" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(20,184,166,0.18);color:rgb(20,184,166);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">pseudo</span>'
          : '';
    // Z-index chip — surfaces non-default stacking contexts.
    const zChip = n.zIndex
      ? '<span title="z-index: ' + escapeAttr(n.zIndex) + '" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(0,0,0,0.06);color:var(--dm-text-dim);font-weight:600;flex-shrink:0;font-family:SF Mono,Monaco,monospace;">z:' + escapeAttr(n.zIndex) + '</span>'
      : '';
    // Color swatch — when the layer has a non-transparent background colour.
    const colorSwatch = n.backgroundColor
      ? '<span title="background: ' + escapeAttr(n.backgroundColor) + '" style="width:10px;height:10px;border-radius:2px;background:' + escapeAttr(n.backgroundColor) + ';border:1px solid var(--dm-separator);flex-shrink:0;display:inline-block;"></span>'
      : '';
    // Component subtitle — when source detection found a React/Vue/etc.
    // component, the row reads "ComponentName" with the html tag fading
    // out as a smaller pill on the right.
    const tagSubtitle = n.componentName
      ? '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;opacity:0.7;">' + escapeAttr('<' + n.tagName + '>') + '</span>'
      : '';

    // Name cell — either an inline rename input, or the static label.
    const nameCell = isRenaming
      ? '<input type="text" class="dm-input dm-layer-rename-input" data-dm-layer-rename-input="' + n.id + '" value="' + escapeAttr(overrideName || n.displayName) + '" autofocus style="font-size:11px;font-family:SF Mono,Monaco,monospace;padding:2px 4px;border:1px solid var(--dm-accent-border);border-radius:3px;background:var(--dm-bg);color:var(--dm-text);flex:1;min-width:0;"/>'
      : '<span data-dm-layer-name="' + n.id + '" style="font-size:11px;color:' + tagColor + ';font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;' + (overrideName ? 'font-style:italic;' : '') + '">' + escapeAttr(displayName) + '</span>';

    return '<div class="dm-layer-item" data-dm-layer="' + n.id + '"' + (isLocked ? '' : ' draggable="true"') + ' data-dm-layer-drag="' + n.id + '" style="display:flex;align-items:center;gap:3px;padding:3px 6px 3px ' + (4 + indent) + 'px;background:' + bg + ';cursor:' + (isLocked ? 'not-allowed' : 'pointer') + ';border-left:2px solid ' + borderColor + ';position:relative;min-height:30px;opacity:' + (!n.isVisible || dimmedByAncestor.has(n.id) ? '0.4' : '1') + ';" title="' + escapeAttr(displayName + (isLocked ? ' (locked)' : '')) + '">' +
      guides + dragHandle + chevron + tagIcon + colorSwatch + multiBadge + lockBadge + containerBadge + changeDot + commentChip +
      nameCell +
      tagSubtitle + zChip +
      hoverActions + '</div>';
  }).join('');

  return searchBar + filterChipsRow + bulkBar + '<div style="overflow-y:auto;">' + rows + '</div>';
}

// Layer kind classifier — what sections in the design panel should show.
// Plain CSS is permissive (any element can take any property), but the side
// panel becomes noisy if it offers Typography on an `<img>` or Layout on a
// `<br>`. This narrows each section to elements where the property class
// actually does something useful.
type LayerKind = 'text' | 'container' | 'media' | 'svg' | 'form' | 'void' | 'page' | 'unknown';
function classifyTag(tag: string): LayerKind {
  const t = (tag || '').toLowerCase();
  if (t === 'body' || t === 'html') return 'page';
  if (['h1','h2','h3','h4','h5','h6','p','span','a','button','label','li','td','th','dd','dt','blockquote','code','pre','em','strong','b','i','small','mark','q','cite','abbr','figcaption','caption'].includes(t)) return 'text';
  if (['img','video','audio','picture','source','iframe','canvas','embed','object'].includes(t)) return 'media';
  if (['svg','use','path','circle','rect','line','polygon','polyline','g','defs','symbol'].includes(t)) return 'svg';
  if (['input','textarea','select','option','optgroup','progress','meter'].includes(t)) return 'form';
  if (['div','section','main','article','aside','header','footer','nav','ul','ol','dl','form','fieldset','figure','table','tr','tbody','thead','tfoot','details','summary'].includes(t)) return 'container';
  if (['br','hr','wbr','meta','link','script','style','head','title','base','col','colgroup'].includes(t)) return 'void';
  return 'unknown';
}

interface SectionVisibility {
  position: boolean;
  layout: boolean;
  appearance: boolean;
  typography: boolean;
  fill: boolean;
  stroke: boolean;
  effects: boolean;
}
function visibleSections(kind: LayerKind): SectionVisibility {
  // Mirrors Figma: each kind exposes only the sections that make sense.
  if (kind === 'void') {
    return { position: true, layout: false, appearance: true, typography: false, fill: false, stroke: false, effects: false };
  }
  if (kind === 'media' || kind === 'svg') {
    return { position: true, layout: false, appearance: true, typography: false, fill: true, stroke: true, effects: true };
  }
  if (kind === 'form') {
    return { position: true, layout: false, appearance: true, typography: true, fill: true, stroke: true, effects: true };
  }
  if (kind === 'page') {
    return { position: false, layout: true, appearance: true, typography: false, fill: true, stroke: false, effects: false };
  }
  if (kind === 'container') {
    return { position: true, layout: true, appearance: true, typography: false, fill: true, stroke: true, effects: true };
  }
  // 'text' (and 'unknown' as a permissive default) — full kit including Typography.
  return { position: true, layout: true, appearance: true, typography: true, fill: true, stroke: true, effects: true };
}

/* ── Phase 3: Design Tab ── */
let pageContextInflight = false; // prevents duplicate SP_INSPECT_PAGE while one is in flight
function renderDesignTab(): string {
  const displayInfo = info ?? hoverInfo;
  const isHovering = !info && !!hoverInfo;

  // Nothing selected → treat the page (<body>) as the implicit context. The
  // first render with no selection fires SP_INSPECT_PAGE which makes the
  // content script silently set body as the selected element and ship its
  // info back; subsequent renders use it like any other selection.
  if (!displayInfo) {
    if (!pageContextInflight) {
      pageContextInflight = true;
      send({ type: 'SP_INSPECT_PAGE' }).then(r => {
        pageContextInflight = false;
        if (r?.payload && !info && !hoverInfo) { info = r.payload; render(); }
      });
    }
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('crosshair', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">Loading page context…</div><div style="font-size:11px;margin-top:4px;color:var(--dm-text-dim);">Hover any element to focus on it.</div></div>';
  }

  const s = displayInfo.computedStyles;
  const tag = displayInfo.tagName?.toLowerCase() || 'div';
  const isImg = tag === 'img';
  const kind = classifyTag(tag);
  const vis = visibleSections(kind);
  const isPageContext = kind === 'page' && !isHovering;

  // Hover/Selected indicator. In multi-select mode, append a count chip and
  // a hint that style edits will fan out to every selected element. CSS
  // button (computed-styles viewer) lives on the right of this row — it's
  // contextual to the selected layer, so disable when nothing is selected.
  const multiBadge = multiSelectActive && multiSelectIds.length > 0
    ? '<span style="font-size:9px;padding:2px 8px;background:var(--dm-accent-bg);color:var(--dm-accent);border:1px solid var(--dm-accent-border);border-radius:9999px;font-weight:600;flex-shrink:0;" title="Style edits will apply to all ' + multiSelectIds.length + ' selected elements">' + multiSelectIds.length + ' selected</span>'
    : '';
  const cssBtnDisabled = !info; // hover-only state still shouldn't trigger a "view computed CSS" of a fleeting hover
  const cssBtn = '<button data-dm-action="view-computed-css"' + (cssBtnDisabled ? ' disabled' : '') + ' title="' + (cssBtnDisabled ? 'Select a layer to view its computed CSS' : 'View computed CSS for the selected layer') + '" style="display:flex;align-items:center;gap:4px;padding:3px 8px;background:' + (cssBtnDisabled ? 'var(--dm-btn-bg-disabled)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (cssBtnDisabled ? 'var(--dm-btn-border-disabled)' : 'var(--dm-btn-border)') + ';border-radius:5px;color:' + (cssBtnDisabled ? 'var(--dm-text-dim)' : 'var(--dm-text-secondary)') + ';cursor:' + (cssBtnDisabled ? 'default' : 'pointer') + ';font-size:10px;font-family:inherit;flex-shrink:0;opacity:' + (cssBtnDisabled ? '0.5' : '1') + ';">' + icon('code', 11) + '<span>CSS</span></button>';
  // Indicator label: "Page" when body/html is the implicit context (no real
  // selection), "Hovering" while hovering, otherwise "Selected".
  const indicatorLeft = isPageContext
    ? '<span class="dm-hover-indicator selected">' + icon('panelRight', 8) + ' Page</span>'
    : isHovering
      ? '<span class="dm-hover-indicator hovering">' + icon('eye', 8) + ' Hovering</span>'
      : '<span class="dm-hover-indicator selected">' + icon('crosshair', 8) + ' Selected</span>';
  const indicator =
    '<div style="padding:6px 12px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;gap:6px;">' +
    indicatorLeft +
    '<span style="font-size:10px;color:var(--dm-text-dim);font-family:SF Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">&lt;' + escapeAttr(tag) + '&gt;</span>' +
    multiBadge + cssBtn + '</div>';

  // Text content editing — show for ANY text-tagged layer (the same set whose
  // Layers icon is the "T"/type glyph). Editing a text element with children
  // will replace its inner content, so we surface a one-line warning when that
  // would happen instead of hiding the field entirely.
  const directTextTags = ['p','h1','h2','h3','h4','h5','h6','span','a','li','td','th','label','button','strong','em','b','i','small','mark','figcaption','caption','dt','dd','abbr','cite','q','code','pre','blockquote'];
  const isTextTag = directTextTags.includes(tag);
  const showTextEdit = isTextTag && !!displayInfo.textContent;
  const textVal = displayInfo.textContent || '';
  // The rich-text editor preserves HTML structure (headings/links/spans),
  // so the old "saves will flatten children" warning no longer applies.
  const textWarning = '';
  // Rich-text editor: contenteditable div seeded with the element's
  // innerHTML so bold/italic/links round-trip. Toolbar drives
  // document.execCommand on the focused editor; native Cmd/Ctrl+B / Cmd+I /
  // Cmd+U also Just Work because contenteditable owns those shortcuts.
  // Save fires on blur so the user doesn't need a Save button.
  const richHtml = (displayInfo as any).innerHTML || textVal;
  const tbBtn = (cmd: string, label: string, title: string) =>
    '<button data-dm-richtext-cmd="' + cmd + '" title="' + title + '" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;min-width:22px;">' + label + '</button>';
  const richToolbar =
    '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px;">' +
    '<button data-dm-richtext-cmd="bold" title="Bold (⌘B)" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('bold', 11) + '</button>' +
    '<button data-dm-richtext-cmd="italic" title="Italic (⌘I)" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('italic', 11) + '</button>' +
    '<button data-dm-richtext-cmd="underline" title="Underline (⌘U)" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('underline', 11) + '</button>' +
    '<button data-dm-richtext-cmd="strikeThrough" title="Strikethrough" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('strikethrough', 11) + '</button>' +
    '<div style="width:1px;background:var(--dm-separator);margin:2px 4px;"></div>' +
    tbBtn('insertUnorderedList', '• List', 'Bulleted list') +
    tbBtn('insertOrderedList', '1. List', 'Numbered list') +
    '<div style="width:1px;background:var(--dm-separator);margin:2px 4px;"></div>' +
    tbBtn('createLink', '🔗', 'Link the selected text (you\'ll be prompted for URL)') +
    tbBtn('removeFormat', '⨯ fmt', 'Strip all formatting') +
    '</div>';
  const textField = showTextEdit
    ? '<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">' +
      '<label style="font-size:9px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Text Content</label>' +
      richToolbar +
      '<div data-dm-richtext contenteditable="true" class="dm-input" style="width:100%;min-height:88px;font-family:inherit;font-size:13px;line-height:1.5;padding:8px;box-sizing:border-box;outline:none;overflow-y:auto;max-height:280px;" spellcheck="false">' + richHtml + '</div>' +
      textWarning +
      '</div>'
    : '';

  // Smart section defaults (Phase 3D)
  const positionDefault = (s.position === 'static' || !s.position) ? false : true;
  const hasEffects = (s.boxShadow && s.boxShadow !== 'none') || (s.textShadow && s.textShadow !== 'none') ||
    (s.filter && s.filter !== 'none') || (s.backdropFilter && s.backdropFilter !== 'none') ||
    (s.transition && s.transition !== 'none') || (s.animation && s.animation !== 'none');

  // Source detection still runs in the background and rides along on the
  // ELEMENT_SELECTED payload (see content/index.ts and source-detection.ts)
  // so Copy Prompt can include a file:line hint for the agent. The Design
  // tab itself is framework-neutral — no Component section is rendered,
  // because that section was inherently React-specific.

  // Icon section for SVG/icon elements
  const iconInfo = (displayInfo as any).iconInfo;
  const iconSection = iconInfo ? sec('Icon', 'penTool',
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
    '<span style="font-size:10px;color:var(--dm-text-secondary);">Library:</span>' +
    '<span style="font-size:10px;font-weight:600;color:var(--dm-accent);">' + escapeAttr(iconInfo.library) + '</span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<span style="font-size:10px;color:var(--dm-text-secondary);">Icon:</span>' +
    (iconInfo.availableIcons && iconInfo.availableIcons.length > 1
      ? '<select class="dm-select" data-dm-icon-replace style="flex:1;min-width:0;">' +
        iconInfo.availableIcons.map((ic: string) => '<option value="' + escapeAttr(ic) + '"' + (ic === 'lucide-' + iconInfo.name || ic === iconInfo.name ? ' selected' : '') + '>' + ic.replace('lucide-', '') + '</option>').join('') + '</select>'
      : '<span style="font-size:11px;font-family:SF Mono,Monaco,monospace;color:var(--dm-text);">' + escapeAttr(iconInfo.name) + '</span>') +
    '</div>'
  ) : '';

  // Typography section — Figma-style: family / weight / size / spacing
  // controls then style toggles, casing, alignment, and list rows.
  const fontWeightCur = s.fontWeight || '400';
  const isBold = fontWeightCur === 'bold' || (parseInt(fontWeightCur, 10) || 400) >= 600;
  const fontStyleCur = s.fontStyle || 'normal';
  const decoCur = s.textDecorationLine || 'none';
  const txAlign = s.textAlign || 'left';
  const txCase = s.textTransform || 'none';
  const lstStyle = (s as any).listStyleType || 'none';
  const inputWithIcon = (iconName: keyof typeof icons, prop: string, value: string, kw: string, unit: string, title: string): string =>
    '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;" title="' + escapeAttr(title) + '">' + icon(iconName, 11) + '</label>' +
    inpKw('', prop, value, unit, kw).replace(/<label[^>]*><\/label>/, '') +
    '</div>';
  // Typography Advanced — decoration cluster, wrapping/whitespace, indent/clamp,
  // i18n direction, font features, rendering. Mirrors the Position pattern:
  // primary rows stay clean and Figma-style; deeper CSS is one click away.
  const typographyAdvOpen = !!advancedOpen.typography;
  const lineClampRaw = (s as any).webkitLineClamp || '';
  const lineClampNum = parseInt(lineClampRaw, 10);
  const lineClampVal = isFinite(lineClampNum) && lineClampNum > 0 ? String(lineClampNum) : '';
  const typographyAdvancedHtml = advancedDisclosure('typography', typographyAdvOpen,
    sub('Decoration') +
    grid12([
      { span: 4, content: sel('Style', 'textDecorationStyle', (s as any).textDecorationStyle || 'solid', ['solid','double','dotted','dashed','wavy']) },
      { span: 4, content: inp('Color', 'textDecorationColor', (s as any).textDecorationColor || 'currentColor', '') },
      { span: 4, content: inp('Thickness', 'textDecorationThickness', (s as any).textDecorationThickness || 'auto') },
    ]) + sp() +
    grid12([
      { span: 4, content: inp('U. offset', 'textUnderlineOffset', (s as any).textUnderlineOffset || 'auto') },
      { span: 4, content: sel('U. position', 'textUnderlinePosition', (s as any).textUnderlinePosition || 'auto', ['auto','under','from-font','left','right']) },
      { span: 4, content: sel('Skip ink', 'textDecorationSkipInk', (s as any).textDecorationSkipInk || 'auto', ['auto','none','all']) },
    ]) + sp() +

    sub('Wrapping') +
    grid12([
      { span: 6, content: sel('White space', 'whiteSpace', s.whiteSpace || 'normal', ['normal','nowrap','pre','pre-wrap','pre-line','break-spaces']) },
      { span: 6, content: sel('Text wrap', 'textWrap', (s as any).textWrap || 'wrap', ['wrap','nowrap','balance','pretty','stable']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Word break', 'wordBreak', (s as any).wordBreak || 'normal', ['normal','break-all','keep-all','break-word']) },
      { span: 6, content: sel('Overflow wrap', 'overflowWrap', (s as any).overflowWrap || 'normal', ['normal','break-word','anywhere']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Hyphens', 'hyphens', (s as any).hyphens || 'manual', ['none','manual','auto']) },
      { span: 6, content: sel('Justify', 'textJustify', (s as any).textJustify || 'auto', ['auto','inter-word','inter-character','none']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Last line', 'textAlignLast', (s as any).textAlignLast || 'auto', ['auto','start','end','left','right','center','justify']) },
      { span: 6, content: sel('Line break', 'lineBreak', (s as any).lineBreak || 'auto', ['auto','loose','normal','strict','anywhere']) },
    ]) + sp() +

    sub('Layout in text') +
    grid12([
      { span: 4, content: inp('Indent', 'textIndent', (s as any).textIndent || '0px') },
      { span: 4, content: inp('Tab size', 'tabSize', (s as any).tabSize || '8', '') },
      { span: 4, content: inp('Word space', 'wordSpacing', (s as any).wordSpacing || 'normal') },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Vertical align', 'verticalAlign', (s as any).verticalAlign || 'baseline', ['baseline','top','middle','bottom','sub','super','text-top','text-bottom']) },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Line clamp', '__line_clamp', lineClampVal || '0', '') },
      { span: 6, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;visibility:hidden;">_</label><button class="dm-icon-row-button" data-dm-typo-action="truncate" title="Truncate (text-overflow: ellipsis + white-space: nowrap + overflow: hidden)" style="width:100%;height:30px;padding:6px;font-size:11px;">Truncate</button></div>' },
    ]) + sp() +

    sub('Direction (i18n)') +
    grid12([
      { span: 6, content: sel('Direction', 'direction', (s as any).direction || 'ltr', ['ltr','rtl']) },
      { span: 6, content: sel('Writing mode', 'writingMode', (s as any).writingMode || 'horizontal-tb', ['horizontal-tb','vertical-rl','vertical-lr','sideways-rl','sideways-lr']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Unicode bidi', 'unicodeBidi', (s as any).unicodeBidi || 'normal', ['normal','embed','isolate','bidi-override','isolate-override','plaintext']) },
    ]) + sp() +

    sub('Font features') +
    grid12([
      { span: 6, content: inp('Stretch', 'fontStretch', (s as any).fontStretch || '100%', '%') },
      { span: 6, content: inp('Size adjust', 'fontSizeAdjust', (s as any).fontSizeAdjust || 'none', '') },
    ]) + sp() +
    grid12([
      { span: 4, content: sel('Kerning', 'fontKerning', (s as any).fontKerning || 'auto', ['auto','normal','none']) },
      { span: 4, content: sel('Optical', 'fontOpticalSizing', (s as any).fontOpticalSizing || 'auto', ['auto','none']) },
      { span: 4, content: sel('Synthesis', 'fontSynthesis', (s as any).fontSynthesis || 'weight style small-caps', ['weight style small-caps','none','weight','style','small-caps']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Caps', 'fontVariantCaps', (s as any).fontVariantCaps || 'normal', ['normal','small-caps','all-small-caps','petite-caps','all-petite-caps','unicase','titling-caps']) },
      { span: 6, content: sel('Position', 'fontVariantPosition', (s as any).fontVariantPosition || 'normal', ['normal','sub','super']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Numeric', 'fontVariantNumeric', (s as any).fontVariantNumeric || 'normal', ['normal','ordinal','slashed-zero','lining-nums','oldstyle-nums','proportional-nums','tabular-nums','diagonal-fractions','stacked-fractions']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Ligatures', 'fontVariantLigatures', (s as any).fontVariantLigatures || 'normal', ['normal','none','common-ligatures','no-common-ligatures','discretionary-ligatures','no-discretionary-ligatures','historical-ligatures','no-historical-ligatures','contextual','no-contextual']) },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('Feature settings', 'fontFeatureSettings', (s as any).fontFeatureSettings || 'normal', '') },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('Variation settings', 'fontVariationSettings', (s as any).fontVariationSettings || 'normal', '') },
    ]) + sp() +

    sub('List') +
    grid12([
      { span: 6, content: sel('List position', 'listStylePosition', (s as any).listStylePosition || 'outside', ['outside','inside']) },
      { span: 6, content: inp('List image', 'listStyleImage', (s as any).listStyleImage || 'none', '') },
    ]) + sp() +

    sub('Rendering') +
    grid12([
      { span: 12, content: sel('Text rendering', 'textRendering', (s as any).textRendering || 'auto', ['auto','optimizeSpeed','optimizeLegibility','geometricPrecision']) },
    ])
  );

  const typographyActionsHtml = advancedToggleBtn('typography', typographyAdvOpen);

  const typographySection = !vis.typography ? '' : sec('Typography', 'type', textField +
    renderFontFamilyPicker(s.fontFamily || '') + sp() +
    grid(2, selKV('Weight', 'fontWeight', fontWeightCur, FONT_WEIGHTS), inp('Size', 'fontSize', s.fontSize || '16px')) + sp() +
    grid(2,
      inputWithIcon('moveVertical', 'lineHeight', s.lineHeight || 'normal', 'normal', '', 'Line height'),
      inputWithIcon('moveHorizontal', 'letterSpacing', s.letterSpacing || 'normal', 'normal', 'px', 'Letter spacing')
    ) + sp() +
    colorInp('Color', 'color', s.color || '#000') + sp() +
    // Style + case row — 8 buttons across the full width (1.5 of 12 cols each).
    // Bold | Italic | Underline | Strikethrough | None | UPPER | lower | Title.
    iconButtonRow([
      { icon: 'bold', attr: 'data-dm-text-toggle="bold"', active: isBold, title: 'Bold' },
      { icon: 'italic', attr: 'data-dm-text-toggle="italic"', active: fontStyleCur === 'italic', title: 'Italic' },
      { icon: 'underline', attr: 'data-dm-text-toggle="underline"', active: decoCur.includes('underline'), title: 'Underline' },
      { icon: 'strikethrough', attr: 'data-dm-text-toggle="strikethrough"', active: decoCur.includes('line-through'), title: 'Strikethrough' },
      { icon: 'minus', attr: 'data-dm-prop="textTransform" data-dm-value="none"', active: txCase === 'none', title: 'No case' },
      { icon: 'caseUpper', attr: 'data-dm-prop="textTransform" data-dm-value="uppercase"', active: txCase === 'uppercase', title: 'UPPERCASE' },
      { icon: 'caseLower', attr: 'data-dm-prop="textTransform" data-dm-value="lowercase"', active: txCase === 'lowercase', title: 'lowercase' },
      { icon: 'caseSensitive', attr: 'data-dm-prop="textTransform" data-dm-value="capitalize"', active: txCase === 'capitalize', title: 'Title Case' },
    ]) + sp() +
    // Alignment + list row — half each. Left half = 4 align buttons (1.5 of 12
    // cols each); right half = 3 list buttons (2 of 12 cols each).
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
      iconButtonRow([
        { icon: 'textAlignStart', attr: 'data-dm-prop="textAlign" data-dm-value="left"', active: txAlign === 'left' || txAlign === 'start', title: 'Align left' },
        { icon: 'textAlignCenter', attr: 'data-dm-prop="textAlign" data-dm-value="center"', active: txAlign === 'center', title: 'Align center' },
        { icon: 'textAlignEnd', attr: 'data-dm-prop="textAlign" data-dm-value="right"', active: txAlign === 'right' || txAlign === 'end', title: 'Align right' },
        { icon: 'textAlignJustify', attr: 'data-dm-prop="textAlign" data-dm-value="justify"', active: txAlign === 'justify', title: 'Justify' },
      ]) +
      iconButtonRow([
        { icon: 'minus', attr: 'data-dm-list-style="none"', active: lstStyle === 'none' || !lstStyle, title: 'No list' },
        { icon: 'list', attr: 'data-dm-list-style="disc"', active: lstStyle === 'disc', title: 'Bulleted list' },
        { icon: 'listOrdered', attr: 'data-dm-list-style="decimal"', active: lstStyle === 'decimal', title: 'Numbered list' },
      ]) +
    '</div>' + sp() +
    typographyAdvancedHtml,
    true,
    typographyActionsHtml
  );

  // \u2500\u2500\u2500 Smart defaults & section-action computations (Figma-style) \u2500\u2500\u2500
  const ctx = detectParentContext(displayInfo, s);
  const display = s.display || 'block';
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isGrid = display === 'grid' || display === 'inline-grid';
  const layoutAdvOpen = !!advancedOpen.layout;
  const appearanceAdvOpen = !!advancedOpen.appearance;
  const fillAdvOpen = !!advancedOpen.fill;
  const strokeAdvOpen = !!advancedOpen.stroke;

  const strokePos = inferStrokePosition(s);
  const strokeStyleOff = ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle']
    .every(p => (s[p] || 'none') === 'none');
  const fillOff = (s.backgroundColor || '').replace(/\s+/g,'') === 'rgba(0,0,0,0)';
  const visibilityOff = (s.visibility || 'visible') !== 'visible';

  // Section-header action clusters
  const layoutActionsHtml = advancedToggleBtn('layout', layoutAdvOpen);
  const fillActionsHtml = advancedToggleBtn('fill', fillAdvOpen);
  // Stroke header carries the Advanced chevron + (auto) reset button.
  const strokeActionsHtml = advancedToggleBtn('stroke', strokeAdvOpen);
  void strokeStyleOff; void strokeAdvOpen; void sidesPopoverOpen;
  const visEyeBtn = '<button class="dm-section-action" data-dm-prop="visibility" data-dm-value="' + (visibilityOff ? 'visible' : 'hidden') + '" title="' +
    (visibilityOff ? 'Show element' : 'Hide element') + '" data-active="' + (visibilityOff ? 'false' : 'true') + '">' +
    icon(visibilityOff ? 'eyeOff' : 'eye', 12) + '</button>';
  const appearanceActionsHtml = visEyeBtn + advancedToggleBtn('appearance', appearanceAdvOpen);
  const effectsActionsHtml = effectsAddMenuTrigger(effectsMenuOpen);

  // Position content \u2014 laid out on a 12-col grid:
  //   \u2022 alignment row: 6 buttons \u00d7 2 cols
  //   \u2022 distribute (multi-select): 2 buttons \u00d7 6 cols
  //   \u2022 X (3) Y (3) Z (2) Zup (2) Zdn (2) = 12
  //   \u2022 Rot (2) CCW (2) CW (2) FlipH (3) FlipV (3) = 12
  const distributeActive = multiSelectActive && multiSelectIds.length >= 2;
  const rotateRaw = s.rotate || '';
  const rotateDisplay = (rotateRaw === 'none' || rotateRaw === '') ? '0deg' : rotateRaw;
  // Build alignment buttons individually so each can claim its 2-col span.
  const alignBtnHtml = (iconName: keyof typeof icons, attr: string, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="false" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const distBtnHtml = (iconName: keyof typeof icons, attr: string, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="false" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const zOrderBtnHtml = (iconName: keyof typeof icons, attr: string, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="false" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const flipBtnHtml = (iconName: keyof typeof icons, attr: string, active: boolean, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="' + (active ? 'true' : 'false') + '" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const scale = (s.scale || '').trim();
  const scaleParts = (scale === 'none' || !scale) ? ['1','1'] : scale.split(/\s+/);
  const sx = parseFloat(scaleParts[0] || '1') || 1;
  const sy = parseFloat(scaleParts[1] || scaleParts[0] || '1') || sx;

  // Pivot 9-cell pad \u2014 same shape as Layout's children-align pad. Each
  // cell maps to one CSS transform-origin keyword pair. Browsers normalise
  // computed `transform-origin` to pixel values (e.g. `296px 129.695px`),
  // so we parse against the element's rect when the value isn't a keyword.
  const tOriginRaw = s.transformOrigin || '50% 50%';
  const axisToFrac = (val: string, total: number): number => {
    const t = (val || '').trim();
    if (t.endsWith('%')) return (parseFloat(t) || 0) / 100;
    if (t.endsWith('px') || /^-?\d+(\.\d+)?$/.test(t)) {
      return total > 0 ? (parseFloat(t) || 0) / total : 0.5;
    }
    return 0.5;
  };
  let tOriginH: 'left'|'center'|'right' = 'center';
  let tOriginV: 'top'|'center'|'bottom' = 'center';
  const tOriginLc = tOriginRaw.toLowerCase();
  if (/(left|right|top|bottom|center)/.test(tOriginLc)) {
    if (tOriginLc.includes('left')) tOriginH = 'left';
    else if (tOriginLc.includes('right')) tOriginH = 'right';
    if (tOriginLc.includes('top')) tOriginV = 'top';
    else if (tOriginLc.includes('bottom')) tOriginV = 'bottom';
  } else {
    const parts = tOriginRaw.split(/\s+/);
    const xF = axisToFrac(parts[0] || '50%', displayInfo?.rect?.width || 100);
    const yF = axisToFrac(parts[1] || '50%', displayInfo?.rect?.height || 100);
    const TOL = 0.15;
    tOriginH = xF < TOL ? 'left' : xF > 1 - TOL ? 'right' : 'center';
    tOriginV = yF < TOL ? 'top' : yF > 1 - TOL ? 'bottom' : 'center';
  }
  const pivotCells: { h: 'left'|'center'|'right'; v: 'top'|'center'|'bottom' }[] = [];
  for (const v of ['top','center','bottom'] as const)
    for (const h of ['left','center','right'] as const)
      pivotCells.push({ h, v });
  const pivotPad = '<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2px;width:100%;aspect-ratio:1/1;">' +
    pivotCells.map(c => {
      const active = c.h === tOriginH && c.v === tOriginV;
      const dot = '<span style="width:6px;height:6px;border-radius:50%;background:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';"></span>';
      const valueAttr = c.v + ' ' + c.h;
      return '<button class="dm-icon-row-button" data-dm-transform-origin="' + valueAttr + '" data-active="' + (active ? 'true' : 'false') + '" title="Pivot: ' + c.v + ' ' + c.h + '" style="padding:0;display:flex;align-items:center;justify-content:center;">' + dot + '</button>';
    }).join('') +
    '</div>';

  // Skew X / Y display values \u2014 read existing transform shorthand.
  const transformCur = (s.transform || '').toLowerCase();
  const skewXMatch = /skewx\(([^)]+)\)/.exec(transformCur) || /skew\(([^,)]+)/.exec(transformCur);
  const skewYMatch = /skewy\(([^)]+)\)/.exec(transformCur) || /skew\([^,]+,([^)]+)/.exec(transformCur);
  const skewX = skewXMatch ? parseFloat(skewXMatch[1]) || 0 : 0;
  const skewY = skewYMatch ? parseFloat(skewYMatch[1]) || 0 : 0;

  const positionAdvOpen = !!advancedOpen.position;

  // Position-type gating \u2014 hide rows that have no effect when `position`
  // is `static`. Static disables CSS positioning entirely (top/right/
  // bottom/left/z-index are inert), so showing those fields would be
  // misleading. Anchor positioning likewise needs a positioned element.
  const posType = (s.position || 'static') as 'static'|'relative'|'absolute'|'fixed'|'sticky';
  const offsetActive = posType !== 'static';   // top / right / bottom / left / z-index
  const anchorPosActive = posType !== 'static'; // position-anchor / position-area / try-* / visibility

  const positionContent =
    sel('Position', 'position', s.position || 'static', ['static','relative','absolute','fixed','sticky']) + sp() +
    // Alignment row \u2014 always visible (margin-auto / align-self / justify-self
    // work regardless of position type).
    grid12([
      { span: 2, content: alignBtnHtml('alignStartVertical', 'data-dm-pos-align="h-left"', 'Align left') },
      { span: 2, content: alignBtnHtml('alignCenterVertical', 'data-dm-pos-align="h-center"', 'Align horizontal center') },
      { span: 2, content: alignBtnHtml('alignEndVertical', 'data-dm-pos-align="h-right"', 'Align right') },
      { span: 2, content: alignBtnHtml('alignStartHorizontal', 'data-dm-pos-align="v-top"', 'Align top') },
      { span: 2, content: alignBtnHtml('alignCenterHorizontal', 'data-dm-pos-align="v-middle"', 'Align vertical center') },
      { span: 2, content: alignBtnHtml('alignEndHorizontal', 'data-dm-pos-align="v-bottom"', 'Align bottom') },
    ]) + sp() +
    // Distribute row (multi-select only) \u2014 6 cols each so they evenly fill.
    (distributeActive ? grid12([
      { span: 6, content: distBtnHtml('alignHorizontalSpaceAround', 'data-dm-pos-distribute="horizontal"', 'Distribute horizontally') },
      { span: 6, content: distBtnHtml('alignVerticalSpaceAround', 'data-dm-pos-distribute="vertical"', 'Distribute vertically') },
    ]) + sp() : '') +
    // X / Y / Z / Z-order \u2014 hidden when position is static (offsets inert).
    (offsetActive ? grid12([
      { span: 3, content: inp('X', 'left', s.left || 'auto') },
      { span: 3, content: inp('Y', 'top', s.top || 'auto') },
      { span: 2, content: inp('Z', 'zIndex', s.zIndex || 'auto', '') },
      { span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;visibility:hidden;">\u2191</label>' + zOrderBtnHtml('arrowUpToLine', 'data-dm-z-step="up"', 'Bring forward') + '</div>' },
      { span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;visibility:hidden;">\u2193</label>' + zOrderBtnHtml('arrowDownToLine', 'data-dm-z-step="down"', 'Send backward') + '</div>' },
    ]) + sp() : '') +
    // Rot (4) + CCW (2) + CW (2) + FlipH (2) + FlipV (2) = 12.
    '<div style="display:grid;grid-template-columns:repeat(12, 1fr);gap:6px;align-items:stretch;">' +
      '<div style="grid-column:span 4;min-width:0;">' + inp('', 'rotate', rotateDisplay, 'deg') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + zOrderBtnHtml('rotateCcwSquare', 'data-dm-rotate-step="-90"', 'Rotate 90\u00b0 counter-clockwise') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + zOrderBtnHtml('rotateCwSquare', 'data-dm-rotate-step="90"', 'Rotate 90\u00b0 clockwise') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + flipBtnHtml('flipHorizontal2', 'data-dm-flip="h"', sx < 0, 'Flip horizontally') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + flipBtnHtml('flipVertical2', 'data-dm-flip="v"', sy < 0, 'Flip vertically') + '</div>' +
    '</div>' +
    // Advanced disclosure \u2014 pivot, skew, anchor (right/bottom), 3D, raw
    // transform, self-alignment overrides.
    advancedDisclosure('position', positionAdvOpen,
      sub('Pivot (transform-origin)') +
      '<div style="display:grid;grid-template-columns:repeat(12, 1fr);gap:8px;align-items:start;">' +
        '<div style="grid-column:span 6;min-width:0;">' + pivotPad + '</div>' +
        '<div style="grid-column:span 6;min-width:0;">' + inp('Raw', 'transformOrigin', s.transformOrigin || '50% 50%', '') + '</div>' +
      '</div>' + sp() +
      sub('Skew') +
      grid12([
        { span: 6, content: inp('Skew X', '__skew_x', skewX + 'deg', 'deg') },
        { span: 6, content: inp('Skew Y', '__skew_y', skewY + 'deg', 'deg') },
      ]) + sp() +
      // Right / Bottom anchors — hidden when position is static (offsets inert).
      (offsetActive ? sub('Anchor (right / bottom edges)') +
      grid12([
        { span: 6, content: inp('Right', 'right', s.right || 'auto') },
        { span: 6, content: inp('Bottom', 'bottom', s.bottom || 'auto') },
      ]) + sp() : '') +
      sub('3D') +
      grid12([
        { span: 6, content: inp('Perspective', 'perspective', (s as any).perspective || 'none', '') },
        { span: 6, content: inp('Persp. origin', 'perspectiveOrigin', (s as any).perspectiveOrigin || '50% 50%', '') },
      ]) + sp() +
      grid12([
        { span: 6, content: sel('Transform style', 'transformStyle', (s as any).transformStyle || 'flat', ['flat','preserve-3d']) },
        { span: 6, content: sel('Backface', 'backfaceVisibility', (s as any).backfaceVisibility || 'visible', ['visible','hidden']) },
      ]) + sp() +
      grid12([
        { span: 12, content: sel('Transform reference box', 'transformBox', (s as any).transformBox || 'view-box', ['view-box','fill-box','stroke-box','border-box','content-box']) },
      ]) + sp() +
      // Logical anchors — same gating as physical inset edges.
      (offsetActive ? sub('Logical anchors (i18n — flip with writing-mode / direction)') +
      grid12([
        { span: 3, content: inp('Block start', 'insetBlockStart', (s as any).insetBlockStart || 'auto') },
        { span: 3, content: inp('Block end', 'insetBlockEnd', (s as any).insetBlockEnd || 'auto') },
        { span: 3, content: inp('Inline start', 'insetInlineStart', (s as any).insetInlineStart || 'auto') },
        { span: 3, content: inp('Inline end', 'insetInlineEnd', (s as any).insetInlineEnd || 'auto') },
      ]) + sp() : '') +
      sub('Anchor positioning') +
      // anchor-name works on any element (it's just a name). position-anchor
      // and position-area need this element to be positioned, so disable
      // those two when position is static.
      grid12([
        { span: 4, content: inp('Anchor name', 'anchorName', (s as any).anchorName || 'none', '') },
        { span: 4, content: dis(inp('Position anchor', 'positionAnchor', (s as any).positionAnchor || 'auto', ''), !anchorPosActive, 'Position must not be static') },
        { span: 4, content: dis(inp('Position area', 'positionArea', (s as any).positionArea || 'none', ''), !anchorPosActive, 'Position must not be static') },
      ]) + sp() +
      // Try order / visibility / fallbacks — hidden entirely when static
      // (whole rows are inert).
      (anchorPosActive ? grid12([
        { span: 6, content: sel('Try order', 'positionTryOrder', (s as any).positionTryOrder || 'normal', ['normal','most-width','most-height','most-block-size','most-inline-size']) },
        { span: 6, content: sel('Visibility', 'positionVisibility', (s as any).positionVisibility || 'always', ['always','anchors-visible','no-overflow']) },
      ]) + sp() +
      inp('Try fallbacks', 'positionTryFallbacks', (s as any).positionTryFallbacks || 'none', '') + sp() : '') +
      sub('View transition name') +
      inp('', 'viewTransitionName', (s as any).viewTransitionName || 'none', '') + sp() +
      sub('Raw transform') +
      inp('', 'transform', s.transform || 'none', '') + sp() +
      sub('Self alignment override') +
      grid12([
        { span: 6, content: inp('Align self', 'alignSelf', s.alignSelf || 'auto', '') },
        { span: 6, content: inp('Justify self', 'justifySelf', s.justifySelf || 'auto', '') },
      ])
    );

  // Layout content \u2014 12-col grid:
  //   row: layout mode segmented (full width)
  //   row: W (5) + aspect-ratio btn (1) + H (5) + shrink (1)
  //   row: Min W / Max W / Min H / Max H \u2014 each 3 cols
  //   row: Children align (6) + col-gap & row-gap stacked (6)
  //   row: Chrome computed-box (padding nested in margin)
  //   row: clip checkbox + clip-path
  //   row: overflow X / overflow Y / box-sizing
  const clipChecked = (s.overflow || 'visible') === 'hidden';
  // Checkbox-style toggle button (no inline label — the surrounding
  // wrapper supplies the "Clip content" title above the field).
  const clipBtn = '<button data-dm-prop="overflow" data-dm-value="' + (clipChecked ? 'visible' : 'hidden') + '" title="' + (clipChecked ? 'Currently clipping' : 'Toggle clip content (overflow: hidden)') + '" style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dm-text-secondary);cursor:pointer;background:none;border:none;padding:0;font-family:inherit;text-align:left;width:100%;">' +
    '<span style="width:14px;height:14px;border:1px solid var(--dm-input-border);border-radius:3px;background:' + (clipChecked ? 'var(--dm-accent)' : 'var(--dm-input-bg)') + ';display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;">' + (clipChecked ? icon('check', 10) : '') + '</span>' +
    '<span>' + (clipChecked ? 'On' : 'Off') + '</span></button>';
  // Aspect-ratio button \u2014 turns blue when locked.
  const aspectRatioCur = ((s as any).aspectRatio || 'auto').trim();
  const aspectActive = !!aspectRatioCur && aspectRatioCur !== 'auto';
  const aspectBtn = '<button data-dm-action="toggle-aspect-ratio" title="' +
    (aspectActive ? 'Unlock aspect ratio' : 'Lock aspect ratio to current W:H') +
    '" data-active="' + (aspectActive ? 'true' : 'false') + '" style="width:100%;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:5px;cursor:pointer;background:' +
    (aspectActive ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';border:1px solid ' +
    (aspectActive ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';color:' +
    (aspectActive ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';">' + icon('ratio', 14) + '</button>';
  const shrinkBtn = '<button data-dm-action="resize-to-fit" title="Resize to content (max-content)" style="width:100%;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:5px;cursor:pointer;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);">' + icon('shrink', 14) + '</button>';

  // Gap fields (column / row) \u2014 context-gated by layout mode.
  // Horizontal stack \u2192 only Col gap. Vertical stack \u2192 only Row gap. Grid \u2192 both.
  const colGapField = '<div style="display:flex;flex-direction:column;gap:3px;"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + icon('alignHorizontalSpaceAround', 11) + ' Col gap</label>' + inpKw('', 'columnGap', s.columnGap === 'normal' ? '' : (s.columnGap || ''), 'px', 'normal') + '</div>';
  const rowGapField = '<div style="display:flex;flex-direction:column;gap:3px;"><label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + icon('alignVerticalSpaceAround', 11) + ' Row gap</label>' + inpKw('', 'rowGap', s.rowGap === 'normal' ? '' : (s.rowGap || ''), 'px', 'normal') + '</div>';
  const flexDir = s.flexDirection || 'row';
  const isHStackFlex = isFlex && (flexDir === 'row' || flexDir === 'row-reverse');
  const isVStackFlex = isFlex && (flexDir === 'column' || flexDir === 'column-reverse');
  const showColGap = isGrid || isHStackFlex;
  const showRowGap = isGrid || isVStackFlex;
  const gapsBlock = (showColGap || showRowGap)
    ? '<div style="display:flex;flex-direction:column;gap:6px;">' +
        (showColGap ? colGapField : '') +
        (showRowGap ? rowGapField : '') +
      '</div>'
    : '';

  const layoutContent =
    layoutModeRow(s) + sp() +
    // W (4) + aspect (2) + H (4) + shrink (2)
    grid12([
      { span: 4, content: inp('W', 'width', s.width || 'auto') },
      { span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">\u00b7</label>' + aspectBtn + '</div>' },
      { span: 4, content: inp('H', 'height', s.height || 'auto') },
      { span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">\u00b7</label>' + shrinkBtn + '</div>' },
    ]) + sp() +
    // Min W (3) + Max W (3) + Min H (3) + Max H (3)
    grid12([
      { span: 3, content: inp('Min W', 'minWidth', s.minWidth || '0') },
      { span: 3, content: inp('Max W', 'maxWidth', s.maxWidth || 'none') },
      { span: 3, content: inp('Min H', 'minHeight', s.minHeight || '0') },
      { span: 3, content: inp('Max H', 'maxHeight', s.maxHeight || 'none') },
    ]) + sp() +
    // Children align (6) + Col/Row gap stacked (6) \u2014 top-aligned so the
    // gap fields start at the same Y as the children-align pad.
    ((isFlex || isGrid) ? '<div style="display:grid;grid-template-columns:repeat(12, 1fr);gap:6px;align-items:start;">' +
      '<div style="grid-column:span 6;min-width:0;display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Children align</label>' + childrenAlignPad(s) + '</div>' +
      '<div style="grid-column:span 6;min-width:0;">' + gapsBlock + '</div>' +
    '</div>' + sp() : '') +
    // Chrome DevTools-style box: padding nested inside margin.
    spacingBox(s, displayInfo) + sp() +
    // Clip content (6) + Clip path (6) — both with title above field so
    // they line up visually.
    grid12([
      { span: 6, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Clip content</label><div style="height:30px;display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:0 8px;">' + clipBtn + '</div></div>' },
      { span: 6, content: sel('Clip path', 'clipPath', (s as any).clipPath || 'none', [
        'none',
        'inset(10px)',
        'circle(50%)',
        'ellipse(50% 50%)',
        'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        'inset(0 round 12px)',
      ]) },
    ]) + sp() +
    // Overflow X (4) / Y (4) / Box-sizing (4)
    grid12([
      { span: 4, content: sel('Overflow X', 'overflowX', s.overflowX || 'visible', ['visible','hidden','scroll','auto']) },
      { span: 4, content: sel('Overflow Y', 'overflowY', s.overflowY || 'visible', ['visible','hidden','scroll','auto']) },
      { span: 4, content: sel('Box sizing', 'boxSizing', (s as any).boxSizing || 'content-box', ['content-box','border-box']) },
    ]) +
    // Advanced disclosure (only for flex item / grid template details).
    advancedDisclosure('layout', layoutAdvOpen,
      inp('Aspect ratio (raw)', 'aspectRatio', aspectRatioCur || 'auto', '') + sp() +
      // Container-level: align-content (only meaningful for flex+wrap or grid).
      ((isFlex || isGrid) ? sel('Align content', 'alignContent', s.alignContent || 'normal',
        ['normal','start','center','end','flex-start','flex-end','space-between','space-around','space-evenly','stretch','baseline']) + sp() : '') +
      // Container-level shorthands (place-items / place-content).
      ((isFlex || isGrid) ? grid(2,
        inp('Place items', 'placeItems', (s as any).placeItems || 'normal', ''),
        inp('Place content', 'placeContent', (s as any).placeContent || 'normal', '')
      ) + sp() : '') +
      // Flex item subsection (when this element's parent is flex).
      (ctx.isFlex ? sub('Flex item') + grid(4,
        inp('Grow', 'flexGrow', s.flexGrow || '0', ''),
        inp('Shrink', 'flexShrink', s.flexShrink || '1', ''),
        inp('Basis', 'flexBasis', s.flexBasis || 'auto', ''),
        inp('Order', 'order', (s as any).order || '0', '')
      ) + sp() : '') +
      // Flex container — wrap stays here.
      (isFlex ? sel('Wrap', 'flexWrap', s.flexWrap || 'nowrap', ['nowrap','wrap','wrap-reverse']) + sp() : '') +
      // Grid container subsection.
      (isGrid ? sub('Grid container') +
        inp('Cols', 'gridTemplateColumns', s.gridTemplateColumns || 'none', '') + sp() +
        inp('Rows', 'gridTemplateRows', s.gridTemplateRows || 'none', '') + sp() +
        '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Areas</label><textarea class="dm-input" data-dm-prop="gridTemplateAreas" rows="3" placeholder=\'"a a b" "c c b"\' style="background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:6px;font-family:SF Mono,Monaco,monospace;resize:vertical;">' + escapeAttr((s as any).gridTemplateAreas || '') + '</textarea></div>' + sp() +
        grid(2,
          inp('Auto cols', 'gridAutoColumns', (s as any).gridAutoColumns || 'auto', ''),
          inp('Auto rows', 'gridAutoRows', (s as any).gridAutoRows || 'auto', '')
        ) + sp() +
        sel('Auto flow', 'gridAutoFlow', (s as any).gridAutoFlow || 'row', ['row','column','row dense','column dense']) + sp() : '') +
      // Grid item subsection (when this element's parent is grid).
      (ctx.isGrid ? sub('Grid item') +
        grid(3,
          inp('Col', 'gridColumn', (s as any).gridColumn || 'auto', ''),
          inp('Row', 'gridRow', (s as any).gridRow || 'auto', ''),
          inp('Area', 'gridArea', (s as any).gridArea || 'auto', '')
        ) + sp() +
        inp('Place self', 'placeSelf', (s as any).placeSelf || 'auto', '') + sp() : '') +
      // Logical margin — block (top/bottom in horizontal-tb writing-mode)
      // and inline (left/right). Pairs with the logical-inset properties
      // already exposed in Position → Advanced. Useful when the project
      // targets RTL or vertical writing modes; auto-flips with `direction`.
      sub('Logical margin (auto-flips with writing-mode)') +
      grid(2,
        inp('Block start', 'marginBlockStart', (s as any).marginBlockStart || '0px'),
        inp('Block end', 'marginBlockEnd', (s as any).marginBlockEnd || '0px')
      ) + sp() +
      grid(2,
        inp('Inline start', 'marginInlineStart', (s as any).marginInlineStart || '0px'),
        inp('Inline end', 'marginInlineEnd', (s as any).marginInlineEnd || '0px')
      )
    );

  // Appearance content \u2014 opacity + blend + isolation, corner radius (title
  // row + scan \u2192 2\u00d72; each cell accepts elliptical "X Y" pairs natively),
  // color-adjust filters, raw filter, and an Advanced disclosure that
  // covers visibility / cursor / form-control colours / scrollbars /
  // backdrop adjust / clip-path / performance hints.
  const filterCur = (s.filter || 'none').toLowerCase();
  const filterIs = (fn: string): boolean => filterCur.includes(fn + '(');
  const bdFilterCur = ((s as any).backdropFilter || 'none').toLowerCase();
  const bdFilterIs = (fn: string): boolean => bdFilterCur.includes(fn + '(');
  const colorAdjustRow = iconButtonRow([
    { icon: 'sun', attr: 'data-dm-filter-fn="brightness"', active: filterIs('brightness'), title: 'Brightness' },
    { icon: 'circleHalfFull', attr: 'data-dm-filter-fn="contrast"', active: filterIs('contrast'), title: 'Contrast' },
    { icon: 'palette', attr: 'data-dm-filter-fn="saturate"', active: filterIs('saturate'), title: 'Saturation' },
    { icon: 'rotate3d', attr: 'data-dm-filter-fn="hue-rotate"', active: filterIs('hue-rotate'), title: 'Hue rotate' },
    { icon: 'circleOff', attr: 'data-dm-filter-fn="grayscale"', active: filterIs('grayscale'), title: 'Grayscale' },
    { icon: 'contrast', attr: 'data-dm-filter-fn="invert"', active: filterIs('invert'), title: 'Invert' },
    { icon: 'flame', attr: 'data-dm-filter-fn="sepia"', active: filterIs('sepia'), title: 'Sepia' },
    { icon: 'squareStack', attr: 'data-dm-filter-fn="drop-shadow"', active: filterIs('drop-shadow'), title: 'Drop shadow (filter — ignores overflow:hidden, follows alpha shape)' },
  ]);
  const backdropAdjustRow = iconButtonRow([
    { icon: 'sun', attr: 'data-dm-bdfilter-fn="brightness"', active: bdFilterIs('brightness'), title: 'Backdrop brightness' },
    { icon: 'circleHalfFull', attr: 'data-dm-bdfilter-fn="contrast"', active: bdFilterIs('contrast'), title: 'Backdrop contrast' },
    { icon: 'palette', attr: 'data-dm-bdfilter-fn="saturate"', active: bdFilterIs('saturate'), title: 'Backdrop saturation' },
    { icon: 'rotate3d', attr: 'data-dm-bdfilter-fn="hue-rotate"', active: bdFilterIs('hue-rotate'), title: 'Backdrop hue rotate' },
    { icon: 'circleOff', attr: 'data-dm-bdfilter-fn="grayscale"', active: bdFilterIs('grayscale'), title: 'Backdrop grayscale' },
    { icon: 'contrast', attr: 'data-dm-bdfilter-fn="invert"', active: bdFilterIs('invert'), title: 'Backdrop invert' },
    { icon: 'flame', attr: 'data-dm-bdfilter-fn="sepia"', active: bdFilterIs('sepia'), title: 'Backdrop sepia' },
  ]);

  const isolationCur = ((s as any).isolation || 'auto') === 'isolate';
  const isolationBtn = '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;" title="Forces a new stacking context. Useful when blend modes should not bleed across siblings.">Iso</label>' +
    '<button class="dm-icon-row-button" data-dm-prop="isolation" data-dm-value="' + (isolationCur ? 'auto' : 'isolate') + '" data-active="' + (isolationCur ? 'true' : 'false') + '" title="' + (isolationCur ? 'Stop forcing a new stacking context' : 'Force a new stacking context (isolate)') + '" style="width:100%;height:30px;padding:6px;">' +
    icon(isolationCur ? 'box' : 'squareDashed', 14) + '</button></div>';

  const isFormLayer = kind === 'form';

  const appearanceContent =
    grid12([
      { span: 4, content: inp('Opacity', 'opacity', s.opacity || '1', '') },
      { span: 6, content: sel('Blend', 'mixBlendMode', s.mixBlendMode || 'normal', ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity','plus-lighter']) },
      { span: 2, content: isolationBtn },
    ]) + sp() +
    cornerRadiusGrid(s, cornerRadiusExpanded, cornerRadiusLinked) + sp() +
    sub('Color adjust (filter)') + colorAdjustRow + sp() +
    inp('Filter', 'filter', s.filter || 'none', '') +
    advancedDisclosure('appearance', appearanceAdvOpen,
      sub('Visibility & cursor') +
      grid12([
        { span: 6, content: sel('Visible', 'visibility', s.visibility || 'visible', ['visible','hidden','collapse']) },
        { span: 6, content: sel('Cursor', 'cursor', s.cursor || 'auto', ['auto','default','pointer','text','move','grab','grabbing','not-allowed','crosshair','wait','help','zoom-in','zoom-out','col-resize','row-resize','n-resize','s-resize','e-resize','w-resize','ne-resize','nw-resize','se-resize','sw-resize','none']) },
      ]) + sp() +
      grid12([
        { span: 6, content: sel('Color scheme', 'colorScheme', (s as any).colorScheme || 'normal', ['normal','light','dark','light dark','only light','only dark']) },
        { span: 6, content: sel('Forced colors', 'forcedColorAdjust', (s as any).forcedColorAdjust || 'auto', ['auto','none','preserve-parent-color']) },
      ]) + sp() +

      sub('Interaction') +
      grid12([
        { span: 4, content: sel('Pointer events', 'pointerEvents', s.pointerEvents || 'auto', ['auto','none','all']) },
        { span: 4, content: sel('User select', 'userSelect', s.userSelect || 'auto', ['auto','none','text','all','contain']) },
        { span: 4, content: sel('Appearance', 'appearance', (s as any).appearance || 'auto', ['auto','none','textfield','menulist-button','searchfield','textarea','push-button','slider-horizontal','checkbox','radio','square-button','menulist','listbox','meter','progress-bar','button','button-bevel']) },
      ]) + sp() +

      // Form-control colours \u2014 only meaningful on form layers, but harmless
      // elsewhere (the property cascades but has no effect without a native
      // control). We surface them only for form layers to keep the panel
      // honest about scope.
      (isFormLayer ?
        sub('Form colours') +
        grid12([
          { span: 6, content: colorInp('Accent', 'accentColor', (s as any).accentColor || 'auto') },
          { span: 6, content: colorInp('Caret', 'caretColor', (s as any).caretColor || 'auto') },
        ]) + sp()
      : '') +

      sub('Backdrop adjust (backdrop-filter)') +
      backdropAdjustRow + sp() +
      inp('Backdrop filter', 'backdropFilter', (s as any).backdropFilter || 'none', '') + sp() +

      sub('Clip path') +
      (() => {
        const cp = parseClipPath((s as any).clipPath || 'none');
        const shapeRow = grid12([
          { span: 6, content: sel('Shape', '__clippath_shape', cp.kind, ['none','inset','circle','ellipse','polygon','path','url','custom']) },
          { span: 6, content: inp('Raw', 'clipPath', (s as any).clipPath || 'none', '') },
        ]);
        let fields = '';
        if (cp.kind === 'inset') {
          fields = grid12([
            { span: 3, content: inp('Top', '__clippath_inset_top', cp.top) },
            { span: 3, content: inp('Right', '__clippath_inset_right', cp.right) },
            { span: 3, content: inp('Bottom', '__clippath_inset_bottom', cp.bottom) },
            { span: 3, content: inp('Left', '__clippath_inset_left', cp.left) },
          ]);
        } else if (cp.kind === 'circle') {
          fields = grid12([
            { span: 4, content: inp('Radius', '__clippath_circle_r', cp.r) },
            { span: 4, content: inp('Center X', '__clippath_circle_x', cp.x) },
            { span: 4, content: inp('Center Y', '__clippath_circle_y', cp.y) },
          ]);
        } else if (cp.kind === 'ellipse') {
          fields = grid12([
            { span: 3, content: inp('Rx', '__clippath_ellipse_rx', cp.rx) },
            { span: 3, content: inp('Ry', '__clippath_ellipse_ry', cp.ry) },
            { span: 3, content: inp('X', '__clippath_ellipse_x', cp.x) },
            { span: 3, content: inp('Y', '__clippath_ellipse_y', cp.y) },
          ]);
        } else if (cp.kind === 'polygon') {
          // Per-vertex X / Y inputs replace the comma-list text. Each
          // vertex carries a remove button; an Add vertex button appends
          // a new pair seeded at 50% 50%.
          const pairs = cp.points.split(',').map(p => p.trim()).filter(Boolean);
          const vertexRows = pairs.map((pair, i) => {
            const m = pair.match(/^(\S+)\s+(\S+)$/);
            const xv = m ? m[1] : pair;
            const yv = m ? m[2] : '';
            return '<div style="display:grid;grid-template-columns:24px 1fr 1fr 24px;gap:6px;align-items:end;">' +
              '<div style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;padding-bottom:6px;text-align:right;">' + (i + 1) + '</div>' +
              inp('X', '__clippath_polygon_x_' + i, xv, '') +
              inp('Y', '__clippath_polygon_y_' + i, yv, '') +
              '<button class="dm-section-action" data-dm-clippath-polygon-remove="' + i + '" title="Remove vertex" style="height:28px;color:var(--dm-danger);">' + icon('trash', 11) + '</button>' +
              '</div>';
          }).join('<div style="height:4px;"></div>');
          const addBtn = '<button class="dm-btn" data-dm-clippath-polygon-add style="width:100%;padding:6px;font-size:10px;display:flex;align-items:center;gap:4px;justify-content:center;">' + icon('plus', 11) + ' Add vertex</button>';
          fields = sub('Vertices') + (vertexRows || '<div style="font-size:10px;color:var(--dm-text-dim);">No vertices yet — click Add vertex to start.</div>') + sp() + addBtn;
        } else if (cp.kind === 'path') {
          fields = grid12([
            { span: 12, content: inp('SVG path d', '__clippath_path', cp.d, '') },
          ]);
        } else if (cp.kind === 'url') {
          fields = grid12([
            { span: 12, content: inp('Fragment id (#…)', '__clippath_url', cp.target, '') },
          ]);
        }
        // Live preview — small SVG sketch of the current shape so the user
        // sees what they're cutting. Renders for the four shape kinds we
        // have geometry for (inset / circle / ellipse / polygon).
        const previewSvg = (() => {
          if (cp.kind === 'none' || cp.kind === 'custom' || cp.kind === 'url' || cp.kind === 'path') return '';
          const W = 80, H = 60;
          let shape = '';
          const pct = (v: string, axis: 'x' | 'y'): number => {
            const t = (v || '').trim();
            if (t.endsWith('%')) return parseFloat(t) / 100;
            return parseFloat(t) || 0;
          };
          if (cp.kind === 'inset') {
            const t = pct(cp.top, 'y') * H;
            const r = pct(cp.right, 'x') * W;
            const b = pct(cp.bottom, 'y') * H;
            const l = pct(cp.left, 'x') * W;
            shape = '<rect x="' + l + '" y="' + t + '" width="' + (W - l - r) + '" height="' + (H - t - b) + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />';
          } else if (cp.kind === 'circle') {
            const cx = pct(cp.x, 'x') * W;
            const cy = pct(cp.y, 'y') * H;
            const r = Math.min(W, H) / 2 * pct(cp.r, 'x');
            shape = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />';
          } else if (cp.kind === 'ellipse') {
            const cx = pct(cp.x, 'x') * W;
            const cy = pct(cp.y, 'y') * H;
            const rx = W / 2 * pct(cp.rx, 'x');
            const ry = H / 2 * pct(cp.ry, 'y');
            shape = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />';
          } else if (cp.kind === 'polygon') {
            const pts = cp.points.split(',').map(p => p.trim()).filter(Boolean).map(pair => {
              const m = pair.match(/^(\S+)\s+(\S+)$/);
              if (!m) return '';
              return (pct(m[1], 'x') * W) + ',' + (pct(m[2], 'y') * H);
            }).filter(Boolean).join(' ');
            shape = pts ? '<polygon points="' + pts + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />' : '';
          }
          return '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
            '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:4px;">' +
            '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent" stroke="var(--dm-separator)" stroke-dasharray="2 2" stroke-width="1"/>' +
            shape + '</svg>' +
            '<span style="font-size:9px;color:var(--dm-text-dim);">Live preview · 80×60 reference box</span>' +
            '</div>';
        })();
        return shapeRow + (fields ? sp() + fields : '') + previewSvg;
      })() + sp() +

      sub('Scrollbars') +
      grid12([
        { span: 6, content: sel('Width', 'scrollbarWidth', (s as any).scrollbarWidth || 'auto', ['auto','thin','none']) },
        { span: 6, content: sel('Gutter', 'scrollbarGutter', (s as any).scrollbarGutter || 'auto', ['auto','stable','stable both-edges']) },
      ]) + sp() +
      grid12([
        { span: 12, content: inp('Color (thumb track)', 'scrollbarColor', (s as any).scrollbarColor || 'auto', '') },
      ]) + sp() +

      sub('Performance') +
      grid12([
        { span: 4, content: sel('Contain', 'contain', (s as any).contain || 'none', ['none','strict','content','size','layout','style','paint','inline-size','size layout','size paint','size style','layout paint','layout style']) },
        { span: 4, content: sel('Content vis.', 'contentVisibility', (s as any).contentVisibility || 'visible', ['visible','auto','hidden']) },
        { span: 4, content: inp('Will change', 'willChange', (s as any).willChange || 'auto', '') },
      ])
    );

  // Fill content \u2014 Figma-style layered list. Each layer is one row; the
  // settings (sliders) icon expands a per-layer body underneath. State is
  // owned by `fillLayersByElement` once the user has made any edit; until
  // then we read fresh from CSS.
  const fillElId = info?.id || '';
  const fillLayers = fillElId ? getFillLayers(fillElId, s) : parseFillLayers(s);

  // Visual swatch \u2014 gradient/image use the raw CSS as the swatch background.
  const fillSwatch = (l: FillLayer): string => {
    const bg = l.kind === 'image' ? l.raw + ' center/cover' : l.raw;
    return '<span style="width:18px;height:18px;border-radius:3px;border:1px solid var(--dm-separator);background:' + escapeAttr(bg) + ';flex-shrink:0;display:inline-block;"></span>';
  };
  const fillLabel = (l: FillLayer): string => {
    if (l.kind === 'solid') return l.raw;
    if (l.kind === 'image') {
      const m = l.raw.match(/url\((['"]?)([^'")]+)\1\)/);
      const url = m ? m[2] : l.raw;
      return 'image \u2014 ' + (url.length > 36 ? '\u2026' + url.slice(-33) : url);
    }
    // gradient \u2014 strip the leading function name + ( so the label shows the angle/stops
    return l.kind + ' \u2014 ' + l.raw.replace(/^[^(]+\(/, '').replace(/\)\s*$/, '').slice(0, 40);
  };

  const fillRows = fillLayers.map((layer, idx) => {
    const expanded = expandedFillIdx === idx;
    const body = expanded ? renderFillLayerBody(layer, idx) : '';
    return renderFillRow(layer, idx, fillSwatch(layer), fillLabel(layer), expanded, body);
  }).join('');

  // Inline add menu \u2014 replaces the broken popover. When open, shows 5 type
  // pills directly below the Add button (no absolute positioning).
  const addTypeBtn = (kindAttr: string, lbl: string, glyph: string): string =>
    '<button class="dm-btn" data-dm-fill-add="' + kindAttr + '" style="flex:1;padding:8px 6px;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
    '<span style="width:24px;height:14px;border-radius:3px;background:' + glyph + ';border:1px solid rgba(0,0,0,0.12);"></span>' +
    '<span>' + lbl + '</span></button>';
  const addFillMenu = fillAddOpen
    ? '<div style="display:flex;gap:6px;margin-top:6px;">' +
        addTypeBtn('solid',  'Solid',  '#3b82f6') +
        addTypeBtn('linear', 'Linear', 'linear-gradient(90deg, #fff, #000)') +
        addTypeBtn('radial', 'Radial', 'radial-gradient(circle, #fff, #000)') +
        addTypeBtn('conic',  'Conic',  'conic-gradient(from 0deg, #fff, #000, #fff)') +
        addTypeBtn('image',  'Image',  'repeating-linear-gradient(45deg, #ddd 0 4px, #fff 4px 8px)') +
      '</div>'
    : '';
  const addFillBtn = '<button class="dm-btn" data-dm-fill-add-open data-active="' + (fillAddOpen ? 'true' : 'false') + '" style="margin-top:6px;display:flex;align-items:center;gap:6px;padding:8px;width:100%;justify-content:center;">' +
    icon(fillAddOpen ? 'x' : 'plus', 12) + '<span>' + (fillAddOpen ? 'Cancel' : 'Add fill') + '</span></button>';

  // Fill Advanced \u2014 clip / origin / attachment + the gradient-text preset
  // and the mask-* family (CSS masks are the natural home for fill-shaped
  // alpha cutouts; Figma collapses this into "Use as mask" but the CSS
  // surface area is its own thing).
  const fillAdvancedHtml = advancedDisclosure('fill', fillAdvOpen,
    sub('Background painting box') +
    grid12([
      { span: 6, content: sel('Clip', 'backgroundClip', (s as any).backgroundClip || 'border-box', ['border-box','padding-box','content-box','text']) },
      { span: 6, content: sel('Origin', 'backgroundOrigin', (s as any).backgroundOrigin || 'padding-box', ['border-box','padding-box','content-box']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Attachment', 'backgroundAttachment', s.backgroundAttachment || 'scroll', ['scroll','fixed','local']) },
      { span: 6, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;visibility:hidden;">_</label><button class="dm-btn" data-dm-fill-action="gradient-text" title="Sets background-clip:text + -webkit-text-fill-color:transparent so the topmost gradient/image fills the glyph shape" style="height:30px;font-size:11px;">Gradient text</button></div>' },
    ]) + sp() +

    sub('Mask') +
    grid12([
      { span: 12, content: inp('Image', 'maskImage', (s as any).maskImage || 'none', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Mode', 'maskMode', (s as any).maskMode || 'match-source', ['match-source','alpha','luminance']) },
      { span: 6, content: sel('Composite', 'maskComposite', (s as any).maskComposite || 'add', ['add','subtract','intersect','exclude']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Repeat', 'maskRepeat', (s as any).maskRepeat || 'repeat', ['repeat','no-repeat','repeat-x','repeat-y','space','round']) },
      { span: 6, content: inp('Size', 'maskSize', (s as any).maskSize || 'auto', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Position', 'maskPosition', (s as any).maskPosition || '0% 0%', '') },
      { span: 6, content: sel('Origin', 'maskOrigin', (s as any).maskOrigin || 'border-box', ['border-box','padding-box','content-box','margin-box','fill-box','stroke-box','view-box']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Clip', 'maskClip', (s as any).maskClip || 'border-box', ['border-box','padding-box','content-box','margin-box','fill-box','stroke-box','view-box','no-clip']) },
    ])
  );

  // SVG paint editor — for `kind: 'svg'` the box's `background-*` is rarely
  // what the designer wants; the SVG's own `fill` / `fill-opacity` /
  // `fill-rule` paint the path. Surface those instead.
  const svgPaintHtml = (kind === 'svg') ? (
    sub('SVG paint') +
    grid12([
      { span: 6, content: colorInp('Fill', 'fill', (s as any).fill || '#000000') },
      { span: 6, content: inp('Opacity', 'fillOpacity', (s as any).fillOpacity || '1', '') },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Fill rule', 'fillRule', (s as any).fillRule || 'nonzero', ['nonzero','evenodd']) },
    ]) + sp() +
    sub('SVG stroke') +
    grid12([
      { span: 6, content: colorInp('Color', 'stroke', (s as any).stroke || 'none') },
      { span: 6, content: inp('Width', 'strokeWidth', (s as any).strokeWidth || '1', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Linecap', 'strokeLinecap', (s as any).strokeLinecap || 'butt', ['butt','round','square']) },
      { span: 6, content: sel('Linejoin', 'strokeLinejoin', (s as any).strokeLinejoin || 'miter', ['miter','round','bevel']) },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Dash array', 'strokeDasharray', (s as any).strokeDasharray || 'none', '') },
      { span: 6, content: inp('Dash offset', 'strokeDashoffset', (s as any).strokeDashoffset || '0', '') },
    ]) + sp() + sp()
  ) : '';

  const fillContent =
    svgPaintHtml +
    (fillRows || '<div style="font-size:11px;color:var(--dm-text-dim);text-align:center;padding:14px 0;">No fills yet. Click "Add fill" to start.</div>') +
    addFillBtn + addFillMenu + sp() + fillAdvancedHtml;

  // Stroke content \u2014 single stroke per position. The Inside/Outside/Center
  // selector picks where the stroke renders. Below it: color (6) + weight
  // (2) + style (3) + square (1) on a 12-col grid. The square icon expands
  // a 2\u00D72 of per-side widths (border-*-width) \u2014 only meaningful for
  // Outside (CSS doesn't support per-side outline / inset shadow), but
  // still surfaced for storage.
  // Multi-stroke layered model \u2014 derive layers from per-element state (or
  // seed from current CSS). `activeStrokeIdx` selects which layer the
  // primary controls operate on.
  const strokeElId = info?.id || '';
  const strokeLayers = strokeElId ? getStrokeLayers(strokeElId, s, strokePos) : [];
  const isMultiStroke = strokeLayers.length >= 2;
  const safeActiveIdx = Math.min(Math.max(0, activeStrokeIdx), Math.max(0, strokeLayers.length - 1));
  const activeLayer = strokeLayers[safeActiveIdx];

  // Primary controls read from the active layer when in layered mode,
  // otherwise from CSS (preserves single-stroke behaviour).
  const strokeWeight = activeLayer
    ? activeLayer.weight
    : (parseFloat(s.borderTopWidth || '0') || 0);
  const strokeColor = activeLayer
    ? activeLayer.color
    : (strokePos === 'center'
        ? (s.outlineColor || s.borderTopColor || '#000000')
        : (s.borderTopColor || '#000000'));
  // Read user's chosen style from the in-memory map first, fall back to
  // the active mode's CSS. The map keeps the dashed panel correct even
  // in Inside mode (which can't render dashed visually).
  const intentStyle = strokeElId ? strokeStyleByElement.get(strokeElId) : undefined;
  const cssStyle = strokePos === 'center'
    ? (s.outlineStyle && s.outlineStyle !== 'none' ? s.outlineStyle : 'solid')
    : (s.borderTopStyle && s.borderTopStyle !== 'none' ? s.borderTopStyle : 'solid');
  const strokeStyleCur = intentStyle || cssStyle;
  const sidesExpanded = !!advancedOpen.strokeSides;
  // Per-side widths require Outside mode AND a single-stroke (CSS box-shadow
  // chains are uniform per stroke; once we migrate to multi-stroke we lose
  // per-side support).
  const sidesAvailable = strokePos === 'outside' && !isMultiStroke;
  const sidesBtn = sidesAvailable ? '<button class="dm-section-action" data-dm-advanced-toggle="strokeSides" data-active="' + (sidesExpanded ? 'true' : 'false') + '" title="' + (sidesExpanded ? 'Collapse per-side panel' : 'Edit per side (width / colour / style)') + '" style="width:100%;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid ' + (sidesExpanded ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';background:' + (sidesExpanded ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';color:' + (sidesExpanded ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';">' + icon('settings2', 14) + '</button>' : '';

  // Stroke color picker: clicking the swatch toggles a panel that renders
  // BELOW the entire stroke row (not inside the 4-col cell). Pass
  // omitPanel:true so colorInp produces just the swatch+input row.
  const strokeColorPanelOpen = activeColorPickerProp === '__stroke_color';
  // Style dropdown \u2014 full CSS border-style set plus 'auto' (outline-only,
  // browser-native focus ring; selecting auto also switches mode to Center).
  const styleOptions = ['solid','dashed','dotted','double','groove','ridge','inset','outset','hidden','none','auto'];
  const strokeRow = grid12([
    { span: 4, content: colorInp('Color', '__stroke_color', strokeColor, true) },
    { span: 2, content: inp('Weight', '__stroke_weight', strokeWeight + 'px') },
    { span: sidesAvailable ? 4 : 6, content: sel('Style', '__stroke_style', strokeStyleCur, styleOptions) },
    ...(sidesAvailable ? [{ span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">\u00B7</label>' + sidesBtn + '</div>' }] : []),
  ]);

  const colorPanel = strokeColorPanelOpen ? sp() + renderColorPanel('__stroke_color', strokeColor) : '';

  // Per-side panel \u2014 only when Outside mode (other modes are uniform-only
  // in CSS). 4 rows, each with Width + Color + Style for that side.
  const sideRow = (lbl: string, key: 'Top'|'Right'|'Bottom'|'Left'): string => {
    const wProp = 'border' + key + 'Width';
    const cProp = 'border' + key + 'Color';
    const stProp = 'border' + key + 'Style';
    const wVal = (s as any)[wProp] || '0px';
    const cVal = (s as any)[cProp] || s.borderTopColor || '#000000';
    const stVal = (s as any)[stProp] || s.borderTopStyle || 'solid';
    return grid12([
      { span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + lbl + '</label><div style="height:30px;display:flex;align-items:center;font-size:11px;color:var(--dm-text-muted);">' + key.toLowerCase() + '</div></div>' },
      { span: 3, content: inp('Width', wProp, wVal) },
      { span: 4, content: colorInp('Colour', cProp, cVal, true) },
      { span: 3, content: sel('Style', stProp, stVal, styleOptions) },
    ]);
  };
  const sidesGrid = (sidesAvailable && sidesExpanded) ? sp() +
    sub('Per-side (Outside mode only \u2014 Inside / Center are CSS-uniform)') +
    sideRow('T', 'Top') + sp() +
    sideRow('R', 'Right') + sp() +
    sideRow('B', 'Bottom') + sp() +
    sideRow('L', 'Left')
  : '';

  // Dashed panel — only visible when style is 'dashed'. CSS borders don't
  // expose dash/gap/cap natively (browser-defined pattern), so we store
  // the user's intent on the element via CSS custom properties so design
  // tokens / codegen can pick them up.
  const dashedActive = strokeStyleCur === 'dashed';
  const dashCur = ((s as any)['--dm-stroke-dash'] || '').replace('px','') || '4';
  const gapCur = ((s as any)['--dm-stroke-gap'] || '').replace('px','') || '4';
  const capCur = ((s as any)['--dm-stroke-cap'] || 'square').trim();
  const capBtn = (iconName: keyof typeof icons, val: string, active: boolean, title: string): string =>
    '<button data-dm-prop="--dm-stroke-cap" data-dm-value="' + val + '" title="' + escapeAttr(title) + '" data-active="' + (active ? 'true' : 'false') + '" style="width:100%;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;">' + icon(iconName, 14) + '</button>';
  // Detect whether a user-synthesised dash pattern is currently active —
  // any non-`none` `border-image-source` qualifies. The "Custom dashes"
  // button reflects this state.
  const customDashActive = (() => {
    const src = ((s as any).borderImageSource || 'none').trim();
    return src !== 'none' && src !== '' && src.includes('data:image/svg');
  })();
  const dashedPanel = dashedActive ? sp() + grid12([
    { span: 4, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Dash</label><input type="number" class="dm-input" data-dm-prop="--dm-stroke-dash" data-dm-numeric="1" data-dm-unit="px" min="1" step="1" value="' + escapeAttr(dashCur) + '" placeholder="1" style="background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:6px;"/></div>' },
    { span: 4, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Gap</label><input type="number" class="dm-input" data-dm-prop="--dm-stroke-gap" data-dm-numeric="1" data-dm-unit="px" min="1" step="1" value="' + escapeAttr(gapCur) + '" placeholder="1" style="background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:6px;"/></div>' },
    { span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">·</label>' + capBtn('square', 'square', capCur === 'square', 'Square cap') + '</div>' },
    { span: 2, content: '<div style="display:flex;flex-direction:column;gap:3px;"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">·</label>' + capBtn('squareRoundCorner', 'round', capCur === 'round', 'Round cap') + '</div>' },
  ]) + sp() + grid12([
    { span: 6, content: '<button class="dm-btn" data-dm-stroke-action="custom-dashes" data-active="' + (customDashActive ? 'true' : 'false') + '" title="Render the typed dash / gap exactly. Synthesises an SVG into border-image-source with corner-aware tiling." style="height:30px;font-size:11px;width:100%;">Custom dashes</button>' },
    { span: 6, content: '<button class="dm-btn" data-dm-stroke-action="native-dashes" title="Drop back to the browser-default CSS dashed pattern (clears border-image)." style="height:30px;font-size:11px;width:100%;">Native pattern</button>' },
  ]) : '';

  // Outline-offset control — only meaningful in Center mode. Negative
  // values pull the outline inward (toward the box edge); positive push
  // it outward. We seed at -(weight/2) when entering Center mode but the
  // user can override here.
  const offsetRow = strokePos === 'center' ? sp() + grid12([
    { span: 6, content: inp('Outline offset', 'outlineOffset', s.outlineOffset || '0px') },
    { span: 6, content: '<div style="font-size:10px;color:var(--dm-text-dim);padding:14px 0 0;">Negative pulls inward</div>' },
  ]) : '';

  // Stroke Advanced — border-image suite. CSS lets you slice an image (or
  // gradient) into 9 regions and use it as the border, which enables
  // gradient strokes, ornate frames, and pixel-precise dash patterns
  // that the native dashed/dotted styles can't render. Border-image
  // applies to the box's border slot, so it composes with `border-width`
  // (no per-side weight here — width fills the same slot for all sides).
  const strokeAdvancedHtml = advancedDisclosure('stroke', strokeAdvOpen,
    sub('Border image') +
    grid12([
      { span: 12, content: inp('Source', 'borderImageSource', (s as any).borderImageSource || 'none', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Slice', 'borderImageSlice', (s as any).borderImageSlice || '100%', '') },
      { span: 6, content: inp('Width', 'borderImageWidth', (s as any).borderImageWidth || '1', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Outset', 'borderImageOutset', (s as any).borderImageOutset || '0', '') },
      { span: 6, content: sel('Repeat', 'borderImageRepeat', (s as any).borderImageRepeat || 'stretch', ['stretch','repeat','round','space']) },
    ]) + sp() +
    grid12([
      { span: 6, content: '<button class="dm-btn" data-dm-stroke-action="gradient-stroke" title="Quick preset: linear gradient as border-image-source. Edit Source above to customise." style="height:30px;font-size:11px;width:100%;">Gradient stroke</button>' },
      { span: 6, content: '<button class="dm-btn" data-dm-stroke-action="clear-border-image" title="Reset border-image to none" style="height:30px;font-size:11px;width:100%;">Clear image</button>' },
    ])
  );

  // Layered list of strokes. Renders only when 2+ layers exist (single
  // stroke is fully represented by the primary controls below). Each row
  // shows a swatch + "Wpx <color>" label + eye + trash. Clicking the row
  // makes that layer active for the primary controls.
  const strokeListHtml = isMultiStroke ? (() => {
    const rows = strokeLayers.map((layer, idx) => {
      const visible = layer.visible !== false;
      const isActive = idx === safeActiveIdx;
      const swatch = '<span style="width:18px;height:18px;border-radius:3px;border:1px solid var(--dm-separator);background:' + escapeAttr(layer.color) + ';flex-shrink:0;display:inline-block;"></span>';
      const label = (Math.round(layer.weight * 10) / 10) + 'px · ' + layer.color;
      const eye = '<button class="dm-section-action" data-dm-stroke-toggle="' + idx + '" data-active="' + (visible ? 'true' : 'false') + '" title="' + (visible ? 'Hide' : 'Show') + '">' + icon(visible ? 'eye' : 'eyeOff', 12) + '</button>';
      const trash = '<button class="dm-section-action" data-dm-stroke-remove="' + idx + '" title="Remove stroke" style="color:var(--dm-danger);">' + icon('trash', 12) + '</button>';
      const grip = '<button class="dm-section-action" data-dm-stroke-drag="' + idx + '" title="Drag to reorder" aria-label="Drag" style="cursor:grab;">' + icon('gripVertical', 12) + '</button>';
      const activeBg = isActive ? 'var(--dm-accent-bg)' : 'var(--dm-bg-secondary)';
      const activeBorder = isActive ? 'var(--dm-accent-border)' : 'var(--dm-separator)';
      const head = '<div data-dm-stroke-select="' + idx + '" style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:' + activeBg + ';border:1px solid ' + activeBorder + ';border-radius:5px;cursor:pointer;">' +
        grip + swatch +
        '<span style="flex:1;min-width:0;font-size:11px;font-family:SF Mono,Monaco,monospace;color:var(--dm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(label) + '</span>' +
        eye + trash +
      '</div>';
      return '<div data-dm-stroke-row="' + idx + '" draggable="true" style="margin-bottom:6px;">' + head + '</div>';
    }).join('');
    return rows + sp() +
      '<div style="font-size:10px;color:var(--dm-text-dim);font-style:italic;margin-top:-2px;margin-bottom:6px;">Top of list paints closest to the element. Per-side widths are unavailable while strokes are stacked.</div>' +
      sp();
  })() : '';

  // + Add stroke button. Disabled in Center mode (CSS outline can't stack).
  const addDisabled = strokePos === 'center';
  const addStrokeBtn = '<button class="dm-btn" data-dm-stroke-add' + (addDisabled ? ' disabled' : '') +
    ' title="' + (addDisabled ? 'Multi-stroke is not available in Center mode (CSS outline can’t stack)' : 'Add another stroke on top') + '"' +
    ' style="margin-top:8px;display:flex;align-items:center;gap:6px;padding:8px;width:100%;justify-content:center;' + (addDisabled ? 'opacity:0.4;cursor:not-allowed;' : '') + '">' +
    icon('plus', 12) + '<span>Add stroke</span></button>';

  const strokeContent =
    strokePositionRow(s, strokePos) + sp() +
    strokeListHtml +
    strokeRow +
    offsetRow +
    dashedPanel +
    colorPanel +
    sidesGrid +
    addStrokeBtn +
    strokeAdvancedHtml;

  // Effects \u2014 Figma-style layered list. Each entry is a discrete effect:
  // drop shadow / inner shadow / layer blur / background blur. The header
  // `+` opens the add-menu (already wired). Motion (transition / animation
  // / transform) lives as a separate subsection below since it doesn't
  // map to Figma's effect concept.
  const hasShadow = (s.boxShadow || 'none') !== 'none';
  // Distinguish stroke entries from drop/inner shadows so the Effects
  // section only surfaces the latter. A non-stroke box-shadow is something
  // with non-zero offset, blur, or spread.
  const shadowEntries = parseCssCommaList(s.boxShadow || '');
  const isStrokeEntry = (e: string): boolean => shadowEntryIsStroke(e);
  const isInsetEntry = (e: string): boolean => {
    const p = parseShadowEntry(e);
    return !!p && p.inset;
  };
  const hasDropShadow = shadowEntries.some(e => !isInsetEntry(e) && !isStrokeEntry(e));
  const hasInnerShadow = shadowEntries.some(e => isInsetEntry(e) && !isStrokeEntry(e));
  const hasTextShadow = (s.textShadow || 'none') !== 'none';
  const filterCanon = (s.filter || 'none').toLowerCase();
  const hasLayerBlur = /\bblur\(/.test(filterCanon);
  const hasBackdrop = /\bblur\(/.test((s.backdropFilter || '').toLowerCase());
  const hasTransition = (s.transition || 'none') !== 'none';
  const hasAnimation = (s.animation || 'none') !== 'none';
  const transformIsSet = (!!s.translate && s.translate !== 'none' && s.translate !== '0px 0px') ||
    (!!s.scale && s.scale !== 'none' && s.scale !== '1 1' && s.scale !== '1') ||
    (!!s.rotate && s.rotate !== '0deg' && s.rotate !== '0' && s.rotate !== 'none');

  // Layered effect list. Each box-shadow entry, each filter drop-shadow,
  // each blur, and the text-shadow each get their own row.
  const effectsElId = info?.id || '';
  const effectsIsText = kind === 'text';
  const effectEntries: EffectEntry[] = effectsElId ? parseEffects(s, effectsElId, effectsIsText) : [];
  const labelFor = (e: EffectEntry): string => {
    if (e.kind === 'drop-shadow' || e.kind === 'inner-shadow' || e.kind === 'filter-drop-shadow' || e.kind === 'text-shadow') {
      const sh = e.shadow;
      const insetMark = sh.inset ? 'inset ' : '';
      return insetMark + sh.x + ' ' + sh.y + ' ' + sh.blur + (sh.spread ? ' ' + sh.spread : '') + ' \u00b7 ' + sh.color;
    }
    return (e as any).radius + 'px';
  };
  const titleFor = (e: EffectEntry): string => ({
    'drop-shadow':        'Drop shadow',
    'inner-shadow':       'Inner shadow',
    'filter-drop-shadow': 'Drop shadow (filter)',
    'text-shadow':        'Text shadow',
    'layer-blur':         'Layer blur',
    'backdrop-blur':      'Background blur',
  } as Record<string, string>)[e.kind];
  const iconFor = (e: EffectEntry): keyof typeof icons => ({
    'drop-shadow':        'squareStack',
    'inner-shadow':       'squareStack',
    'filter-drop-shadow': 'squareStack',
    'text-shadow':        'type',
    'layer-blur':         'circleFadingArrowUp',
    'backdrop-blur':      'panelRight',
  } as Record<string, keyof typeof icons>)[e.kind];
  const bodyFor = (e: EffectEntry): string => {
    if (e.kind === 'layer-blur' || e.kind === 'backdrop-blur') return renderBlurEntryEditor(e as any);
    return renderShadowEntryEditor(e as any);
  };
  const effectRows = effectEntries.map((entry, idx) => {
    const swatch = '<span style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;color:' + (entry.visible ? 'var(--dm-text-muted)' : 'var(--dm-text-dim)') + ';">' + icon(iconFor(entry), 14) + '</span>';
    const expanded = expandedEffectIdx === idx;
    const head = layeredRow({
      idx,
      prefix: 'effect',
      swatch,
      label: titleFor(entry),
      meta: labelFor(entry),
      visible: entry.visible,
      expanded,
      body: expanded ? bodyFor(entry) : '',
    });
    // Wrap with a draggable wrapper. `data-dm-effect-row` carries the row
    // index; drag-reorder is constrained to within the same chain so
    // moves across kinds are no-ops in the drop handler.
    return '<div data-dm-effect-row="' + idx + '" data-dm-effect-id="' + escapeAttr(entry.id) + '" data-dm-effect-chain="' + ((entry as any).chain || '') + '" draggable="true">' + head + '</div>';
  }).join('');

  // Motion subsection \u2014 keeps the existing per-property editors.
  const motionPieces: string[] = [];
  if (hasTransition) motionPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;color:var(--dm-text-muted);"><span>' + icon('play', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Transition</span></div>' +
    renderTransitionEditor(s) +
    (vizProp === 'transition' ? renderVizPanel() : '')
  );
  if (hasAnimation) motionPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('film', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Animation</span></div>' +
    renderAnimationEditor(s)
  );
  if (transformIsSet) motionPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('move3d', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Transform</span></div>' +
    renderTransformComponents(s)
  );
  // Motion Path — animate an element along a custom path. Renders only
  // when at least one offset-* property is non-default; the + menu has a
  // "Motion path" preset that seeds it. CSS-native equivalent of SVG
  // <animateMotion>.
  const motionPathSet = (((s as any).offsetPath || 'none') !== 'none' && (s as any).offsetPath !== '');
  if (motionPathSet) motionPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('compass', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Motion path</span></div>' +
    grid12([
      { span: 12, content: inp('Path', 'offsetPath', (s as any).offsetPath || 'none', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Distance', 'offsetDistance', (s as any).offsetDistance || '0%') },
      { span: 6, content: inp('Rotate', 'offsetRotate', (s as any).offsetRotate || 'auto', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Anchor', 'offsetAnchor', (s as any).offsetAnchor || 'auto', '') },
      { span: 6, content: inp('Position', 'offsetPosition', (s as any).offsetPosition || 'auto', '') },
    ]) + sp() +
    '<div style="display:flex;justify-content:flex-end;"><button class="dm-btn" data-dm-effect-action="clear-motion-path" title="Clear motion path" style="padding:3px 8px;font-size:9px;">Clear motion path</button></div>'
  );

  // View transition — bridges the View Transitions API. Renders when the
  // user has set a name or class. The View Transitions API only takes
  // effect when the page calls `document.startViewTransition(...)`; the
  // CSS properties themselves are static metadata for the browser to use
  // during that call.
  const vtName = ((s as any).viewTransitionName || 'none').trim();
  const vtClass = ((s as any).viewTransitionClass || 'none').trim();
  const viewTransitionSet = vtName !== 'none' && vtName !== '' || vtClass !== 'none' && vtClass !== '';
  if (viewTransitionSet) motionPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('shuffle', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">View transition</span></div>' +
    grid12([
      { span: 6, content: inp('Name', 'viewTransitionName', vtName === 'none' ? '' : vtName, '') },
      { span: 6, content: inp('Class', 'viewTransitionClass', vtClass === 'none' ? '' : vtClass, '') },
    ]) + sp() +
    '<div style="font-size:10px;color:var(--dm-text-dim);font-style:italic;">Active only during <code style="font-family:SF Mono,monospace;">document.startViewTransition()</code> calls. Set a unique <code>name</code> per element you want to animate across DOM swaps.</div>' + sp() +
    '<div style="display:flex;justify-content:flex-end;"><button class="dm-btn" data-dm-effect-action="clear-view-transition" title="Clear view-transition properties" style="padding:3px 8px;font-size:9px;">Clear view transition</button></div>'
  );

  // Scroll-driven animations. CSS-native scroll / view timelines that
  // bind an animation's progress to scroll position rather than time.
  // Renders when any scroll/view-timeline property is non-default.
  const sdAnyTimeline = (((s as any).animationTimeline || 'auto') !== 'auto' && (s as any).animationTimeline !== '');
  const sdAnyScrollTl = (((s as any).scrollTimelineName || 'none') !== 'none' && (s as any).scrollTimelineName !== '');
  const sdAnyViewTl   = (((s as any).viewTimelineName || 'none') !== 'none' && (s as any).viewTimelineName !== '');
  const scrollDrivenSet = sdAnyTimeline || sdAnyScrollTl || sdAnyViewTl;
  if (scrollDrivenSet) motionPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('arrowUpDown', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Scroll-driven animation</span></div>' +
    sub('Animation timeline') +
    grid12([
      { span: 8, content: inp('Timeline', 'animationTimeline', (s as any).animationTimeline || 'auto', '') },
      { span: 4, content: inp('Range', 'animationRange', (s as any).animationRange || 'normal', '') },
    ]) + sp() +
    sub('Scroll-timeline source (this element scrolls)') +
    grid12([
      { span: 6, content: inp('Name', 'scrollTimelineName', (s as any).scrollTimelineName || 'none', '') },
      { span: 6, content: sel('Axis', 'scrollTimelineAxis', (s as any).scrollTimelineAxis || 'block', ['block','inline','x','y']) },
    ]) + sp() +
    sub('View-timeline source (this element\'s visibility)') +
    grid12([
      { span: 6, content: inp('Name', 'viewTimelineName', (s as any).viewTimelineName || 'none', '') },
      { span: 6, content: sel('Axis', 'viewTimelineAxis', (s as any).viewTimelineAxis || 'block', ['block','inline','x','y']) },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('View-timeline inset', 'viewTimelineInset', (s as any).viewTimelineInset || 'auto', '') },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('Timeline scope', 'timelineScope', (s as any).timelineScope || 'none', '') },
    ]) + sp() +
    '<div style="display:flex;justify-content:flex-end;gap:6px;">' +
      '<button class="dm-btn" data-dm-effect-action="preset-scroll-progress" title="Bind animation to root scroll progress" style="padding:3px 8px;font-size:9px;">Bind to page scroll</button>' +
      '<button class="dm-btn" data-dm-effect-action="clear-scroll-driven" title="Reset all scroll/view-timeline properties" style="padding:3px 8px;font-size:9px;">Clear</button>' +
    '</div>'
  );
  const motionSection = motionPieces.length
    ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--dm-separator);">' + motionPieces.join('') + '</div>'
    : '';

  const effectsAny = effectEntries.length > 0 || motionPieces.length > 0;
  const effectsContent = effectsAny
    ? effectRows + motionSection
    : '<div style="font-size:11px;color:var(--dm-text-dim);text-align:center;padding:14px 0;">Click + to add an effect.</div>';

  // Suppress unused (smart-defaults from old layout)
  void positionDefault; void hasEffects;

  return '<div style="overflow-x:hidden;">' + indicator +
    iconSection +
    // Media is only meaningful for actual media tags (img / video / audio /
    // svg / picture / etc.). On a `<body>` or generic container the
    // SP_GET_MEDIA response can come back with kind:"background" because
    // the element has a CSS background-image — that's a Fill, not a Media
    // layer, so don't surface a Media section there.
    ((kind === 'media' || kind === 'svg') ? renderMediaSection(displayInfo, s, isImg) : '') +
    (!vis.position ? '' : sec('Position', 'move', positionContent, true, advancedToggleBtn('position', !!advancedOpen.position))) +
    (!vis.layout ? '' : sec('Layout', 'layoutGrid', layoutContent, true, layoutActionsHtml)) +
    (!vis.appearance ? '' : sec('Appearance', 'droplet', appearanceContent, true, appearanceActionsHtml)) +
    typographySection +
    (!vis.fill ? '' : sec('Fill', 'palette', fillContent, true, fillActionsHtml)) +
    (!vis.stroke ? '' : sec('Stroke', 'squareDashed', strokeContent, true, strokeActionsHtml)) +
    (!vis.effects ? '' : sec('Effects', 'sparkles', effectsContent, true, effectsActionsHtml)) +
    '</div>';
}

/* ── Phase 4: Changes Tab (Grouped) ── */
function renderChangesTab(): string {
  type ChangeItem =
    | { type: 'style'; data: StyleChange; idx: number }
    | { type: 'text'; data: TextChange; idx: number }
    | { type: 'dom'; data: DomChange; idx: number }
    | { type: 'comment'; data: CommentEntry; idx: number };
  const allItemsRaw: ChangeItem[] = [
    ...styleChanges.map((c, idx) => ({ type: 'style' as const, data: c, idx })),
    ...textChanges.map((c, idx) => ({ type: 'text' as const, data: c, idx })),
    ...domChanges.map((c, idx) => ({ type: 'dom' as const, data: c, idx })),
    ...comments.map((c, idx) => ({ type: 'comment' as const, data: c, idx })),
  ];
  // Compute the first-touched timestamp per group so the by-element sort
  // can keep all of an element's edits together while preserving relative
  // age across groups.
  const groupFirstTouch = new Map<string, number>();
  for (const it of allItemsRaw) {
    const k = (it.data as any).elementId || (it.data as any).selector || 'unknown';
    const ts = (it.data as any).timestamp || 0;
    const cur = groupFirstTouch.get(k);
    if (cur === undefined || ts < cur) groupFirstTouch.set(k, ts);
  }
  const sortItems = (a: ChangeItem, b: ChangeItem): number => {
    if (changesSort === 'newest') return ((b.data as any).timestamp || 0) - ((a.data as any).timestamp || 0);
    if (changesSort === 'element') {
      const ka = (a.data as any).elementId || (a.data as any).selector || 'unknown';
      const kb = (b.data as any).elementId || (b.data as any).selector || 'unknown';
      const ga = groupFirstTouch.get(ka) || 0;
      const gb = groupFirstTouch.get(kb) || 0;
      if (ga !== gb) return ga - gb;
      // Within a group, keep oldest-first.
      return ((a.data as any).timestamp || 0) - ((b.data as any).timestamp || 0);
    }
    return ((a.data as any).timestamp || 0) - ((b.data as any).timestamp || 0);
  };
  const allItems = [...allItemsRaw].sort(sortItems);

  if (allItems.length === 0) return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('sparkles', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">No changes yet</div><div style="font-size:11px;margin-top:6px;color:var(--dm-text-dim);">Changes will appear here as you edit.<br/>Copy as prompt or send directly to your coding agent.</div></div>';

  // Apply filter (kind chips) and search (selector / property / value / text).
  const q = changesSearch.trim().toLowerCase();
  const matches = (item: ChangeItem): boolean => {
    if (changesFilter !== 'all' && item.type !== changesFilter) return false;
    // Comments sub-filter — narrows to open or resolved only when the user
    // has the resolved-filter set. Non-comment items always pass.
    if (item.type === 'comment' && commentsResolvedFilter !== 'all') {
      const r = !!(item.data as any).resolved;
      if (commentsResolvedFilter === 'open' && r) return false;
      if (commentsResolvedFilter === 'resolved' && !r) return false;
    }
    if (!q) return true;
    const sel = (item.data as any).selector || '';
    if (sel.toLowerCase().includes(q)) return true;
    if (item.type === 'style') {
      const c = item.data;
      return c.property.toLowerCase().includes(q) ||
        (c.oldValue || '').toLowerCase().includes(q) ||
        (c.newValue || '').toLowerCase().includes(q);
    }
    if (item.type === 'text') {
      return (item.data.oldText || '').toLowerCase().includes(q) ||
        (item.data.newText || '').toLowerCase().includes(q);
    }
    if (item.type === 'dom') return item.data.action.toLowerCase().includes(q) || item.data.tagName.toLowerCase().includes(q);
    if (item.type === 'comment') return (item.data.text || '').toLowerCase().includes(q);
    return false;
  };
  const items = allItems.filter(matches);

  // Group by selector / elementId.
  const groups = new Map<string, { selector: string; elementId: string; items: ChangeItem[] }>();
  for (const item of items) {
    const selector = (item.data as any).selector || 'unknown';
    const elementId = (item.data as any).elementId || '';
    const key = elementId || selector;
    if (!groups.has(key)) groups.set(key, { selector, elementId, items: [] });
    groups.get(key)!.items.push(item);
  }

  // Toggle pair — "View Original" and "View Changes" — the active one is highlighted
  const activeStyle = 'padding:4px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:4px;color:var(--dm-accent);cursor:default;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;font-weight:500;';
  const inactiveStyle = 'padding:4px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;';
  const originalBtn = '<button data-dm-action="preview-original"' + (previewingOriginal ? ' disabled' : '') + ' style="' + (previewingOriginal ? activeStyle : inactiveStyle) + '">' + icon('eyeOff', 10) + ' View Original</button>';
  const changesBtn = '<button data-dm-action="restore-changes"' + (!previewingOriginal ? ' disabled' : '') + ' style="' + (!previewingOriginal ? activeStyle : inactiveStyle) + '">' + icon('eye', 10) + ' View Changes</button>';
  const previewBanner = previewingOriginal
    ? '<div style="padding:6px 12px;background:var(--dm-accent-bg);border-bottom:1px solid var(--dm-accent-border);font-size:10px;color:var(--dm-accent);text-align:center;">Viewing original — click View Changes to see your edits</div>'
    : '';

  // Action row 1 — buttons. View Original / View Changes / Clear / Export / Import.
  // Import is a styled <label> wrapping a hidden file input, mirroring the
  // presets export/import pattern in Settings.
  const exportBtn = '<button data-dm-action="export-changes" title="Download every tracked change as a JSON file" style="' + inactiveStyle + '">' + icon('download', 10) + ' Export</button>';
  const importBtn = '<label title="Replace every change with an imported JSON file" style="' + inactiveStyle + '">' + icon('upload', 10) + ' Import<input type="file" accept=".json,application/json" data-dm-import-changes style="display:none;"/></label>';
  const clearBtn = '<button data-dm-action="clear-all-changes" style="padding:4px 10px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:4px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:4px;">' + icon('trash', 10) + ' Clear changes</button>';
  const topRow = '<div style="padding:6px 10px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' +
    originalBtn + changesBtn + clearBtn + exportBtn + importBtn +
    '</div>';

  // Action row 2 — Search + Expand-all toggle + Sort menu. Sort is an icon
  // button that opens an anchored 3-option popover (Oldest / Newest / By
  // element) so it stays compact and matches the action-row icon style.
  const groupKeys = Array.from(groups.keys());
  const anyCollapsed = groupKeys.some(k => changesGroupCollapsed.has(k));
  const expandIconName = anyCollapsed ? 'listChevronsUpDown' : 'listChevronsDownUp';
  const expandTitle = anyCollapsed ? 'Expand all groups' : 'Collapse all groups';
  const expandIconBtn = '<button data-dm-action="' + (anyCollapsed ? 'expand-all-groups' : 'collapse-all-groups') + '" title="' + expandTitle + '" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;border-radius:4px;flex-shrink:0;">' + icon(expandIconName, 14) + '</button>';

  const sortLabel: Record<ChangesSort, string> = { oldest: 'Oldest first', newest: 'Newest first', element: 'By element' };
  const sortMenu = changesSortMenuOpen
    ? '<div data-dm-changes-sort-menu style="position:absolute;top:calc(100% + 4px);right:0;background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.3);padding:4px;z-index:20;min-width:120px;">' +
      (Object.keys(sortLabel) as ChangesSort[]).map(k => {
        const active = changesSort === k;
        return '<button data-dm-changes-sort="' + k + '" style="display:block;width:100%;text-align:left;padding:5px 8px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;font-size:10px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' + sortLabel[k] + '</button>';
      }).join('') +
      '</div>'
    : '';
  const sortIconBtn = '<div style="position:relative;flex-shrink:0;">' +
    '<button data-dm-action="toggle-changes-sort" title="Sort order — ' + sortLabel[changesSort] + '" style="background:' + (changesSortMenuOpen ? 'var(--dm-accent-bg)' : 'none') + ';border:none;color:' + (changesSortMenuOpen ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;padding:4px;border-radius:4px;">' + icon('arrowUpDown', 14) + '</button>' +
    sortMenu +
    '</div>';

  const searchRow = '<div style="display:flex;gap:6px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--dm-separator);">' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:0 6px;flex:1;min-width:0;">' +
    '<span style="color:var(--dm-text-dim);display:flex;flex-shrink:0;">' + icon('search', 10) + '</span>' +
    '<input type="text" class="dm-input" data-dm-changes-search value="' + escapeAttr(changesSearch) + '" placeholder="Search changes…" style="background:none;border:none;padding:5px 6px;flex:1;min-width:0;font-size:10px;"/>' +
    (changesSearch ? '<button data-dm-action="clear-changes-search" title="Clear search" style="background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('x', 10) + '</button>' : '') +
    '</div>' +
    expandIconBtn + sortIconBtn +
    '</div>';

  // Action row 3 — kind filter chips. Counts on each chip help the user
  // spot which kinds have any entries.
  const counts = {
    all: allItems.length,
    style: allItems.filter(i => i.type === 'style').length,
    text: allItems.filter(i => i.type === 'text').length,
    dom: allItems.filter(i => i.type === 'dom').length,
    comment: allItems.filter(i => i.type === 'comment').length,
  };
  const fchip = (f: ChangesFilter, label: string) => {
    const active = changesFilter === f;
    const n = counts[f];
    return '<button data-dm-changes-filter="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') +
      ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-separator)') +
      ';border-radius:9999px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') +
      ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' +
      label + ' <span style="opacity:0.6;">' + n + '</span></button>';
  };
  const filterChipsRow = '<div style="display:flex;gap:4px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--dm-separator);flex-wrap:wrap;">' +
    fchip('all', 'All') + fchip('style', 'Styles') + fchip('text', 'Text') + fchip('dom', 'DOM') + fchip('comment', 'Comments') +
    '</div>';

  // Comments sub-filter — only renders when the kind filter is 'all' (and
  // there are any comments) or 'comment'. Three pills: All / Open /
  // Resolved with count badges, mirroring the kind chips.
  const showCommentsSub = (changesFilter === 'comment') || (changesFilter === 'all' && counts.comment > 0);
  const cCounts = {
    all: counts.comment,
    open: comments.filter(c => !(c as any).resolved).length,
    resolved: comments.filter(c => !!(c as any).resolved).length,
  };
  const cchip = (f: CommentsResolvedFilter, label: string) => {
    const active = commentsResolvedFilter === f;
    const n = cCounts[f];
    return '<button data-dm-comments-filter="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-purple-bg)' : 'transparent') +
      ';border:1px solid ' + (active ? 'var(--dm-purple-border)' : 'var(--dm-separator)') +
      ';border-radius:9999px;color:' + (active ? 'var(--dm-purple)' : 'var(--dm-text-secondary)') +
      ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' +
      label + ' <span style="opacity:0.6;">' + n + '</span></button>';
  };
  const commentsSubRow = showCommentsSub
    ? '<div style="display:flex;gap:4px;align-items:center;padding:4px 10px;border-bottom:1px solid var(--dm-separator);flex-wrap:wrap;">' +
        '<span style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;margin-right:4px;">Comments:</span>' +
        cchip('all', 'All') + cchip('open', 'Open') + cchip('resolved', 'Resolved') +
      '</div>'
    : '';
  const filterRow = searchRow + filterChipsRow + commentsSubRow;

  // Inline confirmation overlay for Clear All. Mirrors the per-comment
  // delete pattern so the destructive action is one extra click, not
  // a system dialog.
  const clearAllOverlay = clearAllConfirming
    ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);z-index:30;display:flex;align-items:center;justify-content:center;">' +
      '<div style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;padding:16px;width:200px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.3);">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dm-text);margin-bottom:6px;">Clear all changes?</div>' +
      '<div style="font-size:10px;color:var(--dm-text-secondary);margin-bottom:14px;line-height:1.5;">Removes every tracked style, text, DOM, and comment change. Resets the undo stack. This can\'t be undone.</div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button data-dm-action="cancel-clear-all" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
      '<button data-dm-action="confirm-clear-all" style="flex:1;padding:6px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:6px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Clear all</button>' +
      '</div></div></div>'
    : '';

  // Same inline overlay for deleting a single comment.
  const deleteCommentOverlay = deletingCommentId
    ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);z-index:30;display:flex;align-items:center;justify-content:center;">' +
      '<div style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;padding:16px;width:200px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.3);">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dm-text);margin-bottom:6px;">Delete comment?</div>' +
      '<div style="font-size:10px;color:var(--dm-text-secondary);margin-bottom:14px;line-height:1.5;">The comment, its pin, and any unsaved replies will be removed. This can\'t be undone.</div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button data-dm-action="cancel-delete-comment-confirm" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
      '<button data-dm-action="confirm-delete-comment-confirm" style="flex:1;padding:6px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:6px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Delete</button>' +
      '</div></div></div>'
    : '';

  // Bulk-revert toolbar — appears when 2+ rows are selected via the
  // checkbox column. The "Revert selected" button drives every selected
  // change-id through the existing per-change revert path.
  const bulkBar = changesSelected.size > 0 ? (
    '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dm-separator);background:var(--dm-accent-bg);align-items:center;">' +
      '<span style="font-size:9px;color:var(--dm-accent);font-weight:600;margin-right:4px;">' + changesSelected.size + ' selected:</span>' +
      '<button data-dm-action="revert-selected-changes" style="padding:3px 8px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:4px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('trash', 10) + ' Revert selected</button>' +
      '<button data-dm-action="clear-selected-changes" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;margin-left:auto;">' + icon('x', 10) + ' Clear</button>' +
    '</div>'
  ) : '';

  const clearAllBtn = topRow + filterRow + bulkBar + previewBanner;

  // Char-level diff for text changes — Myers-style longest common
  // subsequence, then collapse identical runs into <span>'s. Cheap enough
  // for short strings; falls back to the short-truncation diff when both
  // strings are tiny (< 30 chars combined) since the colour coding is
  // already obvious there.
  const diffChars = (oldStr: string, newStr: string): string => {
    const aLen = oldStr.length, bLen = newStr.length;
    // Heuristic: skip the LCS dance for tiny strings.
    if (aLen + bLen < 60) return '';
    // Build LCS dp matrix.
    const dp: number[][] = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0));
    for (let i = 1; i <= aLen; i++) {
      for (let j = 1; j <= bLen; j++) {
        dp[i][j] = oldStr[i - 1] === newStr[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    // Walk back to record edits as runs of {kind, text}.
    type Run = { kind: 'eq' | 'add' | 'del'; text: string };
    const runs: Run[] = [];
    let i = aLen, j = bLen;
    while (i > 0 && j > 0) {
      if (oldStr[i - 1] === newStr[j - 1]) { runs.unshift({ kind: 'eq', text: oldStr[i - 1] }); i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) { runs.unshift({ kind: 'del', text: oldStr[i - 1] }); i--; }
      else { runs.unshift({ kind: 'add', text: newStr[j - 1] }); j--; }
    }
    while (i > 0) { runs.unshift({ kind: 'del', text: oldStr[i - 1] }); i--; }
    while (j > 0) { runs.unshift({ kind: 'add', text: newStr[j - 1] }); j--; }
    // Coalesce adjacent same-kind runs.
    const coalesced: Run[] = [];
    for (const r of runs) {
      const last = coalesced[coalesced.length - 1];
      if (last && last.kind === r.kind) last.text += r.text;
      else coalesced.push({ ...r });
    }
    return coalesced.map(r => {
      const t = escapeAttr(r.text);
      if (r.kind === 'eq') return '<span style="color:var(--dm-text-secondary);">' + t + '</span>';
      if (r.kind === 'add') return '<span style="background:rgba(34,197,94,0.18);color:var(--dm-success);">' + t + '</span>';
      return '<span style="background:rgba(239,68,68,0.18);color:var(--dm-danger);text-decoration:line-through;">' + t + '</span>';
    }).join('');
  };

  // Time-ago helper for hover tooltips on each change row.
  const fmtAgo = (ts?: number): string => {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - ts);
    const s = Math.floor(diff / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  };

  // Build a Set of currently-known element ids for the active-DOM stale
  // check. domTree is populated by SP_GET_DOM_TREE on tab switch and is
  // re-fetched after every action, so this is a reliable snapshot.
  const liveElementIds = new Set(domTree.map(n => n.id));

  const groupHtml = Array.from(groups.entries()).map(([key, group]) => {
    const isCollapsed = changesGroupCollapsed.has(key);
    const count = group.items.length;
    const chevIcon = isCollapsed ? 'chevronRight' : 'chevronDown';
    // A group is "stale" when (a) the tracker has no elementId, OR (b)
    // its elementId no longer exists in the live DOM tree (framework
    // removed / re-rendered the host with a different selector).
    const isStale = !group.elementId || (domTree.length > 0 && !liveElementIds.has(group.elementId));

    const header = '<div class="dm-change-group-header" data-dm-change-group="' + escapeAttr(key) + '"' + (isStale ? ' style="opacity:0.7;"' : '') + '>' +
      '<span style="color:var(--dm-text-dim);display:flex;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>' +
      '<span style="font-family:SF Mono,Monaco,monospace;font-size:10px;color:var(--dm-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;" title="' + escapeAttr(group.selector) + (isStale ? ' (element no longer reachable)' : '') + '">' + escapeAttr(group.selector) + '</span>' +
      (isStale ? '<span style="font-size:8px;padding:1px 6px;border-radius:9999px;background:rgba(0,0,0,0.06);color:var(--dm-text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">stale</span>' : '') +
      '<span style="font-size:9px;background:var(--dm-accent-bg);color:var(--dm-accent);border-radius:8px;padding:1px 6px;flex-shrink:0;">' + count + '</span>' +
      (group.elementId ? '<button data-dm-select-change-el="' + escapeAttr(group.elementId) + '" title="Select element" style="background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('crosshair', 10) + '</button>' : '') +
      '<button data-dm-copy-group="' + escapeAttr(key) + '" title="Copy this group\'s changes as a prompt" style="background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('clipboard', 10) + '</button>' +
      '<button data-dm-revert-group="' + escapeAttr(key) + '" title="Revert all changes in this group" style="background:none;border:none;color:var(--dm-danger);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('trash', 10) + '</button>' +
      '</div>';

    if (isCollapsed) return '<div class="dm-change-group">' + header + '</div>';

    // Per-row checkbox HTML — cid scoped to the row's change-id so
    // selection is stable across re-renders.
    const checkbox = (cid: string) => {
      const checked = changesSelected.has(cid);
      return '<input type="checkbox" data-dm-change-checkbox="' + escapeAttr(cid) + '"' + (checked ? ' checked' : '') + ' style="accent-color:var(--dm-accent);width:12px;height:12px;flex-shrink:0;cursor:pointer;" aria-label="Select change for bulk revert"/>';
    };

    const body = group.items.map(item => {
      const tsLabel = fmtAgo((item.data as any).timestamp);
      const rowTip = tsLabel ? ' title="' + escapeAttr(tsLabel) + '"' : '';
      if (item.type === 'style') {
        const c = item.data;
        const cid = c.id || 'style-' + item.idx;
        const matchCount = Math.max(1, (c as any).matchCount || 1);
        const isBatched = batchAppliedChanges.has(cid);
        const zapStyle = isBatched
          ? 'background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);color:var(--dm-accent);cursor:pointer;display:flex;align-items:center;gap:3px;padding:3px 5px;flex-shrink:0;border-radius:4px;'
          : 'background:none;border:1px solid transparent;color:var(--dm-text-dim);cursor:pointer;display:flex;align-items:center;gap:3px;padding:3px 5px;flex-shrink:0;border-radius:4px;opacity:' + (matchCount > 1 ? '0.85' : '0.55') + ';';
        const zapTitle = isBatched
          ? 'Applied to all ' + matchCount + ' matching element' + (matchCount > 1 ? 's' : '') + ' (click to clear flag)'
          : 'Apply to all ' + matchCount + ' matching element' + (matchCount > 1 ? 's' : '');
        const countBadge = matchCount > 1
          ? '<span style="font-size:9px;font-family:inherit;font-weight:600;">\u00d7' + matchCount + '</span>'
          : '';
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '" data-dm-change-prop="' + escapeAttr(c.property) + '"' + rowTip + ' style="display:flex;align-items:center;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;">' +
          checkbox(cid) +
          '<span style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('sliders', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:10px;"><span style="color:var(--dm-text-muted);">' + c.property + '</span>: <span style="color:var(--dm-danger);text-decoration:line-through;font-size:9px;">' + escapeAttr((c.oldValue || '').slice(0, 20)) + '</span> \u2192 <span style="color:var(--dm-success);">' + escapeAttr((c.newValue || '').slice(0, 20)) + '</span></div>' +
          '</div>' +
          '<button data-dm-batch-apply="' + cid + '" title="' + zapTitle + '" style="' + zapStyle + '" aria-label="Batch apply">' + icon('zap', 10) + countBadge + '</button>' +
          '<button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else if (item.type === 'text') {
        const c = item.data;
        const cid = c.id;
        // Char-level diff for non-trivial text changes; falls back to the
        // 20-char old \u2192 new format for short edits.
        const diffHtml = diffChars(c.oldText || '', c.newText || '');
        const inner = diffHtml
          ? '<div style="font-size:10px;line-height:1.5;font-family:SF Mono,Monaco,monospace;word-break:break-word;"><span style="color:var(--dm-text-muted);">text:</span> ' + diffHtml + '</div>'
          : '<div style="font-size:10px;"><span style="color:var(--dm-text-muted);">text</span>: <span style="color:var(--dm-danger);text-decoration:line-through;font-size:9px;">' + escapeAttr((c.oldText || '').slice(0, 20)) + '</span> \u2192 <span style="color:var(--dm-success);">' + escapeAttr((c.newText || '').slice(0, 20)) + '</span></div>';
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '"' + rowTip + ' style="display:flex;align-items:flex-start;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;">' +
          checkbox(cid) +
          '<span style="color:var(--dm-accent);display:flex;flex-shrink:0;margin-top:2px;">' + icon('type', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' + inner + '</div>' +
          '<button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else if (item.type === 'dom') {
        const c = item.data;
        const colors: Record<string, string> = { delete: 'var(--dm-danger)', duplicate: 'var(--dm-purple)', move: '#f59e0b', insert: 'var(--dm-success)', text: 'var(--dm-accent)' };
        const ic: Record<string, keyof typeof icons> = { delete: 'trash', duplicate: 'layers', move: 'move', insert: 'plus', text: 'type' };
        const cid = c.id || 'dom-' + c.action;
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '"' + rowTip + ' style="display:flex;align-items:center;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;">' +
          checkbox(cid) +
          '<span style="color:' + (colors[c.action] || 'var(--dm-text-muted)') + ';display:flex;flex-shrink:0;">' + icon(ic[c.action] || 'sparkles', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:10px;color:' + (colors[c.action] || 'var(--dm-text-muted)') + ';">' + c.action.toUpperCase() + ' &lt;' + c.tagName + '&gt;</div>' +
          '</div><button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else {
        const c = item.data;
        const isViewing = c.id === viewingCommentId;
        const isResolved = !!c.resolved;
        // Pin ordinal — same algorithm the content script uses (creation
        // order). The displayed `#N` matches the number painted on the
        // pin, so users can reference the same comment in panel + page.
        const sortedComments = [...comments].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const ordinal = sortedComments.findIndex(cc => cc.id === c.id) + 1;
        const wasEdited = !!(c.updatedAt && c.timestamp && c.updatedAt > c.timestamp + 1000);
        const tsLabel = fmtAgo(c.timestamp);
        const editedLabel = wasEdited ? ' · edited ' + fmtAgo(c.updatedAt) : '';
        const tsInfo = '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;">' + escapeAttr(tsLabel + editedLabel) + '</span>';
        // Body styling — strikethrough + faded when resolved.
        const bodyStyle = 'font-size:11px;color:' + (isResolved ? 'var(--dm-text-dim)' : 'var(--dm-text)') + ';line-height:1.5;' + (isResolved ? 'text-decoration:line-through;' : '');
        const bodyStyleCompact = 'font-size:10px;color:' + (isResolved ? 'var(--dm-text-dim)' : 'var(--dm-text)') + ';margin-bottom:4px;' + (isResolved ? 'text-decoration:line-through;' : '');
        // Resolve toggle — primary action when comment is open; "Reopen"
        // when resolved.
        const resolveBtn = '<button data-dm-toggle-resolved="' + c.id + '" aria-label="' + (isResolved ? 'Reopen' : 'Resolve') + '" title="' + (isResolved ? 'Reopen — restore as open comment' : 'Resolve — mark as done') + '" style="padding:3px 10px;background:' + (isResolved ? 'var(--dm-btn-bg)' : 'rgba(34,197,94,0.18)') + ';border:1px solid ' + (isResolved ? 'var(--dm-btn-border)' : 'rgba(34,197,94,0.4)') + ';border-radius:3px;color:' + (isResolved ? 'var(--dm-text-secondary)' : 'rgb(34,197,94)') + ';cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;display:flex;align-items:center;gap:3px;">' + icon(isResolved ? 'rotateCcw' : 'checkCircle', 10) + ' ' + (isResolved ? 'Reopen' : 'Resolve') + '</button>';
        const resolveBtnCompact = '<button data-dm-toggle-resolved="' + c.id + '" aria-label="' + (isResolved ? 'Reopen' : 'Resolve') + '" title="' + (isResolved ? 'Reopen' : 'Resolve') + '" style="padding:2px 8px;background:' + (isResolved ? 'var(--dm-btn-bg)' : 'rgba(34,197,94,0.18)') + ';border:1px solid ' + (isResolved ? 'var(--dm-btn-border)' : 'rgba(34,197,94,0.4)') + ';border-radius:3px;color:' + (isResolved ? 'var(--dm-text-secondary)' : 'rgb(34,197,94)') + ';cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:2px;">' + icon(isResolved ? 'rotateCcw' : 'checkCircle', 9) + ' ' + (isResolved ? 'Reopen' : 'Resolve') + '</button>';
        // Pin number badge — small chip mirroring the page pin so the user
        // can match panel ↔ overlay quickly.
        const pinBadge = '<span title="Pin #' + ordinal + '" style="background:' + (isResolved ? '#A3A3A3' : '#FBBF24') + ';color:#000;font-weight:700;font-size:9px;padding:1px 6px;border-radius:9999px;flex-shrink:0;font-family:SF Mono,Monaco,monospace;">#' + ordinal + '</span>';
        if (isViewing) {
          return '<div class="dm-change-item" style="border-bottom:1px solid var(--dm-separator);background:' + (isResolved ? 'var(--dm-bg-secondary)' : 'var(--dm-purple-bg)') + ';opacity:' + (isResolved ? '0.85' : '1') + ';">' +
            '<div style="display:flex;align-items:center;gap:6px;padding:8px 12px 6px 28px;">' +
            pinBadge +
            '<span style="color:var(--dm-yellow);display:flex;flex-shrink:0;">' + icon('messageSquare', 10) + '</span>' +
            '<span style="font-size:10px;font-weight:600;color:var(--dm-text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(c.selector || '') + '</span>' +
            tsInfo +
            '<button data-dm-action="close-viewing-comment" aria-label="Close" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('x', 10) + '</button>' +
            '</div>' +
            '<div style="padding:0 12px 6px 28px;' + bodyStyle + '">' + renderCommentMarkdown(c.text) + '</div>' +
            '<div style="display:flex;gap:6px;padding:0 12px 8px 28px;flex-wrap:wrap;">' +
            resolveBtn +
            '<button data-dm-edit-comment="' + c.id + '" aria-label="Edit comment" style="padding:3px 10px;background:rgba(139,92,246,0.12);border:1px solid var(--dm-purple-border);border-radius:3px;color:var(--dm-purple);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Edit</button>' +
            '<button data-dm-delete-comment="' + c.id + '" aria-label="Delete comment" style="padding:3px 10px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:3px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;">Delete</button>' +
            '</div></div>';
        }
        return '<div class="dm-change-item" data-dm-comment-item="' + c.id + '" style="display:flex;align-items:start;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);background:' + (isResolved ? 'var(--dm-bg-secondary)' : 'var(--dm-purple-bg)') + ';cursor:pointer;opacity:' + (isResolved ? '0.85' : '1') + ';">' +
          checkbox('comment-' + c.id) +
          pinBadge +
          '<span style="color:var(--dm-yellow);display:flex;flex-shrink:0;margin-top:2px;">' + icon('messageSquare', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="' + bodyStyleCompact + '">' + renderCommentMarkdown(c.text) + '</div>' +
          '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">' +
          resolveBtnCompact +
          '<button data-dm-edit-comment="' + c.id + '" aria-label="Edit comment" style="padding:2px 8px;background:rgba(139,92,246,0.12);border:1px solid var(--dm-purple-border);border-radius:3px;color:var(--dm-purple);cursor:pointer;font-size:9px;font-family:inherit;">Edit</button>' +
          '<button data-dm-delete-comment="' + c.id + '" aria-label="Delete comment" style="padding:2px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-input-border);border-radius:3px;color:var(--dm-text-muted);cursor:pointer;font-size:9px;font-family:inherit;">Delete</button>' +
          '<span style="margin-left:auto;font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;">' + escapeAttr(tsLabel + editedLabel) + '</span>' +
          '</div></div></div>';
      }
    }).join('');

    return '<div class="dm-change-group">' + header + body + '</div>';
  }).join('');

  // When filter / search produces an empty list, replace the group HTML
  // with a small contextual empty state.
  const filteredEmpty = items.length === 0;
  const filteredEmptyHtml = filteredEmpty
    ? '<div style="text-align:center;padding:28px 16px;color:var(--dm-text-dim);font-size:11px;line-height:1.7;">No changes match this filter / search.<br/><a data-dm-action="reset-changes-filter" style="color:var(--dm-accent);cursor:pointer;text-decoration:underline;">Clear filter</a></div>'
    : '';

  return '<div style="position:relative;">' + clearAllBtn + (filteredEmpty ? filteredEmptyHtml : groupHtml) + clearAllOverlay + deleteCommentOverlay + '</div>';
}

/* ── Settings View ── */
// Renders the MCP Server settings card. Three modes: Local (today's
// localhost server), Cloud (mcp.designmode.app), Self-hosted URL (user's
// own Vercel deploy of @design-mode/mcp-cloud). The cloud mode card
// shows a token chip + copy buttons for the agent's config snippet.
function renderMcpServerCard(sS: string, sT: string, lS: string, activeBtn: string, inactiveBtn: string): string {
  const modeBtn = (m: McpMode, label: string) => '<button data-dm-mcp-mode="' + m + '" style="' + (mcpMode === m ? activeBtn : inactiveBtn) + '">' + label + '</button>';
  const modeRow = '<div style="display:flex;gap:4px;margin-bottom:8px;">' +
    modeBtn('local', 'Local') + modeBtn('cloud', 'Cloud') + modeBtn('self-hosted', 'Self-hosted') +
    '</div>';

  let body = '';
  if (mcpMode === 'local') {
    body = '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">WebSocket Port</span><input type="number" class="dm-input" data-dm-setting="wsPort" value="' + escapeAttr(String(mcpPort)) + '" style="width:80px;text-align:right;"/></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Auto-connect</span><input type="checkbox" data-dm-setting="autoConnect"' + (mcpAutoConnect ? ' checked' : '') + ' style="accent-color:var(--dm-accent);"/></div>' +
      '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-top:4px;line-height:1.4;">Port and auto-connect are stored locally. Run <code style="font-family:SF Mono,monospace;">npm start</code> in <code style="font-family:SF Mono,monospace;">packages/mcp-local</code> to bring up the bridge.</div>';
  } else {
    // Cloud + self-hosted share the same UI; only the URL field is
    // editable in self-hosted mode.
    const isSelf = mcpMode === 'self-hosted';
    const hasToken = !!mcpCloudToken;
    const mcpEndpoint = (mcpCloudUrl || '').replace(/\/$/, '') + '/mcp';

    const urlField = isSelf
      ? '<div style="display:flex;flex-direction:column;gap:4px;"><span style="' + lS + '">Server URL</span><input type="text" class="dm-input" data-dm-setting="cloudUrl" value="' + escapeAttr(mcpCloudUrl) + '" placeholder="https://your-deploy.vercel.app" style="font-size:10px;"/></div>'
      : '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Server</span><span style="font-size:10px;color:var(--dm-text-secondary);font-family:SF Mono,monospace;">' + escapeAttr(mcpCloudUrl) + '</span></div>';

    if (!hasToken) {
      body = urlField +
        '<button data-dm-action="mcp-cloud-register" style="margin-top:8px;padding:8px 10px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:6px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;"' + (mcpCloudRegistering ? ' disabled' : '') + '>' + icon('zap', 11) + (mcpCloudRegistering ? ' Connecting…' : ' Connect to Cloud') + '</button>' +
        '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-top:6px;line-height:1.4;">A device token is generated on the server. Copy a config snippet, paste it into Claude Desktop or Cursor, restart the agent.</div>';
    } else {
      const claudeConfig = JSON.stringify({
        mcpServers: { 'design-mode': { type: 'http', url: mcpEndpoint, headers: { Authorization: 'Bearer ' + mcpCloudToken } } },
      }, null, 2);
      const cursorConfig = JSON.stringify({
        'design-mode': { url: mcpEndpoint, headers: { Authorization: 'Bearer ' + mcpCloudToken } },
      }, null, 2);
      const tenantBadge = mcpCloudTenantId
        ? '<span style="font-size:9px;color:var(--dm-text-dimmer);font-family:SF Mono,monospace;">' + escapeAttr(mcpCloudTenantId) + '</span>'
        : '';
      body = urlField +
        '<div style="display:flex;align-items:center;gap:6px;justify-content:space-between;"><span style="' + lS + '">Token</span>' + tenantBadge + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:6px;padding:6px 8px;"><code style="font-size:10px;font-family:SF Mono,monospace;color:var(--dm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">' + escapeAttr(maskToken(mcpCloudToken)) + '</code><button data-dm-action="mcp-cloud-copy-token" title="Copy token" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:2px;">' + icon('copy', 11) + '</button></div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' +
        '<button data-dm-action="mcp-cloud-copy-claude" data-dm-payload="' + escapeAttr(claudeConfig) + '" style="flex:1;padding:6px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('copy', 10) + ' Claude Desktop config</button>' +
        '<button data-dm-action="mcp-cloud-copy-cursor" data-dm-payload="' + escapeAttr(cursorConfig) + '" style="flex:1;padding:6px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('copy', 10) + ' Cursor config</button>' +
        '</div>' +
        '<button data-dm-action="mcp-cloud-revoke" style="margin-top:6px;padding:6px 8px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:5px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('trash', 10) + ' Revoke token</button>' +
        '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-top:6px;line-height:1.4;">Side panel must stay open for the agent to reach this browser. Closing the panel pauses cloud calls until you reopen it.</div>';
    }
  }

  return '<div style="' + sS + '"><div style="' + sT + '">MCP Server</div>' + modeRow +
    '<div style="display:flex;flex-direction:column;gap:6px;">' + body + '</div></div>';
}

function maskToken(t: string): string {
  if (t.length <= 12) return t;
  return t.slice(0, 6) + '…' + t.slice(-4);
}

function renderSettingsView(): string {
  const cfHex = colorFormat === 'hex';
  const cfRgba = colorFormat === 'rgba';
  const cfHsl = colorFormat === 'hsl';
  const activeBtn = 'flex:1;padding:5px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;text-transform:uppercase;';
  const inactiveBtn = 'flex:1;padding:5px 8px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;text-transform:uppercase;';
  const themeActive = (m: string) => theme === m ? activeBtn.replace('uppercase','capitalize') : inactiveBtn.replace('uppercase','capitalize');
  const sS = 'background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:12px;';
  const sT = 'font-size:11px;font-weight:600;color:var(--dm-text-secondary);margin-bottom:8px;';
  const lS = 'font-size:11px;color:var(--dm-text-muted);';

  return '<div style="padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
    '<button data-dm-action="back-from-settings" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:14px;font-weight:600;color:var(--dm-text);">Settings</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    renderMcpServerCard(sS, sT, lS, activeBtn, inactiveBtn) +
    '<div style="' + sS + '"><div style="' + sT + '">Inspector overlay</div><div style="display:flex;flex-direction:column;gap:6px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Hover color</span><input type="color" data-dm-setting="hoverColor" value="' + escapeAttr(inspectorHoverColor) + '" style="width:28px;height:22px;border:1px solid var(--dm-input-border);border-radius:4px;cursor:pointer;background:none;padding:0;"/></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Selection color</span><input type="color" data-dm-setting="selectColor" value="' + escapeAttr(inspectorSelectColor) + '" style="width:28px;height:22px;border:1px solid var(--dm-input-border);border-radius:4px;cursor:pointer;background:none;padding:0;"/></div></div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Color Format</div><div style="display:flex;gap:4px;">' +
    '<button data-dm-color-format="hex" style="' + (cfHex ? activeBtn : inactiveBtn) + '">HEX</button>' +
    '<button data-dm-color-format="rgba" style="' + (cfRgba ? activeBtn : inactiveBtn) + '">RGBA</button>' +
    '<button data-dm-color-format="hsl" style="' + (cfHsl ? activeBtn : inactiveBtn) + '">HSL</button>' +
    '</div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Screenshot Capture</div>' +
    '<div style="font-size:10px;color:var(--dm-text-dim);margin-bottom:8px;">What the camera button does</div>' +
    '<div style="display:flex;gap:4px;">' +
    '<button data-dm-capture-mode="clipboard" style="' + (captureMode === 'clipboard' ? activeBtn : inactiveBtn) + '">Clipboard</button>' +
    '<button data-dm-capture-mode="download" style="' + (captureMode === 'download' ? activeBtn : inactiveBtn) + '">Download</button>' +
    '<button data-dm-capture-mode="both" style="' + (captureMode === 'both' ? activeBtn : inactiveBtn) + '">Both</button>' +
    '</div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Theme</div><div style="display:flex;gap:4px;">' +
    '<button data-dm-theme="system" style="' + themeActive('system') + '">System</button>' +
    '<button data-dm-theme="dark" style="' + themeActive('dark') + '">Dark</button>' +
    '<button data-dm-theme="light" style="' + themeActive('light') + '">Light</button></div></div>' +
    // Footer actions — Reset + Shortcuts. Reset wipes the locally-stored
    // settings (theme, color format, capture mode, MCP port + auto-connect,
    // inspector colours) so the next session starts at defaults.
    '<div style="display:flex;gap:6px;margin-top:4px;">' +
    '<button data-dm-action="show-shortcuts" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('keyboard', 11) + ' Keyboard shortcuts</button>' +
    '<button data-dm-action="reset-settings" style="flex:1;padding:6px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:6px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('rotateCcw', 11) + ' Reset settings</button>' +
    '</div>' +
    '</div><div style="margin-top:16px;text-align:center;"><div style="font-size:10px;color:var(--dm-text-dimmer);">Design Mode v0.9.0</div></div></div>';
}

/* ── Phase 1: Render with morphdom ── */
function renderCaptureToast(): string {
  if (!captureToast) return '';
  const isErr = captureToast.kind === 'error';
  return '<div style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:6px;font-size:11px;font-family:inherit;color:white;background:' + (isErr ? '#dc2626' : '#1f2937') + ';box-shadow:0 4px 12px rgba(0,0,0,0.25);z-index:60;pointer-events:none;white-space:nowrap;">' + escapeAttr(captureToast.text) + '</div>';
}

function render() {
  let html: string;

  if (settingsOpen) {
    html = renderHeader() + renderSettingsView() + renderCaptureToast();
  } else if (presetsOpen) {
    html = '<div style="display:flex;flex-direction:column;height:100vh;overflow:hidden;">' +
      renderHeader() + renderPresetsView() + renderCaptureToast() + '</div>';
  } else {
    let tabContent = '';
    if (tab === 'layers') tabContent = renderLayersTab();
    else if (tab === 'design') tabContent = renderDesignTab();
    else if (tab === 'changes') tabContent = renderChangesTab();

    html = '<div style="display:flex;flex-direction:column;height:100vh;overflow:hidden;position:relative;">' +
      renderHeader() + renderActionRow() + renderCommentCard() + renderTabs() +
      '<div style="flex:1;overflow-y:auto;overflow-x:hidden;">' + tabContent + '</div>' +
      renderStickyBottom() + renderComputedCssOverlay() + renderCaptureToast() + '</div>';
  }

  // Use morphdom for efficient DOM diffing
  const newRoot = document.createElement('div');
  newRoot.id = 'dm-root';
  newRoot.innerHTML = html;

  morphdom(root, newRoot, {
    onBeforeElUpdated(fromEl, toEl) {
      // Preserve focused inputs and contenteditables across re-render so
      // typing isn't interrupted (cursor position, selection, etc).
      if (fromEl === document.activeElement) {
        if (fromEl.tagName === 'INPUT' || fromEl.tagName === 'TEXTAREA' || fromEl.tagName === 'SELECT') return false;
        if ((fromEl as HTMLElement).isContentEditable) return false;
      }
      return true;
    },
  });

  // Focus comment textarea if comment mode just activated
  if (commentMode) {
    const ta = root.querySelector('[data-dm-comment-input]') as HTMLTextAreaElement;
    if (ta && document.activeElement !== ta) ta.focus();
  }
}

/* ── Phase 1: Event Delegation (bound once, never re-bound) ── */
function setupDelegation() {
  // Click handler — async because the eyedropper awaits Chrome's
  // EyeDropper.open() promise.
  root.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Tab switching. When arriving on the Layers tab from somewhere else
    // (e.g. user changed selection on the Design tab), auto-scroll the
    // currently-selected layer into view so the layers list is "ready" —
    // the user shouldn't have to scroll-hunt for what they just picked.
    const tabBtn = target.closest<HTMLElement>('[data-dm-tab]');
    if (tabBtn) {
      const newTab = tabBtn.dataset.dmTab as Tab;
      tab = newTab;
      if (newTab === 'layers') {
        refreshDomTree().then(() => scrollSelectedLayerIntoView());
      } else if (newTab === 'changes') {
        refreshChanges();
      } else {
        render();
      }
      return;
    }

    // Action buttons
    const actionBtn = target.closest<HTMLElement>('[data-dm-action]');
    if (actionBtn) {
      const act = actionBtn.dataset.dmAction!;
      switch (act) {
        case 'select-parent': selectParent(); break;
        case 'select-child': selectChild(); break;
        case 'duplicate': domAction('duplicate'); break;
        case 'delete': domAction('delete'); break;
        case 'comment': startComment(); break;
        case 'screenshot': takeScreenshot(); break;
        case 'download-media': downloadMedia(); break;
        case 'copy-svg-markup': copySvgMarkup(); break;
        case 'undo': undoAction(); break;
        case 'redo': redoAction(); break;
        case 'refresh-mcp': {
          const before = mcpState;
          refreshMcpStatus().then(() => {
            // Toast only when state actually changed — avoids noise on
            // routine clicks. The renderMcpStatus tooltip explains the
            // current state regardless.
            if (mcpState !== before) {
              if (mcpState === 'connected') showCaptureToast('success', 'MCP connected');
              else if (mcpState === 'running') showCaptureToast('success', 'MCP running — waiting for agent');
              else showCaptureToast('error', 'MCP offline');
            } else if (mcpState === 'offline') {
              const cloudMode = mcpMode === 'cloud' || mcpMode === 'self-hosted';
              showCaptureToast('error', cloudMode
                ? (mcpCloudToken ? 'Cloud relay still unreachable.' : 'No cloud token. Open Settings → MCP.')
                : 'MCP still offline. Run `npm start --prefix packages/mcp-local`.');
            }
          });
          break;
        }
        case 'copy-prompt': copyPrompt(); break;
        case 'send-to-agent': sendToAgent(); break;
        case 'toggle-theme': toggleTheme(); break;
        case 'submit-comment': submitComment(); break;
        case 'cancel-comment': cancelComment(); break;
        case 'close-viewing-comment': viewingCommentId = null; render(); break;
        case 'clear-all-changes': clearAllConfirming = true; render(); break;
        case 'cancel-clear-all': clearAllConfirming = false; render(); break;
        case 'confirm-clear-all': clearAllConfirming = false; clearAllChanges(); break;
        case 'toggle-changes-sort': {
          changesSortMenuOpen = !changesSortMenuOpen;
          render();
          break;
        }
        case 'export-changes': {
          // Build a portable JSON payload from the in-memory state. The
          // shape mirrors content/change-tracker's session payload plus a
          // comments array, with a version + url + timestamp envelope so
          // future imports can detect format changes.
          const payload = {
            version: 1,
            kind: 'design-mode-changes',
            exportedAt: Date.now(),
            url: pinnedDomain || '',
            styleChanges,
            textChanges,
            domChanges,
            comments,
          };
          const json = JSON.stringify(payload, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const a = document.createElement('a');
          a.href = url;
          a.download = `design-mode-changes-${stamp}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showCaptureToast('success', `Exported ${styleChanges.length + textChanges.length + domChanges.length + comments.length} change${(styleChanges.length + textChanges.length + domChanges.length + comments.length) === 1 ? '' : 's'}.`);
          break;
        }
        case 'revert-selected-changes': {
          // Drive each selected change-id through the existing per-change
          // revert path so undo state and overlay updates flow correctly.
          const ids = [...changesSelected];
          changesSelected.clear();
          (async () => { for (const id of ids) await removeChange(id); })();
          break;
        }
        case 'clear-selected-changes': changesSelected.clear(); render(); break;
        case 'expand-all-groups': changesGroupCollapsed.clear(); render(); break;
        case 'collapse-all-groups': {
          // Re-derive every group key so we can collapse them all in one pass.
          const allKeys = new Set<string>();
          for (const c of styleChanges)   allKeys.add(c.elementId || c.selector || 'unknown');
          for (const c of textChanges)    allKeys.add(c.elementId || c.selector || 'unknown');
          for (const c of domChanges)     allKeys.add(c.elementId || c.selector || 'unknown');
          for (const c of comments)       allKeys.add((c as any).elementId || (c as any).selector || 'unknown');
          allKeys.forEach(k => changesGroupCollapsed.add(k));
          render();
          break;
        }
        case 'clear-changes-search': changesSearch = ''; render(); break;
        case 'reset-changes-filter': changesFilter = 'all'; changesSearch = ''; render(); break;
        case 'back-from-settings': settingsOpen = false; render(); break;
        case 'settings': settingsOpen = !settingsOpen; render(); break;
        case 'show-shortcuts': showCaptureToast('success', 'Alt+D toggle · Ctrl/⌘+Z undo · Ctrl/⌘+⇧Z redo · Esc deselect / cancel'); break;
        // Cloud-mode auth flow. Register mints a fresh device token via
        // the cloud server's /auth/register endpoint and stores it locally.
        case 'mcp-cloud-register': {
          if (mcpCloudRegistering) break;
          if (!mcpCloudUrl) { showCaptureToast('error', 'Set a server URL first.'); break; }
          mcpCloudRegistering = true;
          render();
          send({ type: 'SP_MCP_REGISTER_TOKEN', cloudUrl: mcpCloudUrl }).then(r => {
            mcpCloudRegistering = false;
            if (!r?.ok || !r.token) {
              showCaptureToast('error', r?.error || 'Failed to register.');
              render();
              return;
            }
            mcpCloudToken = r.token;
            mcpCloudTenantId = r.tenantId || '';
            chrome.storage?.local?.set?.({
              'dm-mcp-cloud-token': mcpCloudToken,
              'dm-mcp-cloud-tenant': mcpCloudTenantId,
              'dm-mcp-cloud-url': mcpCloudUrl,
              'dm-mcp-mode': mcpMode,
            });
            send({ type: 'SP_RECONFIGURE_TRANSPORT' });
            showCaptureToast('success', 'Cloud token ready. Paste a config snippet into your agent.');
            render();
          });
          break;
        }
        case 'mcp-cloud-copy-token':
          navigator.clipboard.writeText(mcpCloudToken).then(() =>
            showCaptureToast('success', 'Token copied.')
          ).catch(() => showCaptureToast('error', 'Clipboard blocked.'));
          break;
        case 'mcp-cloud-copy-claude':
        case 'mcp-cloud-copy-cursor': {
          const payload = actionBtn.getAttribute('data-dm-payload') || '';
          if (!payload) break;
          // The `escapeAttr` helper produces `&quot;` / `&amp;` / `&lt;` /
          // `&gt;`. Reverse those before pasting into the clipboard.
          const decoded = payload.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
          navigator.clipboard.writeText(decoded).then(() =>
            showCaptureToast('success', act === 'mcp-cloud-copy-claude' ? 'Claude Desktop config copied.' : 'Cursor config copied.')
          ).catch(() => showCaptureToast('error', 'Clipboard blocked.'));
          break;
        }
        case 'mcp-cloud-revoke': {
          if (!mcpCloudToken) break;
          send({ type: 'SP_MCP_REVOKE_TOKEN', cloudUrl: mcpCloudUrl, token: mcpCloudToken }).then(r => {
            mcpCloudToken = '';
            mcpCloudTenantId = '';
            chrome.storage?.local?.remove?.(['dm-mcp-cloud-token', 'dm-mcp-cloud-tenant']);
            send({ type: 'SP_RECONFIGURE_TRANSPORT' });
            showCaptureToast(r?.ok ? 'success' : 'error', r?.ok ? 'Token revoked.' : 'Local token cleared (server may be unreachable).');
            render();
          });
          break;
        }
        // Comment delete-confirm flow.
        case 'cancel-delete-comment-confirm': deletingCommentId = null; render(); break;
        case 'confirm-delete-comment-confirm': {
          if (deletingCommentId) {
            const id = deletingCommentId;
            deletingCommentId = null;
            deleteCommentEntry(id);
          }
          break;
        }
        case 'reset-settings': {
          theme = 'system'; resolveTheme();
          colorFormat = 'hex';
          captureMode = 'clipboard';
          mcpPort = 9960; mcpAutoConnect = true;
          inspectorHoverColor = '#4F9EFF'; inspectorSelectColor = '#FF6B35';
          chrome.storage?.local?.remove?.([
            'dm-theme', 'dm-color-format', 'dm-capture-mode',
            'dm-mcp-port', 'dm-mcp-auto-connect',
            'dm-inspector-hover-color', 'dm-inspector-select-color',
          ]);
          showCaptureToast('success', 'Settings reset to defaults');
          render();
          break;
        }
        // v1.2: Presets
        case 'open-presets':
          presetsOpen = true;
          editingPresetData = null; deletingPresetId = null;
          refreshPresets(); break;
        case 'close-presets': presetsOpen = false; editingPresetData = null; deletingPresetId = null; render(); break;
        case 'save-preset': {
          const nameInput = root.querySelector('[data-dm-preset-name]') as HTMLInputElement;
          const name = nameInput?.value?.trim();
          if (name) {
            // Side panel owns the property list per kind — pass it across so
            // content/presets.ts captures exactly what the section section
            // is "about". Falls back to a tiny safe set if SECTION_PROPS
            // is somehow missing the kind.
            const props: string[] = (SECTION_PROPS as Record<string, string[]>)[savePresetKind] || ['color'];
            send({ type: 'SP_SAVE_PRESET', name, kind: savePresetKind, props }).then((res: any) => {
              if (res?.error) {
                showCaptureToast('error', res.error);
                return;
              }
              if (nameInput) nameInput.value = '';
              refreshPresets();
            });
          }
          break;
        }
        case 'save-edit-preset': {
          if (!editingPresetData) break;
          const propInputs = root.querySelectorAll<HTMLInputElement>('[data-dm-edit-prop]');
          const newStyles: Record<string, string> = {};
          propInputs.forEach(inp => { const p = inp.dataset.dmEditProp!; const v = inp.value.trim(); if (v) newStyles[p] = v; });
          const nameInp = root.querySelector<HTMLInputElement>('[data-dm-edit-preset-name]');
          const newName = nameInp?.value?.trim() || editingPresetData.name;
          const id = editingPresetData.id;
          editingPresetData = null;
          send({ type: 'SP_UPDATE_PRESET', presetId: id, name: newName, styles: newStyles }).then((res: any) => {
            if (res?.error) showCaptureToast('error', res.error);
            else if (res?.invalidProps?.length > 0) {
              showCaptureToast('error', `Saved. Skipped invalid: ${res.invalidProps.join(', ')}`);
            }
            refreshPresets();
          });
          break;
        }
        case 'cancel-edit-preset': editingPresetData = null; render(); break;
        case 'confirm-delete-preset': {
          if (deletingPresetId) {
            const id = deletingPresetId;
            deletingPresetId = null;
            send({ type: 'SP_DELETE_PRESET', presetId: id }).then(() => refreshPresets());
          }
          break;
        }
        case 'cancel-delete-preset': deletingPresetId = null; render(); break;
        case 'export-presets': {
          send({ type: 'SP_EXPORT_PRESETS' }).then(r => {
            if (r?.json) {
              const blob = new Blob([r.json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'design-mode-presets.json'; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
          });
          break;
        }
        // v1.2: Computed CSS
        case 'view-computed-css': {
          send({ type: 'SP_GET_COMPUTED_CSS' }).then(r => { computedCssText = r?.css || ''; computedCssOpen = true; render(); });
          break;
        }
        case 'close-computed-css': computedCssOpen = false; render(); break;
        case 'copy-computed-css': navigator.clipboard.writeText(computedCssText).catch(() => {}); break;
        // v1.2: Before/After
        case 'preview-original': {
          send({ type: 'SP_PREVIEW_ORIGINAL' }).then(() => { previewingOriginal = true; render(); });
          break;
        }
        case 'restore-changes': {
          send({ type: 'SP_RESTORE_CHANGES' }).then(() => { previewingOriginal = false; render(); });
          break;
        }
        // v1.2: Shadow actions
        case 'add-shadow': applyStyle('boxShadow', '0px 4px 12px 0px rgba(0, 0, 0, 0.12)'); break;
        case 'clear-shadow': applyStyle('boxShadow', 'none'); break;
        case 'preview-animation': send({ type: 'SP_PREVIEW_ANIMATION' }); break;
        case 'open-in-vscode': {
          const src = (info as any)?.sourceLocation;
          if (src) send({ type: 'SP_OPEN_VSCODE', source: src });
          break;
        }
        case 'toggle-multi-select': {
          send({ type: 'SP_TOGGLE_MULTI_SELECT' }).then(res => {
            multiSelectActive = !!res.active;
            multiSelectIds = res.ids || [];
            render();
          });
          break;
        }
        case 'toggle-freeze': {
          send({ type: 'SP_TOGGLE_FREEZE' }).then(res => {
            animationsFrozen = !!res.frozen;
            render();
          });
          break;
        }
        case 'preview-transition': send({ type: 'SP_PREVIEW_TRANSITION_RULE' }); break;
        case 'resize-to-fit': applyStyle('width', 'max-content'); applyStyle('height', 'max-content'); break;
        case 'toggle-aspect-ratio': {
          const cur = (info?.computedStyles?.aspectRatio || 'auto').trim();
          const isSet = cur && cur !== 'auto';
          if (isSet) {
            applyStyle('aspectRatio', 'auto');
          } else {
            const w = parseFloat(info?.computedStyles?.width || '0') || 0;
            const h = parseFloat(info?.computedStyles?.height || '0') || 0;
            if (w > 0 && h > 0) applyStyle('aspectRatio', (w / h).toFixed(4));
            else applyStyle('aspectRatio', '1 / 1');
          }
          break;
        }
        case 'clear-text-shadow': applyStyle('textShadow', 'none'); break;
        // v1.2: Viz
        case 'close-viz': vizProp = null; render(); break;
        case 'apply-viz': {
          if (vizProp) {
            let cssVal: string;
            if (vizMode === 'ease') {
              cssVal = 'all 0.3s cubic-bezier(' + [bezX1,bezY1,bezX2,bezY2].map(v=>v.toFixed(2)).join(', ') + ')';
            } else {
              const dur = Math.max(0.1, 2*Math.PI*Math.sqrt(Math.max(sprMass,0.1)/Math.max(sprStiffness,1))).toFixed(2);
              cssVal = 'all ' + dur + 's ease-in-out';
            }
            applyStyle(vizProp, cssVal);
            vizProp = null; render();
          }
          break;
        }
      }
      return;
    }

    // Per-section reset — drops every change whose property is in the
    // section's prop list, scoped to the currently selected element. The
    // request is fanned out via SP_REMOVE_CHANGE per change so undo/redo
    // and persistence stay coherent.
    const resetBtn = target.closest<HTMLElement>('[data-dm-reset-section]');
    if (resetBtn) {
      e.stopPropagation();
      const key = resetBtn.dataset.dmResetSection!;
      const propSet = new Set(SECTION_PROPS[key] || []);
      const targetId = info?.id;
      const ids = styleChanges
        .filter(c => propSet.has(c.property) && (!targetId || c.elementId === targetId))
        .map(c => c.id || '');
      if (ids.length === 0) return;
      Promise.all(ids.map(id => send({ type: 'SP_REMOVE_CHANGE', changeId: id }))).then(() => {
        refreshChanges();
        send({ type: 'SP_GET_STATE' }); // refresh selected element's computed styles via the next ELEMENT_SELECTED roundtrip
        if (info?.id) selectElement(info.id);
      });
      return;
    }

    // Section toggle (Phase 3B). Skip when the click landed on an action
    // button inside the header (eye / + / advanced / popover) — those have
    // their own handlers and shouldn't also collapse the section.
    const sectionHeader = target.closest<HTMLElement>('[data-dm-toggle-section]');
    if (sectionHeader && !target.closest('button, .dm-section-action, .dm-section-actions')) {
      const sid = sectionHeader.dataset.dmToggleSection!;
      const current = sectionStates[sid];
      const body = root.querySelector('[data-dm-section-body="' + sid + '"]') as HTMLElement;
      // Determine current open state from body class
      const isOpen = current !== undefined ? current : (body ? !body.classList.contains('dm-collapsed') : true);
      sectionStates[sid] = !isOpen;
      // Persist so the user's expand/collapse choices survive panel reloads.
      chrome.storage?.session?.set?.({ 'dm-section-states': sectionStates });
      render();
      return;
    }

    // Layer collapse toggle (Phase 2B)
    const collapseBtn = target.closest<HTMLElement>('[data-dm-toggle-collapse]');
    if (collapseBtn) {
      e.stopPropagation();
      const nodeId = collapseBtn.dataset.dmToggleCollapse!;
      if (collapsedNodes.has(nodeId)) collapsedNodes.delete(nodeId);
      else collapsedNodes.add(nodeId);
      render();
      return;
    }

    // Layer visibility toggle
    const visBtn = target.closest<HTMLElement>('[data-dm-toggle-vis]');
    if (visBtn) {
      e.stopPropagation();
      toggleLayerVisibility(visBtn.dataset.dmToggleVis!);
      return;
    }

    // Layer lock toggle — locked layers ignore selection / drag.
    const lockBtn = target.closest<HTMLElement>('[data-dm-toggle-lock]');
    if (lockBtn) {
      e.stopPropagation();
      const id = lockBtn.dataset.dmToggleLock!;
      if (lockedLayerIds.has(id)) lockedLayerIds.delete(id);
      else lockedLayerIds.add(id);
      saveLayerState();
      render();
      return;
    }

    // Inline rename — pencil button enters edit mode.
    const renameBtn = target.closest<HTMLElement>('[data-dm-rename-layer]');
    if (renameBtn) {
      e.stopPropagation();
      renamingLayerId = renameBtn.dataset.dmRenameLayer!;
      render();
      // Focus the input after render. morphdom preserves focus on inputs
      // already focused, but the input is brand-new so we explicitly seed.
      setTimeout(() => {
        const inp = root.querySelector<HTMLInputElement>('[data-dm-layer-rename-input="' + renamingLayerId + '"]');
        if (inp) { inp.focus(); inp.select(); }
      }, 0);
      return;
    }

    // Scroll-into-view — page-side scroll to bring the element into the viewport.
    const scrollToBtn = target.closest<HTMLElement>('[data-dm-scroll-to]');
    if (scrollToBtn) {
      e.stopPropagation();
      const id = scrollToBtn.dataset.dmScrollTo!;
      send({ type: 'SP_SCROLL_TO_ELEMENT', elementId: id });
      return;
    }

    // Layers-tab filter chip — narrows the list to one bucket.
    const layersFilterBtn = target.closest<HTMLElement>('[data-dm-layers-filter]');
    if (layersFilterBtn) {
      e.stopPropagation();
      layersFilter = layersFilterBtn.dataset.dmLayersFilter as LayersFilter;
      render();
      return;
    }

    // Multi-select bulk actions.
    const bulkBtn = target.closest<HTMLElement>('[data-dm-bulk-action]');
    if (bulkBtn) {
      e.stopPropagation();
      const action = bulkBtn.dataset.dmBulkAction!;
      const ids = [...multiSelectIds];
      if (action === 'show-all') ids.forEach(id => { if (!domTree.find(n => n.id === id)?.isVisible) toggleLayerVisibility(id); });
      else if (action === 'hide-all') ids.forEach(id => { if (domTree.find(n => n.id === id)?.isVisible) toggleLayerVisibility(id); });
      else if (action === 'lock-all') { ids.forEach(id => lockedLayerIds.add(id)); saveLayerState(); render(); }
      else if (action === 'unlock-all') { ids.forEach(id => lockedLayerIds.delete(id)); saveLayerState(); render(); }
      else if (action === 'duplicate-all') ids.forEach(id => duplicateLayer(id));
      else if (action === 'delete-all') ids.forEach(id => deleteLayer(id));
      else if (action === 'clear-selection') { multiSelectIds.length = 0; multiSelectActive = false; render(); }
      return;
    }

    // Layer delete
    const delLayerBtn = target.closest<HTMLElement>('[data-dm-delete-layer]');
    if (delLayerBtn) {
      e.stopPropagation();
      deleteLayer(delLayerBtn.dataset.dmDeleteLayer!);
      return;
    }

    // Layer selection — locked layers are ignored.
    const layerEl = target.closest<HTMLElement>('[data-dm-layer]');
    if (layerEl && !target.closest('[data-dm-toggle-collapse]') && !target.closest('[data-dm-toggle-vis]') && !target.closest('[data-dm-toggle-lock]') && !target.closest('[data-dm-rename-layer]') && !target.closest('[data-dm-scroll-to]') && !target.closest('[data-dm-delete-layer]') && !target.closest('[data-dm-layer-rename-input]')) {
      const id = layerEl.dataset.dmLayer!;
      if (lockedLayerIds.has(id)) return;
      selectElement(id);
      return;
    }

    // Comment actions
    const editCommentBtn = target.closest<HTMLElement>('[data-dm-edit-comment]');
    if (editCommentBtn) {
      e.stopPropagation();
      const c = comments.find(cc => cc.id === editCommentBtn.dataset.dmEditComment);
      if (c) editComment(c);
      return;
    }

    const deleteCommentBtn = target.closest<HTMLElement>('[data-dm-delete-comment]');
    if (deleteCommentBtn) {
      e.stopPropagation();
      // Open inline confirmation overlay rather than zero-confirm delete.
      // Esc on the overlay dismisses (handled in keydown).
      deletingCommentId = deleteCommentBtn.dataset.dmDeleteComment!;
      render();
      return;
    }

    // Resolve / unresolve toggle.
    const resolveCommentBtn = target.closest<HTMLElement>('[data-dm-toggle-resolved]');
    if (resolveCommentBtn) {
      e.stopPropagation();
      const cid = resolveCommentBtn.dataset.dmToggleResolved!;
      const c = comments.find(cc => cc.id === cid);
      if (c) {
        const next = !c.resolved;
        c.resolved = next; // Optimistic local update
        send({ type: 'SP_SET_COMMENT_RESOLVED', commentId: cid, resolved: next })
          .then(() => refreshChanges());
        render();
      }
      return;
    }

    const commentItem = target.closest<HTMLElement>('[data-dm-comment-item]');
    if (commentItem && !target.closest('[data-dm-edit-comment]') && !target.closest('[data-dm-delete-comment]') && !target.closest('[data-dm-toggle-resolved]') && !target.closest('input[data-dm-change-checkbox]')) {
      const c = comments.find(cc => cc.id === commentItem.dataset.dmCommentItem);
      if (c) scrollToComment(c);
      return;
    }

    // Changes filter chip — narrows the list to one kind.
    const changesFilterBtn = target.closest<HTMLElement>('[data-dm-changes-filter]');
    if (changesFilterBtn) {
      e.stopPropagation();
      changesFilter = changesFilterBtn.dataset.dmChangesFilter as ChangesFilter;
      render();
      return;
    }
    // Comments resolved sub-filter (Open / Resolved / All).
    const commentsFilterBtn = target.closest<HTMLElement>('[data-dm-comments-filter]');
    if (commentsFilterBtn) {
      e.stopPropagation();
      commentsResolvedFilter = commentsFilterBtn.dataset.dmCommentsFilter as CommentsResolvedFilter;
      render();
      return;
    }
    // Sort option button (inside the popover) — picks an option and closes.
    const sortOptBtn = target.closest<HTMLElement>('[data-dm-changes-sort]');
    if (sortOptBtn) {
      e.stopPropagation();
      changesSort = sortOptBtn.dataset.dmChangesSort as ChangesSort;
      changesSortMenuOpen = false;
      render();
      return;
    }

    // Per-group: Copy as prompt — emits a scoped Copy-Prompt payload for
    // just this element's changes.
    const copyGroupBtn = target.closest<HTMLElement>('[data-dm-copy-group]');
    if (copyGroupBtn) {
      e.stopPropagation();
      const key = copyGroupBtn.dataset.dmCopyGroup!;
      copyGroupAsPrompt(key);
      return;
    }

    // Per-group: Revert all changes in this group.
    const revertGroupBtn = target.closest<HTMLElement>('[data-dm-revert-group]');
    if (revertGroupBtn) {
      e.stopPropagation();
      const key = revertGroupBtn.dataset.dmRevertGroup!;
      revertGroup(key);
      return;
    }

    // Remove change
    const removeChangeBtn = target.closest<HTMLElement>('[data-dm-remove-change]');
    if (removeChangeBtn) {
      removeChange(removeChangeBtn.dataset.dmRemoveChange!);
      return;
    }

    // Change group toggle (Phase 4A) — but only when the click was on the
    // header itself, not on one of the action buttons (select / copy /
    // revert) the header now carries.
    const changeGroupHeader = target.closest<HTMLElement>('[data-dm-change-group]');
    if (changeGroupHeader && !target.closest('[data-dm-select-change-el], [data-dm-copy-group], [data-dm-revert-group]')) {
      const key = changeGroupHeader.dataset.dmChangeGroup!;
      if (changesGroupCollapsed.has(key)) changesGroupCollapsed.delete(key);
      else changesGroupCollapsed.add(key);
      render();
      return;
    }

    // Per-row checkbox — toggles the row's id in `changesSelected`. This
    // sits before the select-element handler so checking a box doesn't
    // also focus the element.
    const changeCheckbox = target.closest<HTMLInputElement>('[data-dm-change-checkbox]');
    if (changeCheckbox) {
      e.stopPropagation();
      const cid = changeCheckbox.dataset.dmChangeCheckbox!;
      if (changesSelected.has(cid)) changesSelected.delete(cid);
      else changesSelected.add(cid);
      render();
      return;
    }

    // Select element from change group / change item — but not when the
    // click was on an inner button (zap, trash, checkbox, etc.) which has its own handler.
    const selectChangeEl = target.closest<HTMLElement>('[data-dm-select-change-el]');
    if (selectChangeEl && !target.closest('button[data-dm-batch-apply], button[data-dm-remove-change], button[data-dm-edit-comment], button[data-dm-delete-comment], input[data-dm-change-checkbox]')) {
      e.stopPropagation();
      const elementId = selectChangeEl.dataset.dmSelectChangeEl;
      if (elementId) {
        // If the row is a style change, jump to the right Design-tab
        // section after selection so the user lands on the property
        // they clicked. Lookup uses SECTION_PROPS as the source of truth.
        const propAttr = selectChangeEl.getAttribute('data-dm-change-prop');
        selectElement(elementId).then(() => {
          if (!propAttr) return;
          let sectionKey: string | null = null;
          for (const [k, props] of Object.entries(SECTION_PROPS)) {
            if (props.includes(propAttr)) { sectionKey = k; break; }
          }
          if (!sectionKey) return;
          tab = 'design';
          sectionStates['dm-sec-' + sectionKey] = true;
          chrome.storage?.session?.set?.({ 'dm-section-states': sectionStates });
          render();
          setTimeout(() => {
            const headerEl = root.querySelector<HTMLElement>('[data-dm-toggle-section="dm-sec-' + sectionKey + '"]');
            if (headerEl) headerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        });
      }
      return;
    }

    // Theme setting buttons
    const themeBtn = target.closest<HTMLElement>('[data-dm-theme]');
    if (themeBtn) {
      theme = themeBtn.dataset.dmTheme as Theme;
      resolveTheme();
      chrome.storage?.local?.set?.({ 'dm-theme': theme });
      render();
      return;
    }

    // MCP Mode segmented control — Local / Cloud / Self-hosted.
    const mcpModeBtn = target.closest<HTMLElement>('[data-dm-mcp-mode]');
    if (mcpModeBtn) {
      const next = mcpModeBtn.dataset.dmMcpMode as McpMode;
      if (next !== mcpMode) {
        mcpMode = next;
        chrome.storage?.local?.set?.({ 'dm-mcp-mode': mcpMode });
        // Tell the content script to swap transports.
        send({ type: 'SP_RECONFIGURE_TRANSPORT' });
      }
      render();
      return;
    }

    // Color format buttons
    const colorFormatBtn = target.closest<HTMLElement>('[data-dm-color-format]');
    if (colorFormatBtn) {
      colorFormat = colorFormatBtn.dataset.dmColorFormat as ColorFormat;
      chrome.storage?.local?.set?.({ 'dm-color-format': colorFormat });
      render();
      return;
    }

    // Capture mode buttons
    const captureModeBtn = target.closest<HTMLElement>('[data-dm-capture-mode]');
    if (captureModeBtn) {
      captureMode = captureModeBtn.dataset.dmCaptureMode as CaptureMode;
      chrome.storage?.local?.set?.({ 'dm-capture-mode': captureMode });
      render();
      return;
    }

    // Align/style buttons with data-dm-prop and data-dm-value
    const propBtn = target.closest<HTMLElement>('button[data-dm-prop]');
    if (propBtn) {
      const prop = propBtn.dataset.dmProp!;
      const val = propBtn.dataset.dmValue;
      if (val !== undefined) applyStyle(prop, val);
      return;
    }

    // v1.2: Viz mode toggle
    const vizModeBtn = target.closest<HTMLElement>('[data-dm-viz-mode]');
    if (vizModeBtn) {
      vizMode = vizModeBtn.dataset.dmVizMode as 'ease' | 'spring';
      render(); return;
    }

    // v1.2: Viz open toggle
    const vizOpenBtn = target.closest<HTMLElement>('[data-dm-viz-open]');
    if (vizOpenBtn) {
      const prop = vizOpenBtn.dataset.dmVizOpen!;
      vizProp = vizProp === prop ? null : prop;
      render(); return;
    }

    // v1.2: Apply custom preset by ID
    const applyPresetIdBtn = target.closest<HTMLElement>('[data-dm-apply-preset-id]');
    if (applyPresetIdBtn) {
      const pid = applyPresetIdBtn.dataset.dmApplyPresetId!;
      const preset = customPresetsList.find((p: any) => p.id === pid);
      if (preset) {
        send({ type: 'SP_APPLY_PRESET', preset }).then(r => {
          if (r?.info) info = r.info;
          if (r?.styleChanges) styleChanges = r.styleChanges;
          if (r?.domChanges) domChanges = r.domChanges;
          if (r?.comments) comments = r.comments;
          if (r?.undoCount != null) undoCount = r.undoCount;
          if (r?.redoCount != null) redoCount = r.redoCount;
          render();
        });
      }
      return;
    }

    // Pick color from dropdown
    const pickColorBtn = target.closest<HTMLElement>('[data-dm-pick-color]');
    if (pickColorBtn) {
      const val = pickColorBtn.dataset.dmPickColor!;
      const prop = pickColorBtn.dataset.dmPickProp!;
      activeColorPickerProp = null;
      tokensDropdownProp = null;
      colorPickerSearch = '';
      applyStyle(prop, val);
      return;
    }

    // Color trigger input — open the dropdown
    const colorTrigger = target.closest<HTMLInputElement>('[data-dm-color-trigger]');
    if (colorTrigger) {
      const prop = colorTrigger.dataset.dmColorTrigger!;
      activeColorPickerProp = prop;
      colorPickerSearch = '';
      render();
      // Re-focus and select after re-render
      setTimeout(() => {
        const inp = root.querySelector<HTMLInputElement>('[data-dm-color-trigger="' + prop + '"]');
        if (inp) { inp.focus(); inp.select(); }
      }, 0);
      return;
    }

    // Click outside any color popover closes it
    if (activeColorPickerProp && !target.closest('[data-dm-color-popover]') && !target.closest('[data-dm-color-trigger]')) {
      activeColorPickerProp = null;
      colorPickerSearch = '';
      render();
    }

    // Format cycle inside the color panel: HEX → RGB → HSL → HEX.
    const cycleFmtBtn = target.closest<HTMLElement>('[data-dm-cycle-color-format]');
    if (cycleFmtBtn) {
      e.stopPropagation();
      colorFormat = colorFormat === 'hex' ? 'rgba' : colorFormat === 'rgba' ? 'hsl' : 'hex';
      render();
      return;
    }

    // Eyedropper — Chrome's built-in EyeDropper API. Falls back to a
    // friendly alert when unsupported (Firefox / Safari today).
    const eyedropBtn = target.closest<HTMLElement>('[data-dm-eyedropper]');
    if (eyedropBtn) {
      e.stopPropagation();
      const prop = eyedropBtn.dataset.dmEyedropper!;
      const ED = (window as any).EyeDropper;
      if (typeof ED !== 'function') {
        alert('Eyedropper requires Chrome 95+ or any Chromium-based browser.');
        return;
      }
      try {
        const result = await new ED().open();
        if (result?.sRGBHex) applyStyle(prop, result.sRGBHex);
      } catch {
        // User dismissed the picker — silently ignore.
      }
      return;
    }

    // Click outside the Figma-style popovers (sides, effects-add) closes
    // them. Triggers themselves were intercepted earlier so reaching here
    // means the click was outside both the popover body and its trigger.
    if ((sidesPopoverOpen || effectsMenuOpen) && !target.closest('.dm-popover') && !target.closest('[data-dm-sides-popover]') && !target.closest('[data-dm-effects-menu]')) {
      sidesPopoverOpen = false;
      effectsMenuOpen = false;
      render();
    }
    // Same outside-click behaviour for the Changes-tab sort popover.
    if (changesSortMenuOpen && !target.closest('[data-dm-changes-sort-menu]') && !target.closest('[data-dm-action="toggle-changes-sort"]')) {
      changesSortMenuOpen = false;
      render();
    }

    // (Apply-page-token / token-group-accordion handlers removed — page
    // tokens used to back the Built-in tab; tokens now live inline on
    // every colour input via the focus-driven dropdown. The
    // SP_APPLY_TOKEN message is unused but harmless if the background /
    // content scripts still implement it.)

    // v1.2: Edit preset (open edit view)
    const editPresetBtn = target.closest<HTMLElement>('[data-dm-edit-preset]');
    if (editPresetBtn) {
      const pid = editPresetBtn.dataset.dmEditPreset!;
      const preset = customPresetsList.find((p: any) => p.id === pid);
      if (preset) { editingPresetData = { id: pid, name: preset.name, kind: preset.kind, styles: { ...preset.styles } }; render(); }
      return;
    }

    // v1.2: Remove a style prop in edit view
    const removeEditPropBtn = target.closest<HTMLElement>('[data-dm-remove-edit-prop]');
    if (removeEditPropBtn && editingPresetData) {
      const prop = removeEditPropBtn.dataset.dmRemoveEditProp!;
      const newStyles = { ...editingPresetData.styles };
      delete newStyles[prop];
      editingPresetData = { ...editingPresetData, styles: newStyles };
      render(); return;
    }

    // v1.2: Delete preset (show confirmation)
    const deletePresetBtn = target.closest<HTMLElement>('[data-dm-delete-preset]');
    if (deletePresetBtn) {
      deletingPresetId = deletePresetBtn.dataset.dmDeletePreset!;
      render(); return;
    }

    // Preset kind chip — picks which kind the next save will capture.
    const kindBtn = target.closest<HTMLElement>('[data-dm-preset-kind]');
    if (kindBtn && !kindBtn.hasAttribute('disabled')) {
      savePresetKind = kindBtn.dataset.dmPresetKind as PresetKind;
      render();
      return;
    }
    // Preset filter chip — narrows the saved-presets list to one kind
    // (or "All").
    const filterBtn = target.closest<HTMLElement>('[data-dm-preset-filter]');
    if (filterBtn) {
      presetFilter = filterBtn.dataset.dmPresetFilter as ('all' | PresetKind);
      render();
      return;
    }

    // v1.2: Border link toggle
    const borderLinkBtn = target.closest<HTMLElement>('[data-dm-border-link]');
    if (borderLinkBtn) {
      e.stopPropagation();
      const key = borderLinkBtn.dataset.dmBorderLink!;
      if (key === 'width') borderWidthLinked = !borderWidthLinked;
      else if (key === 'style') borderStyleLinked = !borderStyleLinked;
      else if (key === 'color') borderColorLinked = !borderColorLinked;
      else if (key === 'radius') cornerRadiusLinked = !cornerRadiusLinked;
      else if (key === 'padding') paddingLinked = !paddingLinked;
      else if (key === 'margin') marginLinked = !marginLinked;
      render(); return;
    }

    // ─── Figma-style controls ───
    // Section action toggles (corner expand/link, advanced toggle, sides /
    // effects popovers, eye toggles). Stop propagation so clicking an
    // action doesn't also fire the surrounding section's collapse/expand.
    const cornerExpandBtn = target.closest<HTMLElement>('[data-dm-corner-expand]');
    if (cornerExpandBtn) { e.stopPropagation(); cornerRadiusExpanded = !cornerRadiusExpanded; render(); return; }

    const cornerLinkBtn = target.closest<HTMLElement>('[data-dm-corner-link]');
    if (cornerLinkBtn) { e.stopPropagation(); cornerRadiusLinked = !cornerRadiusLinked; render(); return; }

    const advancedToggle = target.closest<HTMLElement>('[data-dm-advanced-toggle]');
    if (advancedToggle) {
      e.stopPropagation();
      const key = advancedToggle.dataset.dmAdvancedToggle!;
      advancedOpen[key] = !advancedOpen[key];
      render(); return;
    }

    const sidesPopBtn = target.closest<HTMLElement>('[data-dm-sides-popover]');
    if (sidesPopBtn) { e.stopPropagation(); sidesPopoverOpen = !sidesPopoverOpen; render(); return; }

    const effectsMenuBtn = target.closest<HTMLElement>('[data-dm-effects-menu]');
    if (effectsMenuBtn) { e.stopPropagation(); effectsMenuOpen = !effectsMenuOpen; render(); return; }

    // Position alignment buttons. Pragmatic CSS mapping: dispatch to
    // align-self/justify-self for flex|grid parents, top/left + translate
    // for absolute/fixed positioning, and margin auto for plain block.
    const posAlignBtn = target.closest<HTMLElement>('[data-dm-pos-align]');
    if (posAlignBtn) {
      e.stopPropagation();
      const which = posAlignBtn.dataset.dmPosAlign!;
      const s = info?.computedStyles || {};
      const ctx = detectParentContext(info, s);
      applyPositionAlign(which, ctx);
      return;
    }

    // Flip H / Flip V — toggle sign of the corresponding axis on the
    // `scale` longhand (preserve the other axis).
    const flipBtn = target.closest<HTMLElement>('[data-dm-flip]');
    if (flipBtn) {
      e.stopPropagation();
      const axis = flipBtn.dataset.dmFlip!;
      const s = info?.computedStyles || {};
      const scale = (s.scale || '').trim();
      const parts = (scale === 'none' || !scale) ? ['1','1'] : scale.split(/\s+/);
      let sx = parseFloat(parts[0] || '1') || 1;
      let sy = parseFloat(parts[1] || parts[0] || '1') || sx;
      if (axis === 'h') sx = -sx; else if (axis === 'v') sy = -sy;
      applyStyle('scale', sx + ' ' + sy);
      return;
    }

    // Layout mode segmented control.
    const layoutModeBtn = target.closest<HTMLElement>('[data-dm-layout-mode]');
    if (layoutModeBtn) {
      e.stopPropagation();
      const mode = layoutModeBtn.dataset.dmLayoutMode!;
      const cur = info?.computedStyles || {};
      if (mode === 'free') {
        applyStyle('display', 'block');
      } else if (mode === 'hstack') {
        applyStyle('display', 'flex');
        applyStyle('flexDirection', 'row');
      } else if (mode === 'vstack') {
        applyStyle('display', 'flex');
        applyStyle('flexDirection', 'column');
      } else if (mode === 'grid') {
        applyStyle('display', 'grid');
        // Prefill `grid-template-columns: 1fr 1fr` so the grid is visible
        // immediately. Only seeded when no template exists — never clobbers.
        const cols = cur.gridTemplateColumns || 'none';
        if (!cols || cols === 'none') applyStyle('gridTemplateColumns', '1fr 1fr');
      }
      return;
    }

    // Rotate ±90° quick buttons. Reads current `rotate` longhand, increments
    // by the requested step, writes back. Wraps within (-360, 360).
    const rotateStepBtn = target.closest<HTMLElement>('[data-dm-rotate-step]');
    if (rotateStepBtn) {
      e.stopPropagation();
      const step = parseFloat(rotateStepBtn.dataset.dmRotateStep || '0');
      const cur = parseFloat((info?.computedStyles?.rotate || '0').replace('deg','')) || 0;
      const next = ((cur + step) % 360 + 360) % 360;
      applyStyle('rotate', next + 'deg');
      return;
    }

    // Transform-origin 9-cell pad — writes the keyword pair (e.g. `top left`).
    const tOriginBtn = target.closest<HTMLElement>('[data-dm-transform-origin]');
    if (tOriginBtn) {
      e.stopPropagation();
      const val = tOriginBtn.dataset.dmTransformOrigin!;
      applyStyle('transformOrigin', val);
      return;
    }

    // Z-order ±1 step (Bring forward / Send backward).
    const zStepBtn = target.closest<HTMLElement>('[data-dm-z-step]');
    if (zStepBtn) {
      e.stopPropagation();
      const dir = zStepBtn.dataset.dmZStep === 'up' ? 1 : -1;
      const raw = info?.computedStyles?.zIndex || 'auto';
      const cur = (raw === 'auto' || raw === '') ? 0 : (parseInt(raw, 10) || 0);
      applyStyle('zIndex', String(cur + dir));
      return;
    }

    // Distribute (multi-select) — writes the parent's justify-content /
    // align-content via the SP_APPLY_PARENT_STYLE pipe (assumes parent gets
    // flex/grid). For the v1 path, we just write justify-content on the
    // parent of the focused element to space-between.
    const posDistBtn = target.closest<HTMLElement>('[data-dm-pos-distribute]');
    if (posDistBtn) {
      e.stopPropagation();
      const which = posDistBtn.dataset.dmPosDistribute!;
      send({ type: 'SP_APPLY_PARENT_STYLE',
        property: which === 'horizontal' ? 'justifyContent' : 'alignContent',
        value: 'space-between' });
      return;
    }

    // 9-cell children alignment pad — writes justify-content + align-items.
    const childAlignBtn = target.closest<HTMLElement>('[data-dm-children-align]');
    if (childAlignBtn) {
      e.stopPropagation();
      const cell = childAlignBtn.dataset.dmChildrenAlign!;
      const [h, v] = cell.split('-');
      const hMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
      const vMap: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
      const display = info?.computedStyles?.display || 'block';
      const isGrid = display === 'grid' || display === 'inline-grid';
      applyStyle(isGrid ? 'justifyItems' : 'justifyContent', hMap[h] || 'flex-start');
      applyStyle('alignItems', vMap[v] || 'stretch');
      return;
    }

    // Typography style toggles — bold / italic / underline / strikethrough.
    // Each flips between an "off" and "on" CSS value.
    const textToggleBtn = target.closest<HTMLElement>('[data-dm-text-toggle]');
    if (textToggleBtn) {
      e.stopPropagation();
      const which = textToggleBtn.dataset.dmTextToggle!;
      const s = info?.computedStyles || {};
      if (which === 'bold') {
        const cur = s.fontWeight || '400';
        const isBold = cur === '700' || cur === 'bold' || (parseInt(cur, 10) || 400) >= 600;
        applyStyle('fontWeight', isBold ? '400' : '700');
      } else if (which === 'italic') {
        applyStyle('fontStyle', s.fontStyle === 'italic' ? 'normal' : 'italic');
      } else if (which === 'underline') {
        const cur = s.textDecorationLine || 'none';
        const has = cur.includes('underline');
        const next = has ? cur.replace('underline','').trim() || 'none' : (cur === 'none' ? 'underline' : (cur + ' underline').trim());
        applyStyle('textDecorationLine', next);
      } else if (which === 'strikethrough') {
        const cur = s.textDecorationLine || 'none';
        const has = cur.includes('line-through');
        const next = has ? cur.replace('line-through','').trim() || 'none' : (cur === 'none' ? 'line-through' : (cur + ' line-through').trim());
        applyStyle('textDecorationLine', next);
      }
      return;
    }

    // List style — writes list-style-type.
    const listStyleBtn = target.closest<HTMLElement>('[data-dm-list-style]');
    if (listStyleBtn) {
      e.stopPropagation();
      const v = listStyleBtn.dataset.dmListStyle!;
      applyStyle('listStyleType', v);
      return;
    }

    // Typography one-click actions (Advanced disclosure).
    const typoActionBtn = target.closest<HTMLElement>('[data-dm-typo-action]');
    if (typoActionBtn) {
      e.stopPropagation();
      const action = typoActionBtn.dataset.dmTypoAction!;
      if (action === 'truncate') {
        // Single-line truncate preset. Three writes that together produce
        // the standard "ellipsis when overflowed" behaviour on a one-line
        // text container.
        applyStyle('textOverflow', 'ellipsis');
        applyStyle('whiteSpace', 'nowrap');
        applyStyle('overflow', 'hidden');
      }
      return;
    }

    // ─── Fill layered list ───
    // All Fill mutations operate on `fillLayersByElement` (the per-element
    // state), then dispatch the four comma-positional CSS properties at
    // once via dispatchFillLayers.
    const fillElIdNow = (): string => info?.id || '';
    const getFill = (): FillLayer[] => {
      const id = fillElIdNow();
      if (!id) return [];
      return getFillLayers(id, info?.computedStyles || {});
    };
    const setFill = (next: FillLayer[]): void => {
      const id = fillElIdNow();
      if (!id) return;
      fillLayersByElement.set(id, next);
      dispatchFillLayers(next, applyStyle);
    };

    const fillAddOpenBtn = target.closest<HTMLElement>('[data-dm-fill-add-open]');
    if (fillAddOpenBtn) { e.stopPropagation(); fillAddOpen = !fillAddOpen; render(); return; }

    const fillAddBtn = target.closest<HTMLElement>('[data-dm-fill-add]');
    if (fillAddBtn) {
      e.stopPropagation();
      const kind = fillAddBtn.dataset.dmFillAdd!;
      const layers = getFill();
      let newLayer: FillLayer | null = null;
      if (kind === 'solid') {
        newLayer = { kind: 'solid', raw: '#3b82f6', bgColorOnly: true, visible: true };
      } else if (kind === 'linear') {
        newLayer = { kind: 'linear', raw: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(0,0,0,1) 100%)', visible: true, size: 'auto', repeat: 'no-repeat', position: '0% 0%', blendMode: 'normal' };
      } else if (kind === 'radial') {
        newLayer = { kind: 'radial', raw: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(0,0,0,1) 100%)', visible: true, size: 'auto', repeat: 'no-repeat', position: '0% 0%', blendMode: 'normal' };
      } else if (kind === 'conic') {
        newLayer = { kind: 'conic', raw: 'conic-gradient(from 0deg, rgba(255,0,0,1) 0%, rgba(0,255,0,1) 33%, rgba(0,0,255,1) 66%, rgba(255,0,0,1) 100%)', visible: true, size: 'auto', repeat: 'no-repeat', position: '0% 0%', blendMode: 'normal' };
      } else if (kind === 'image') {
        newLayer = { kind: 'image', raw: 'url(https://images.unsplash.com/photo-1502744688674-c619d1586c9e?auto=format&fit=crop&w=400)', visible: true, size: 'cover', repeat: 'no-repeat', position: '50% 50%', blendMode: 'normal' };
      }
      if (newLayer) {
        // Solid replaces any existing solid. Image-stack layers go on TOP.
        const next = newLayer.bgColorOnly
          ? [...layers.filter(l => !l.bgColorOnly), newLayer]
          : [newLayer, ...layers];
        setFill(next);
        // Auto-expand the new layer so the user can edit it immediately.
        expandedFillIdx = newLayer.bgColorOnly ? next.length - 1 : 0;
      }
      fillAddOpen = false;
      return;
    }

    const fillRemoveBtn = target.closest<HTMLElement>('[data-dm-fill-remove]');
    if (fillRemoveBtn) {
      e.stopPropagation();
      const idx = parseInt(fillRemoveBtn.dataset.dmFillRemove || '-1', 10);
      const layers = getFill();
      if (idx >= 0 && idx < layers.length) {
        layers.splice(idx, 1);
        setFill(layers);
        if (expandedFillIdx === idx) expandedFillIdx = null;
      }
      return;
    }

    const fillExpandBtn = target.closest<HTMLElement>('[data-dm-fill-expand]');
    if (fillExpandBtn) {
      e.stopPropagation();
      const idx = parseInt(fillExpandBtn.dataset.dmFillExpand || '-1', 10);
      expandedFillIdx = expandedFillIdx === idx ? null : idx;
      render(); return;
    }

    // Per-fill visibility toggle — flips layer.visible and re-dispatches.
    const fillToggleBtn = target.closest<HTMLElement>('[data-dm-fill-toggle]');
    if (fillToggleBtn) {
      e.stopPropagation();
      const idx = parseInt(fillToggleBtn.dataset.dmFillToggle || '-1', 10);
      const layers = getFill();
      if (idx >= 0 && idx < layers.length) {
        layers[idx].visible = layers[idx].visible === false ? true : false;
        setFill(layers);
      }
      return;
    }

    // Image fill 4-mode segmented — atomically writes {size, repeat}.
    const fitBtn = target.closest<HTMLElement>('[data-dm-fill-fit-mode]');
    if (fitBtn) {
      e.stopPropagation();
      const mode = fitBtn.dataset.dmFillFitMode!;
      const fitIdx = parseInt(fitBtn.dataset.dmFillFitIdx || '-1', 10);
      const layers = getFill();
      if (layers[fitIdx]) {
        const presets: Record<string, { size: string; repeat: string }> = {
          fill: { size: 'cover', repeat: 'no-repeat' },
          fit:  { size: 'contain', repeat: 'no-repeat' },
          crop: { size: '100% 100%', repeat: 'no-repeat' },
          tile: { size: 'auto', repeat: 'repeat' },
        };
        const p = presets[mode];
        if (p) {
          layers[fitIdx].size = p.size;
          layers[fitIdx].repeat = p.repeat;
          setFill(layers);
        }
      }
      return;
    }

    // 9-cell position pad — writes "X% Y%" to the layer's position slot.
    const posCellBtn = target.closest<HTMLElement>('[data-dm-fill-pos-cell]');
    if (posCellBtn) {
      e.stopPropagation();
      const pos = posCellBtn.dataset.dmFillPosCell!;
      const posIdx = parseInt(posCellBtn.dataset.dmFillPosIdx || '-1', 10);
      const layers = getFill();
      if (layers[posIdx]) {
        layers[posIdx].position = pos;
        setFill(layers);
      }
      return;
    }

    // Per-fill stop add / remove (gradient layers).
    const stopAddBtn = target.closest<HTMLElement>('[data-dm-fill-stop-add]');
    if (stopAddBtn) {
      e.stopPropagation();
      const idx = parseInt(stopAddBtn.dataset.dmFillStopAdd || '-1', 10);
      const layers = getFill();
      const layer = layers[idx];
      if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
        const parsed = parseGradientStops(layer.raw);
        parsed.stops.push({ color: 'rgba(0,0,0,1)', position: '100%' });
        layer.raw = buildGradient(layer.kind, parsed.prefix, parsed.stops);
        setFill(layers);
      }
      return;
    }
    const stopRemoveBtn = target.closest<HTMLElement>('[data-dm-fill-stop-remove]');
    if (stopRemoveBtn) {
      e.stopPropagation();
      const tok = stopRemoveBtn.dataset.dmFillStopRemove || '';
      const m = tok.match(/^(\d+)_(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        const sIdx = parseInt(m[2], 10);
        const layers = getFill();
        const layer = layers[idx];
        if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
          const parsed = parseGradientStops(layer.raw);
          if (sIdx >= 0 && sIdx < parsed.stops.length && parsed.stops.length > 2) {
            parsed.stops.splice(sIdx, 1);
            layer.raw = buildGradient(layer.kind, parsed.prefix, parsed.stops);
            setFill(layers);
          }
        }
      }
      return;
    }

    // clip-path polygon vertex add / remove. Manipulates the polygon
    // string by appending or splicing one `X% Y%` pair.
    const polyAddBtn = target.closest<HTMLElement>('[data-dm-clippath-polygon-add]');
    if (polyAddBtn) {
      e.stopPropagation();
      const cur = parseClipPath((info?.computedStyles as any)?.clipPath || 'none');
      const pts = cur.kind === 'polygon' ? cur.points : '';
      const parts = pts.split(',').map(p => p.trim()).filter(Boolean);
      parts.push('50% 50%');
      applyStyle('clipPath', 'polygon(' + parts.join(', ') + ')');
      return;
    }
    const polyRemoveBtn = target.closest<HTMLElement>('[data-dm-clippath-polygon-remove]');
    if (polyRemoveBtn) {
      e.stopPropagation();
      const idx = parseInt(polyRemoveBtn.dataset.dmClippathPolygonRemove || '-1', 10);
      const cur = parseClipPath((info?.computedStyles as any)?.clipPath || 'none');
      if (cur.kind !== 'polygon') return;
      const parts = cur.points.split(',').map(p => p.trim()).filter(Boolean);
      if (idx < 0 || idx >= parts.length) return;
      parts.splice(idx, 1);
      applyStyle('clipPath', parts.length ? 'polygon(' + parts.join(', ') + ')' : 'none');
      return;
    }

    // Stroke Advanced — one-click presets for the border-image suite.
    const strokeActionBtn = target.closest<HTMLElement>('[data-dm-stroke-action]');
    if (strokeActionBtn) {
      e.stopPropagation();
      const action = strokeActionBtn.dataset.dmStrokeAction;
      if (action === 'gradient-stroke') {
        // Need a non-zero border-width and any border-style for the
        // image to render. Default to 4px solid + a vibrant gradient.
        applyStyle('borderImageSource', 'linear-gradient(135deg, #ff0080, #7928ca)');
        applyStyle('borderImageSlice', '1');
        applyStyle('borderImageWidth', '1');
        applyStyle('borderImageOutset', '0');
        applyStyle('borderImageRepeat', 'stretch');
        const w = parseFloat(info?.computedStyles?.borderTopWidth || '0') || 0;
        if (w === 0) {
          ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].forEach(p => applyStyle(p, '4px'));
        }
        const st = info?.computedStyles?.borderTopStyle || 'none';
        if (st === 'none') {
          ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'].forEach(p => applyStyle(p, 'solid'));
        }
      } else if (action === 'clear-border-image' || action === 'native-dashes') {
        applyStyle('borderImageSource', 'none');
        applyStyle('borderImageSlice', '100%');
        applyStyle('borderImageWidth', '1');
        applyStyle('borderImageOutset', '0');
        applyStyle('borderImageRepeat', 'stretch');
      } else if (action === 'custom-dashes') {
        // Synthesise a corner-aware SVG with the current dash/gap/cap/colour
        // settings and use it as `border-image-source`. Pair with `repeat:
        // round` so the browser auto-aligns dashes at every edge.
        const cs = info?.computedStyles || {};
        const dash = parseFloat(((cs as any)['--dm-stroke-dash'] || '4').replace('px','')) || 4;
        const gap  = parseFloat(((cs as any)['--dm-stroke-gap']  || '4').replace('px','')) || 4;
        const cap  = (((cs as any)['--dm-stroke-cap'] || 'square').trim() === 'round' ? 'round' : 'square') as 'square'|'round';
        const weight = parseFloat(cs.borderTopWidth || '0') || 0;
        const color = cs.borderTopColor || '#000000';
        if (weight <= 0) {
          // Border-image only renders with non-zero width and a non-none style.
          ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].forEach(p => applyStyle(p, '2px'));
        }
        const stCur = cs.borderTopStyle || 'none';
        if (stCur === 'none') {
          ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'].forEach(p => applyStyle(p, 'solid'));
        }
        const built = buildCornerAwareDashSvg({
          weight: weight > 0 ? weight : 2,
          dash, gap, cap, color,
        });
        applyStyle('borderImageSource', built.dataUri);
        applyStyle('borderImageSlice', String(built.slice));
        applyStyle('borderImageWidth', '1');
        applyStyle('borderImageOutset', '0');
        applyStyle('borderImageRepeat', 'round');
      }
      return;
    }

    // ─── Stroke layered list (multi-stroke) ───
    const strokeAddBtn = target.closest<HTMLElement>('[data-dm-stroke-add]');
    if (strokeAddBtn) {
      e.stopPropagation();
      if (strokeAddBtn.hasAttribute('disabled')) return;
      const id = info?.id || '';
      if (!id) return;
      const cs = info?.computedStyles || {};
      const pos = inferStrokePosition(cs);
      if (pos === 'center') return; // multi not supported on outline
      const layers = getStrokeLayers(id, cs, pos);
      // Default new stroke: 1px white on top of the stack.
      layers.unshift({ weight: 1, color: '#ffffff', visible: true });
      activeStrokeIdx = 0;
      strokeLayersByElement.set(id, layers);
      const intent = strokeStyleByElement.get(id);
      const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
      dispatchStrokeLayers(layers, pos, cs, applyStyle, styleNow);
      return;
    }

    const strokeRemoveBtn = target.closest<HTMLElement>('[data-dm-stroke-remove]');
    if (strokeRemoveBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(strokeRemoveBtn.dataset.dmStrokeRemove || '-1', 10);
      const cs = info?.computedStyles || {};
      const pos = inferStrokePosition(cs);
      const layers = getStrokeLayers(id, cs, pos);
      if (idx < 0 || idx >= layers.length) return;
      layers.splice(idx, 1);
      // Re-point activeStrokeIdx so it stays valid.
      if (activeStrokeIdx >= layers.length) activeStrokeIdx = Math.max(0, layers.length - 1);
      strokeLayersByElement.set(id, layers);
      const intent = strokeStyleByElement.get(id);
      const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
      dispatchStrokeLayers(layers, pos, cs, applyStyle, styleNow);
      return;
    }

    const strokeToggleBtn = target.closest<HTMLElement>('[data-dm-stroke-toggle]');
    if (strokeToggleBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(strokeToggleBtn.dataset.dmStrokeToggle || '-1', 10);
      const cs = info?.computedStyles || {};
      const pos = inferStrokePosition(cs);
      const layers = getStrokeLayers(id, cs, pos);
      if (idx < 0 || idx >= layers.length) return;
      layers[idx].visible = layers[idx].visible === false ? true : false;
      strokeLayersByElement.set(id, layers);
      const intent = strokeStyleByElement.get(id);
      const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
      dispatchStrokeLayers(layers, pos, cs, applyStyle, styleNow);
      return;
    }

    const strokeSelectBtn = target.closest<HTMLElement>('[data-dm-stroke-select]');
    if (strokeSelectBtn) {
      e.stopPropagation();
      const idx = parseInt(strokeSelectBtn.dataset.dmStrokeSelect || '-1', 10);
      if (idx >= 0) { activeStrokeIdx = idx; render(); }
      return;
    }

    // One-click "Gradient text" preset — only meaningful when a gradient
    // fill exists, but applying it on a solid still produces visible-glyph
    // text behaviour (transparent fill).
    const fillActionBtn = target.closest<HTMLElement>('[data-dm-fill-action]');
    if (fillActionBtn) {
      e.stopPropagation();
      if (fillActionBtn.dataset.dmFillAction === 'gradient-text') {
        applyStyle('backgroundClip', 'text');
        applyStyle('webkitBackgroundClip', 'text');
        applyStyle('webkitTextFillColor', 'transparent');
        applyStyle('color', 'transparent');
      }
      return;
    }

    // ─── Effects layered list ───
    const effectExpandBtn = target.closest<HTMLElement>('[data-dm-effect-expand]');
    if (effectExpandBtn) {
      e.stopPropagation();
      const idx = parseInt(effectExpandBtn.dataset.dmEffectExpand || '-1', 10);
      expandedEffectIdx = expandedEffectIdx === idx ? null : idx;
      render(); return;
    }

    const effectRemoveBtn = target.closest<HTMLElement>('[data-dm-effect-remove]');
    if (effectRemoveBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(effectRemoveBtn.dataset.dmEffectRemove || '-1', 10);
      const cs = info?.computedStyles || {};
      const isText = (cs as any)['_kind'] === 'text';
      const list = parseEffects(cs, id, isText || (info && (info.tagName || '').match(/^(p|h[1-6]|span|a|li|button|label)$/i)) ? true : false);
      const target2 = list[idx];
      if (!target2) return;
      // Drop the relevant entry from its CSS chain.
      if (target2.kind === 'drop-shadow' || target2.kind === 'inner-shadow') {
        const entries = parseCssCommaList(cs.boxShadow || '');
        entries.splice(target2.chainIdx, 1);
        applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
      } else if (target2.kind === 'filter-drop-shadow' || target2.kind === 'layer-blur') {
        const list2 = splitFilterFunctions(cs.filter || '');
        list2.splice((target2 as any).chainIdx, 1);
        applyStyle('filter', list2.length ? list2.join(' ') : 'none');
      } else if (target2.kind === 'backdrop-blur') {
        const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
        list2.splice(target2.chainIdx, 1);
        applyStyle('backdropFilter', list2.length ? list2.join(' ') : 'none');
      } else if (target2.kind === 'text-shadow') {
        applyStyle('textShadow', 'none');
      }
      // Clean up any stash for this id.
      const hidden = hiddenEffectsByElement.get(id);
      if (hidden) hidden.delete(target2.id);
      return;
    }

    // Per-effect visibility — flips an in-memory hidden flag and stashes /
    // restores the entry's CSS so the row can come back exactly as it was.
    const effectToggleBtn = target.closest<HTMLElement>('[data-dm-effect-toggle]');
    if (effectToggleBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(effectToggleBtn.dataset.dmEffectToggle || '-1', 10);
      const cs = info?.computedStyles || {};
      const isTextLayer = !!(info && (info.tagName || '').match(/^(p|h[1-6]|span|a|li|button|label)$/i));
      const list = parseEffects(cs, id, isTextLayer);
      const target2 = list[idx];
      if (!target2) return;
      let hidden = hiddenEffectsByElement.get(id);
      if (!hidden) { hidden = new Set<string>(); hiddenEffectsByElement.set(id, hidden); }
      const stashKey = id + '::' + target2.id;
      if (hidden.has(target2.id)) {
        // Restore — read the stashed raw entry and splice back into chain.
        const stashed = stashedEffectByKey.get(stashKey);
        hidden.delete(target2.id);
        stashedEffectByKey.delete(stashKey);
        if (stashed) {
          if (target2.kind === 'drop-shadow' || target2.kind === 'inner-shadow') {
            const entries = parseCssCommaList(cs.boxShadow || '');
            entries.splice(target2.chainIdx, 0, stashed);
            applyStyle('boxShadow', entries.join(', '));
          } else if (target2.kind === 'filter-drop-shadow' || target2.kind === 'layer-blur') {
            const list2 = splitFilterFunctions(cs.filter || '');
            list2.splice((target2 as any).chainIdx, 0, stashed);
            applyStyle('filter', list2.join(' '));
          } else if (target2.kind === 'backdrop-blur') {
            const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
            list2.splice(target2.chainIdx, 0, stashed);
            applyStyle('backdropFilter', list2.join(' '));
          } else if (target2.kind === 'text-shadow') {
            applyStyle('textShadow', stashed);
          }
        }
      } else {
        // Hide — stash the raw entry and remove from CSS.
        hidden.add(target2.id);
        stashedEffectByKey.set(stashKey, target2.raw);
        if (target2.kind === 'drop-shadow' || target2.kind === 'inner-shadow') {
          const entries = parseCssCommaList(cs.boxShadow || '');
          entries.splice(target2.chainIdx, 1);
          applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
        } else if (target2.kind === 'filter-drop-shadow' || target2.kind === 'layer-blur') {
          const list2 = splitFilterFunctions(cs.filter || '');
          list2.splice((target2 as any).chainIdx, 1);
          applyStyle('filter', list2.length ? list2.join(' ') : 'none');
        } else if (target2.kind === 'backdrop-blur') {
          const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
          list2.splice(target2.chainIdx, 1);
          applyStyle('backdropFilter', list2.length ? list2.join(' ') : 'none');
        } else if (target2.kind === 'text-shadow') {
          applyStyle('textShadow', 'none');
        }
      }
      return;
    }

    // (Stroke layered-list handlers — add / remove / toggle / select —
    // live above, alongside the rest of the section's wiring.)

    // Color-adjust toggles for `filter` and `backdrop-filter`. Each click
    // toggles the named function on the target shorthand, composing with
    // any existing functions (e.g. existing `contrast(1.2)` is preserved
    // when the user adds `saturate(1.5)`). Re-clicking an active function
    // removes it. Empty result writes `none`.
    const filterFnBtn = target.closest<HTMLElement>('[data-dm-filter-fn], [data-dm-bdfilter-fn]');
    if (filterFnBtn) {
      e.stopPropagation();
      const which = filterFnBtn.dataset.dmFilterFn ?? filterFnBtn.dataset.dmBdfilterFn!;
      const isBackdrop = !!filterFnBtn.dataset.dmBdfilterFn;
      const defaults: Record<string, string> = {
        brightness: 'brightness(1.2)', contrast: 'contrast(1.2)',
        saturate: 'saturate(1.5)', 'hue-rotate': 'hue-rotate(45deg)',
        grayscale: 'grayscale(50%)', invert: 'invert(50%)', sepia: 'sepia(50%)',
        blur: 'blur(8px)',
        'drop-shadow': 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))',
      };
      const cssProp = isBackdrop ? 'backdropFilter' : 'filter';
      const cur = (info?.computedStyles?.[cssProp] || 'none').toLowerCase();
      const fnRe = new RegExp('\\b' + which.replace(/[-]/g, '-') + '\\([^)]*\\)\\s*', 'gi');
      const hasFn = fnRe.test(cur);
      // Reset the lastIndex on the global regex so the replace below starts fresh.
      fnRe.lastIndex = 0;
      let next = (cur === 'none' ? '' : cur).replace(fnRe, '').replace(/\s+/g, ' ').trim();
      if (!hasFn) next = (next + ' ' + (defaults[which] || (which + '(1)'))).trim();
      applyStyle(cssProp, next || 'none');
      return;
    }

    // Stroke position selector (Inside / Outside / Center).
    const strokePosBtn = target.closest<HTMLElement>('[data-dm-stroke-pos]');
    if (strokePosBtn) {
      e.stopPropagation();
      const pos = strokePosBtn.dataset.dmStrokePos as 'inside' | 'outside' | 'center';
      applyStrokePosition(pos);
      return;
    }

    // Sides selector (All/Top/Bottom/Left/Right/Custom). Writes per-side
    // border-width longhands to project the desired pattern.
    const sideBtn = target.closest<HTMLElement>('[data-dm-side]');
    if (sideBtn) {
      e.stopPropagation();
      const side = sideBtn.dataset.dmSide!;
      const s = info?.computedStyles || {};
      const cur = parseFloat(s.borderTopWidth || s.borderRightWidth || s.borderBottomWidth || s.borderLeftWidth || '1') || 1;
      const w = (cur > 0 ? cur : 1) + 'px';
      const zero = '0px';
      if (side === 'all') {
        applyStyle('borderTopWidth', w); applyStyle('borderRightWidth', w);
        applyStyle('borderBottomWidth', w); applyStyle('borderLeftWidth', w);
      } else if (side === 'top') {
        applyStyle('borderTopWidth', w); applyStyle('borderRightWidth', zero);
        applyStyle('borderBottomWidth', zero); applyStyle('borderLeftWidth', zero);
      } else if (side === 'bottom') {
        applyStyle('borderTopWidth', zero); applyStyle('borderRightWidth', zero);
        applyStyle('borderBottomWidth', w); applyStyle('borderLeftWidth', zero);
      } else if (side === 'left') {
        applyStyle('borderTopWidth', zero); applyStyle('borderRightWidth', zero);
        applyStyle('borderBottomWidth', zero); applyStyle('borderLeftWidth', w);
      } else if (side === 'right') {
        applyStyle('borderTopWidth', zero); applyStyle('borderRightWidth', w);
        applyStyle('borderBottomWidth', zero); applyStyle('borderLeftWidth', zero);
      }
      sidesPopoverOpen = false;
      return;
    }

    // Effects add-menu — adds the chosen effect or applies a multi-property
    // preset. Each `kind` corresponds to one + menu item.
    const addEffectBtn = target.closest<HTMLElement>('[data-dm-add-effect]');
    if (addEffectBtn) {
      e.stopPropagation();
      const kind = addEffectBtn.dataset.dmAddEffect!;
      const cs = info?.computedStyles || {};
      // Helper: append a new entry to a comma-separated chain.
      const appendBoxShadow = (newEntry: string) => {
        const cur = cs.boxShadow || 'none';
        const next = cur === 'none' || !cur ? newEntry : (cur + ', ' + newEntry);
        applyStyle('boxShadow', next);
      };
      const appendFilter = (newFn: string) => {
        const list = splitFilterFunctions(cs.filter || '');
        list.push(newFn);
        applyStyle('filter', list.join(' '));
      };
      const appendBackdrop = (newFn: string) => {
        const list = splitFilterFunctions((cs as any).backdropFilter || '');
        list.push(newFn);
        applyStyle('backdropFilter', list.join(' '));
      };
      // Single-effect adds — always APPEND so multi-shadow / multi-filter
      // stacks naturally instead of overwriting an existing effect.
      if (kind === 'drop-shadow') appendBoxShadow('0px 4px 12px 0px rgba(0, 0, 0, 0.12)');
      else if (kind === 'inner-shadow') appendBoxShadow('inset 0px 2px 6px 0px rgba(0, 0, 0, 0.18)');
      else if (kind === 'text-shadow') applyStyle('textShadow', '0px 1px 2px rgba(0, 0, 0, 0.25)');
      else if (kind === 'filter-drop-shadow') appendFilter('drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))');
      else if (kind === 'layer-blur') appendFilter('blur(4px)');
      else if (kind === 'backdrop-blur') appendBackdrop('blur(8px)');
      else if (kind === 'transition') applyStyle('transition', 'all 0.2s ease');
      else if (kind === 'animation') applyStyle('animation', 'dm-fade-in 0.4s ease both');
      else if (kind === 'transform') applyStyle('translate', '0px 0px');
      // Motion path — seed an oval for the preset; user customises via
      // the inline editor that appears in the Motion subsection.
      else if (kind === 'motion-path') {
        applyStyle('offsetPath', 'path("M 0,50 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0")');
        applyStyle('offsetDistance', '0%');
        applyStyle('offsetRotate', 'auto');
      }
      // View transition — seed a unique-ish name so the user has
      // something concrete to bind to in their startViewTransition() call.
      else if (kind === 'view-transition') {
        const seed = 'vt-' + Math.random().toString(36).slice(2, 7);
        applyStyle('viewTransitionName', seed);
      }
      // Scroll-driven animation — seed an animation-timeline + range so
      // the user has a working scroll-progress binding immediately. They
      // pair it with the existing animation-* properties on this element.
      else if (kind === 'scroll-driven') {
        applyStyle('animationTimeline', 'scroll(root block)');
        applyStyle('animationRange', 'entry 0% exit 100%');
        // If there's no animation set yet, seed one so something visible
        // happens when the user scrolls. dm-fade-in is harmless.
        const cur = (info?.computedStyles?.animationName || 'none').trim();
        if (cur === 'none' || !cur) {
          applyStyle('animation', 'dm-fade-in 1s linear both');
        }
      }
      // Multi-effect presets — each writes a curated bundle of properties.
      else if (kind === 'preset-soft-drop') {
        appendBoxShadow('0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.08)');
      }
      else if (kind === 'preset-hard-drop') {
        appendBoxShadow('0 2px 0 rgba(0, 0, 0, 0.85)');
      }
      else if (kind === 'preset-layered-drop') {
        appendBoxShadow('0 1px 2px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.06)');
      }
      else if (kind === 'preset-glow') {
        appendBoxShadow('0 0 0 2px rgba(79,158,255,0.45), 0 0 20px rgba(79,158,255,0.55)');
      }
      else if (kind === 'preset-embossed') {
        appendBoxShadow('inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)');
      }
      else if (kind === 'preset-frosted-glass') {
        // Background blur + a small saturate so the frost doesn't go grey.
        appendBackdrop('blur(12px)');
        appendBackdrop('saturate(1.4)');
      }
      else if (kind === 'preset-neon-text') {
        // Stack of coloured text-shadows for a neon glow. text-shadow
        // accepts a comma-separated chain (unlike single-applyStyle
        // patterns we use for box-shadow).
        applyStyle('textShadow', '0 0 4px #fff, 0 0 8px #fff, 0 0 14px #ff00de, 0 0 20px #ff00de, 0 0 30px #ff00de');
      }
      effectsMenuOpen = false;
      return;
    }

    // Motion-subsection action buttons (clears + small presets).
    const effectActionBtn = target.closest<HTMLElement>('[data-dm-effect-action]');
    if (effectActionBtn) {
      e.stopPropagation();
      const action = effectActionBtn.dataset.dmEffectAction!;
      if (action === 'clear-motion-path') {
        applyStyle('offsetPath', 'none');
        applyStyle('offsetDistance', '0%');
        applyStyle('offsetRotate', 'auto');
        applyStyle('offsetAnchor', 'auto');
        applyStyle('offsetPosition', 'auto');
      } else if (action === 'clear-view-transition') {
        applyStyle('viewTransitionName', 'none');
        applyStyle('viewTransitionClass', 'none');
      } else if (action === 'clear-scroll-driven') {
        applyStyle('animationTimeline', 'auto');
        applyStyle('animationRange', 'normal');
        applyStyle('scrollTimelineName', 'none');
        applyStyle('scrollTimelineAxis', 'block');
        applyStyle('viewTimelineName', 'none');
        applyStyle('viewTimelineAxis', 'block');
        applyStyle('viewTimelineInset', 'auto');
        applyStyle('timelineScope', 'none');
      } else if (action === 'preset-scroll-progress') {
        applyStyle('animationTimeline', 'scroll(root block)');
        applyStyle('animationRange', 'entry 0% exit 100%');
      }
      return;
    }

    // Stroke eye toggle (Fill section header eye was removed — Fill visibility
    // is controlled per-layer via the eye on each row).
    const strokeEyeBtn = target.closest<HTMLElement>('[data-dm-stroke-eye]');
    if (strokeEyeBtn) {
      e.stopPropagation();
      const s = info?.computedStyles || {};
      const off = (s.borderTopStyle || 'none') === 'none';
      const next = off ? 'solid' : 'none';
      applyStyle('borderTopStyle', next); applyStyle('borderRightStyle', next);
      applyStyle('borderBottomStyle', next); applyStyle('borderLeftStyle', next);
      return;
    }

    // v1.2: Batch apply (toggle visual flag)
    const batchBtn = target.closest<HTMLElement>('[data-dm-batch-apply]');
    if (batchBtn) {
      const cid = batchBtn.dataset.dmBatchApply!;
      if (batchAppliedChanges.has(cid)) {
        // Already batched — clear the flag (does not un-apply)
        batchAppliedChanges.delete(cid);
        render();
        return;
      }
      batchAppliedChanges.add(cid);
      render();
      send({ type: 'SP_BATCH_APPLY_CHANGE', changeId: cid }).then(r => {
        if (r?.styleChanges) styleChanges = r.styleChanges;
        if (r?.textChanges) textChanges = r.textChanges;
        if (r?.domChanges) domChanges = r.domChanges;
        if (r?.comments) comments = r.comments;
        render();
      });
      return;
    }
  });

  // Change handler (selects)
  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;

    // (Preset kind / filter selectors are chip-style buttons now — wired
    // in the click handler below.)

    // Import presets file input
    const importInput = target.closest<HTMLInputElement>('[data-dm-import-presets]');
    if (importInput && importInput.files?.[0]) {
      const file = importInput.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const json = ev.target?.result as string;
        send({ type: 'SP_IMPORT_PRESETS', json }).then(r => {
          importInput.value = '';
          if (r?.error) {
            showCaptureToast('error', r.error);
            return;
          }
          const count = r?.count ?? 0;
          const total = r?.total ?? count;
          if (count === 0) {
            showCaptureToast('error', `Imported 0 of ${total} presets — none were valid.`);
            return;
          }
          showCaptureToast('success',
            count === total
              ? `Imported ${count} preset${count === 1 ? '' : 's'}.`
              : `Imported ${count} of ${total} presets (${total - count} skipped as invalid).`);
          presetsTab = 'custom';
          refreshPresets();
        });
      };
      reader.readAsText(file);
      return;
    }

    // Import changes file input — replaces every tracked change on the page
    // with the imported payload. Validates the envelope before sending so a
    // malformed file is rejected client-side.
    const importChangesInput = target.closest<HTMLInputElement>('[data-dm-import-changes]');
    if (importChangesInput && importChangesInput.files?.[0]) {
      const file = importChangesInput.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        importChangesInput.value = '';
        let parsed: any = null;
        try { parsed = JSON.parse(ev.target?.result as string); }
        catch { showCaptureToast('error', 'Invalid JSON.'); return; }
        if (!parsed || typeof parsed !== 'object' || parsed.kind !== 'design-mode-changes') {
          showCaptureToast('error', 'Not a Design Mode changes file.');
          return;
        }
        const payload = {
          styleChanges: Array.isArray(parsed.styleChanges) ? parsed.styleChanges : [],
          textChanges: Array.isArray(parsed.textChanges) ? parsed.textChanges : [],
          domChanges: Array.isArray(parsed.domChanges) ? parsed.domChanges : [],
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        };
        send({ type: 'SP_IMPORT_CHANGES', payload }).then(r => {
          if (!r?.ok) { showCaptureToast('error', r?.error || 'Import failed.'); return; }
          if (r.styleChanges) styleChanges = r.styleChanges;
          if (r.textChanges) textChanges = r.textChanges;
          if (r.domChanges) domChanges = r.domChanges;
          if (r.comments) comments = r.comments;
          render();
          const total = payload.styleChanges.length + payload.textChanges.length + payload.domChanges.length + payload.comments.length;
          showCaptureToast('success', `Imported ${total} change${total === 1 ? '' : 's'}.`);
        });
      };
      reader.readAsText(file);
      return;
    }


    // Select property change
    const propSelect = target.closest<HTMLSelectElement>('select[data-dm-prop]');
    if (propSelect) {
      const prop = propSelect.dataset.dmProp!;
      const val = propSelect.value;
      const borderStyles = ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'];
      if (borderStyleLinked && borderStyles.includes(prop)) {
        Promise.all(borderStyles.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      // Position dropdown — prefill sensible offsets so the layer is
      // visible immediately. Only fills when the user hasn't already set
      // the offset (top/left still 'auto'), so we never clobber intent.
      if (prop === 'position') {
        const cur = info?.computedStyles || {};
        applyStyle('position', val);
        const topAuto = !cur.top || cur.top === 'auto';
        const leftAuto = !cur.left || cur.left === 'auto';
        if ((val === 'absolute' || val === 'fixed') && topAuto && leftAuto) {
          applyStyle('top', '0px');
          applyStyle('left', '0px');
        } else if (val === 'sticky' && topAuto) {
          applyStyle('top', '0px');
        }
        return;
      }
      // clip-path shape change — writes a default for the new shape so the
      // editor fields below populate immediately.
      if (prop === '__clippath_shape') {
        const next = defaultClipPathFor(val as ClipPathDef['kind']);
        applyStyle('clipPath', serializeClipPath(next));
        return;
      }
      // Per-shadow inset <select> change — flips a box-shadow entry between
      // outer (drop) and inner. Re-uses the input-handler path by routing
      // through `applyStyle` on the synthetic `__effd_box_<idx>_inset` prop.
      const effdInsetMatch = prop.match(/^__effd_box_(\d+)_inset$/);
      if (effdInsetMatch) {
        const cs = info?.computedStyles || {};
        const idx = parseInt(effdInsetMatch[1], 10);
        const entries = parseCssCommaList(cs.boxShadow || '');
        if (idx < 0 || idx >= entries.length) return;
        const parsed = parseShadowEntry(entries[idx]);
        if (!parsed) return;
        const sh: ShadowParts = { inset: val === 'inset', x: parsed.x, y: parsed.y, blur: parsed.blur, spread: parsed.spread, color: parsed.color };
        entries[idx] = formatShadowEntry(sh);
        applyStyle('boxShadow', entries.join(', '));
        return;
      }
      // Per-layer fill <select> changes (size / repeat / position / blend).
      // Mutates the per-element layer state then re-dispatches all four
      // comma-positional CSS properties at once.
      const fillMatch = prop.match(/^__fill_(size|repeat|position|blend)__(\d+)$/);
      if (fillMatch) {
        const id = info?.id || '';
        if (!id) return;
        const layers = getFillLayers(id, info?.computedStyles || {});
        const field = fillMatch[1];
        const i = parseInt(fillMatch[2], 10);
        if (layers[i] && !layers[i].bgColorOnly) {
          if (field === 'size') layers[i].size = val;
          else if (field === 'repeat') layers[i].repeat = val;
          else if (field === 'position') layers[i].position = val;
          else if (field === 'blend') layers[i].blendMode = val;
          fillLayersByElement.set(id, layers);
          dispatchFillLayers(layers, applyStyle);
        }
        return;
      }
      applyStyle(prop, val); return;
    }

    // Shadow field select change
    const shadowSelect = target.closest<HTMLSelectElement>('[data-dm-shadow-field]');
    if (shadowSelect) { applyShadowFromFields(); return; }

    // Text-shadow color picker (input event fires for type="color")
    const tsColor = target.closest<HTMLInputElement>('[data-dm-textshadow-field="color"]');
    if (tsColor) { applyTextShadowFromFields(); return; }

    // Text input change (on blur/enter). Also covers textareas so the
    // `grid-template-areas` editor can write multi-line strings.
    const propInput = target.closest<HTMLInputElement | HTMLTextAreaElement>('input[data-dm-prop], textarea[data-dm-prop]') as HTMLInputElement | null;
    if (propInput) {
      const prop = propInput.dataset.dmProp!;
      const isNumeric = propInput.dataset.dmNumeric === '1';
      const unit = propInput.dataset.dmUnit || '';
      const raw = propInput.value.trim();
      const isPureNumber = /^-?\d+(?:\.\d+)?$/.test(raw);
      const val = isNumeric && unit && isPureNumber ? raw + unit : raw;
      // Dash / gap inputs in the dashed-stroke panel — clamp to >= 1px
      // (positive integers only; CSS doesn't accept 0 here, matching
      // Figma's dash/gap UX).
      if (prop === '--dm-stroke-dash' || prop === '--dm-stroke-gap') {
        const num = parseFloat(raw);
        const clamped = (isNaN(num) || num < 1) ? 1 : num;
        propInput.value = String(clamped);
        applyStyle(prop, clamped + 'px');
        return;
      }
      // Line clamp composer — virtual __line_clamp from the Typography
      // Advanced disclosure writes the four CSS properties needed for the
      // -webkit-box clamp pattern (display, -webkit-box-orient, line-clamp,
      // overflow). N=0 clears all four back to defaults.
      if (prop === '__line_clamp') {
        const num = parseInt(raw, 10);
        if (!isFinite(num) || num <= 0) {
          // Clear clamp — leave display alone (don't fight the user) but reset
          // the clamp-specific properties so the line limit is removed.
          applyStyle('webkitLineClamp', 'none');
          applyStyle('webkitBoxOrient', 'horizontal');
          return;
        }
        applyStyle('display', '-webkit-box');
        applyStyle('webkitBoxOrient', 'vertical');
        applyStyle('webkitLineClamp', String(num));
        applyStyle('overflow', 'hidden');
        return;
      }
      // Elliptical corner-radius composer — virtual __corner_<key>_<axis>
      // splices the typed axis into the current border-*-radius value
      // without losing the other axis. Empty input falls back to the
      // existing axis (so leaving Y blank == circular).
      const cornerMatch = prop.match(/^__corner_(tl|tr|bl|br)_(x|y)$/);
      if (cornerMatch) {
        const key = cornerMatch[1] as 'tl'|'tr'|'bl'|'br';
        const axis = cornerMatch[2] as 'x'|'y';
        const cssProp = ({
          tl: 'borderTopLeftRadius', tr: 'borderTopRightRadius',
          bl: 'borderBottomLeftRadius', br: 'borderBottomRightRadius',
        } as const)[key];
        const cur = info?.computedStyles?.[cssProp] || '0px';
        const [curX, curY] = parseRadiusXY(cur);
        const nextX = axis === 'x' ? (val || '0px') : curX;
        const nextY = axis === 'y' ? (val || '0px') : curY;
        applyStyle(cssProp, nextX === nextY ? nextX : nextX + ' ' + nextY);
        return;
      }
      // clip-path composer — virtual __clippath_* props splice into the
      // current clip-path string. Each shape has its own field set; the
      // shape select writes a default for the new shape.
      if (prop.startsWith('__clippath_')) {
        const cur = (info?.computedStyles as any)?.clipPath || 'none';
        const cp = parseClipPath(cur);
        // __clippath_inset_<edge>
        let m = prop.match(/^__clippath_inset_(top|right|bottom|left)$/);
        if (m) {
          const edge = m[1];
          const next: ClipPathDef = cp.kind === 'inset'
            ? { ...cp, [edge]: val } as any
            : { kind: 'inset', top: val, right: val, bottom: val, left: val };
          applyStyle('clipPath', serializeClipPath(next));
          return;
        }
        m = prop.match(/^__clippath_circle_(r|x|y)$/);
        if (m) {
          const f = m[1];
          const base: any = cp.kind === 'circle' ? cp : { kind: 'circle', r: '50%', x: '50%', y: '50%' };
          base[f] = val;
          applyStyle('clipPath', serializeClipPath(base));
          return;
        }
        m = prop.match(/^__clippath_ellipse_(rx|ry|x|y)$/);
        if (m) {
          const f = m[1];
          const base: any = cp.kind === 'ellipse' ? cp : { kind: 'ellipse', rx: '50%', ry: '50%', x: '50%', y: '50%' };
          base[f] = val;
          applyStyle('clipPath', serializeClipPath(base));
          return;
        }
        if (prop === '__clippath_polygon') {
          applyStyle('clipPath', val.trim() ? `polygon(${val.trim()})` : 'none');
          return;
        }
        // Per-vertex polygon inputs — `__clippath_polygon_<x|y>_<idx>`.
        // Reads every vertex's X / Y from the rendered inputs, rebuilds
        // the polygon, and writes back. Empty inputs are kept as 0%.
        m = prop.match(/^__clippath_polygon_(x|y)_(\d+)$/);
        if (m) {
          const xs = root.querySelectorAll<HTMLInputElement>('[data-dm-prop^="__clippath_polygon_x_"]');
          const ys = root.querySelectorAll<HTMLInputElement>('[data-dm-prop^="__clippath_polygon_y_"]');
          const pairs: string[] = [];
          for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
            const xv = (xs[i]?.value || '0%').trim() || '0%';
            const yv = (ys[i]?.value || '0%').trim() || '0%';
            pairs.push(xv + ' ' + yv);
          }
          applyStyle('clipPath', pairs.length ? `polygon(${pairs.join(', ')})` : 'none');
          return;
        }
        if (prop === '__clippath_path') {
          applyStyle('clipPath', val.trim() ? `path('${val.trim()}')` : 'none');
          return;
        }
        if (prop === '__clippath_url') {
          applyStyle('clipPath', val.trim() ? `url(#${val.trim().replace(/^#/, '')})` : 'none');
          return;
        }
        return;
      }
      // Skew composer — virtual __skew_x / __skew_y from the Position
      // Advanced disclosure surgically merge into the existing `transform`
      // shorthand, preserving any rotate / translate / scale functions
      // the user (or another section) has set.
      if (prop === '__skew_x' || prop === '__skew_y') {
        const axis = prop === '__skew_x' ? 'X' : 'Y';
        const num = parseFloat(raw) || 0;
        const fn = `skew${axis}(${num}deg)`;
        const cur = info?.computedStyles?.transform || 'none';
        const base = (cur === 'none' || !cur) ? '' : cur.trim();
        // Strip any existing skewX / skewY (or combined skew) and append.
        const stripped = base
          .replace(/skewX\([^)]*\)/gi, '')
          .replace(/skewY\([^)]*\)/gi, '')
          .replace(/skew\([^)]*\)/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        const next = (stripped ? stripped + ' ' : '') + fn;
        applyStyle('transform', next || 'none');
        return;
      }
      // Per-effect edits via virtual prop names. The shape is
      //   __effd_<chain>_<chainIdx>_<field>
      // where chain ∈ {box, fx, text, lblur, bblur}. We splice the typed
      // value into the relevant CSS shorthand chain (box-shadow, filter,
      // backdrop-filter, text-shadow) without disturbing other entries.
      if (prop.startsWith('__effd_')) {
        const m = prop.match(/^__effd_(box|fx|text|lblur|bblur)_(\d+)_(\w+)$/);
        if (!m) return;
        const chain = m[1] as 'box' | 'fx' | 'text' | 'lblur' | 'bblur';
        const idx = parseInt(m[2], 10);
        const field = m[3];
        const cs = info?.computedStyles || {};

        // Layer / backdrop blur — single-radius edit.
        if (chain === 'lblur' || chain === 'bblur') {
          const cssProp = chain === 'lblur' ? 'filter' : 'backdropFilter';
          const list = splitFilterFunctions((cs as any)[cssProp] || '');
          if (idx < 0 || idx >= list.length) return;
          const num = parseFloat(raw) || 0;
          list[idx] = 'blur(' + num + 'px)';
          applyStyle(cssProp, list.length ? list.join(' ') : 'none');
          return;
        }

        // Shadow chains (box / fx / text). Reconstruct the entry from its
        // current CSS, modify the single field, and write back.
        const get = (): { entries: string[]; cssProp: 'boxShadow' | 'filter' | 'textShadow' } => {
          if (chain === 'box') return { entries: parseCssCommaList(cs.boxShadow || ''), cssProp: 'boxShadow' };
          if (chain === 'fx') return { entries: splitFilterFunctions(cs.filter || ''), cssProp: 'filter' };
          return { entries: [cs.textShadow || 'none'], cssProp: 'textShadow' };
        };
        const { entries, cssProp } = get();
        if (idx < 0 || idx >= entries.length) return;
        const cur = entries[idx];
        const isFx = chain === 'fx';
        const inner = isFx ? (cur.match(/^drop-shadow\((.*)\)\s*$/i)?.[1] || '') : cur;
        const parsed = parseShadowEntry(inner);
        if (!parsed) return;
        const sh: ShadowParts = {
          inset: parsed.inset, x: parsed.x, y: parsed.y,
          blur: parsed.blur, spread: parsed.spread, color: parsed.color,
        };
        if (field === 'x' || field === 'y' || field === 'blur' || field === 'spread') {
          (sh as any)[field] = parseFloat(raw) || 0;
        } else if (field === 'color') {
          sh.color = raw;
        } else if (field === 'inset') {
          sh.inset = raw === 'inset';
        }
        const next = isFx ? formatFilterDropShadow(sh) : formatShadowEntry(sh);
        entries[idx] = next;
        if (cssProp === 'boxShadow') applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
        else if (cssProp === 'filter') applyStyle('filter', entries.length ? entries.join(' ') : 'none');
        else applyStyle('textShadow', next);
        return;
      }
      // Per-layer fill edits via virtual prop names. The expanded body
      // emits these for each layer field. Mutates fillLayersByElement and
      // re-dispatches the four CSS properties at once.
      if (prop.startsWith('__fill_')) {
        const id = info?.id || '';
        if (!id) return;
        const layers = getFillLayers(id, info?.computedStyles || {});
        // __fill_color__N — solid color
        let m = prop.match(/^__fill_color__(\d+)$/);
        if (m) {
          const i = parseInt(m[1], 10);
          if (layers[i] && layers[i].kind === 'solid') {
            layers[i].raw = raw;
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        // __fill_url__N — image url (rewrap as url(...))
        m = prop.match(/^__fill_url__(\d+)$/);
        if (m) {
          const i = parseInt(m[1], 10);
          if (layers[i] && layers[i].kind === 'image') {
            const trimmed = raw.replace(/^url\(['"]?|['"]?\)$/g, '');
            layers[i].raw = 'url(' + trimmed + ')';
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        // __fill_grad_prefix__N — angle/shape config for gradients
        m = prop.match(/^__fill_grad_prefix__(\d+)$/);
        if (m) {
          const i = parseInt(m[1], 10);
          const layer = layers[i];
          if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
            const parsed = parseGradientStops(layer.raw);
            layer.raw = buildGradient(layer.kind, raw, parsed.stops);
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        // __fill_stop_color__N_M / __fill_stop_pos__N_M — gradient stop edits
        m = prop.match(/^__fill_stop_(color|pos)__(\d+)_(\d+)$/);
        if (m) {
          const field = m[1] as 'color' | 'pos';
          const i = parseInt(m[2], 10);
          const sIdx = parseInt(m[3], 10);
          const layer = layers[i];
          if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
            const parsed = parseGradientStops(layer.raw);
            if (parsed.stops[sIdx]) {
              if (field === 'color') parsed.stops[sIdx].color = raw;
              else parsed.stops[sIdx].position = raw;
              layer.raw = buildGradient(layer.kind, parsed.prefix, parsed.stops);
              fillLayersByElement.set(id, layers);
              dispatchFillLayers(layers, applyStyle);
            }
          }
          return;
        }
        // __fill_size__N / __fill_repeat__N / __fill_position__N / __fill_blend__N
        m = prop.match(/^__fill_(size|repeat|position|blend)__(\d+)$/);
        if (m) {
          const field = m[1];
          const i = parseInt(m[2], 10);
          if (layers[i] && !layers[i].bgColorOnly) {
            if (field === 'size') layers[i].size = raw;
            else if (field === 'repeat') layers[i].repeat = raw;
            else if (field === 'position') layers[i].position = raw;
            else if (field === 'blend') layers[i].blendMode = raw;
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        return;
      }
      // Per-layer stroke edits via virtual prop names from the expanded body.
      if (prop.startsWith('__stroke_color__') || prop.startsWith('__stroke_weight__')) {
        const m = prop.match(/^__stroke_(color|weight)__(\d+)$/);
        if (m) {
          const field = m[1] as 'color' | 'weight';
          const idx = parseInt(m[2], 10);
          const s2 = info?.computedStyles || {};
          const pos = inferStrokePosition(s2);
          if (pos !== 'center') {
            const layers = parseStrokeLayers(s2, pos);
            if (idx >= 0 && idx < layers.length) {
              if (field === 'color') layers[idx].color = raw;
              else layers[idx].weight = parseFloat(raw) || 0;
              applyStyle('boxShadow', serializeStrokeLayers(layers, pos, s2.boxShadow || ''));
            }
          }
        }
        return;
      }
      const borderWidths = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'];
      const borderRadii = ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'];
      const paddingSides = ['paddingTop','paddingRight','paddingBottom','paddingLeft'];
      const marginSides = ['marginTop','marginRight','marginBottom','marginLeft'];
      // Primary linked inputs fan out to all 4 sides.
      if (paddingLinked && (paddingSides.includes(prop) || prop === 'padding')) {
        Promise.all(paddingSides.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      if (marginLinked && (marginSides.includes(prop) || prop === 'margin')) {
        Promise.all(marginSides.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      // Fan-out is disabled when the Stroke per-side panel is open — each
      // side edits independently. Same idea as Figma's "edit per side"
      // mode: opening the panel implicitly unlinks.
      const strokePerSideOpen = !!advancedOpen.strokeSides;
      // Border-style auto-promote: a fresh element has border-style:none,
      // so writing border-*-width alone produces no visible change. When
      // the user edits any border-*-width in Outside mode and the style
      // is currently 'none', promote to the user's chosen style (solid by
      // default) so the change shows on the page.
      if (borderWidths.includes(prop)) {
        const elId = info?.id || '';
        const curPos = inferStrokePosition(info?.computedStyles || {});
        const curBorderStyle = info?.computedStyles?.borderTopStyle || 'none';
        if (curPos === 'outside' && (curBorderStyle === 'none' || !curBorderStyle)) {
          const intent = elId ? (strokeStyleByElement.get(elId) || 'solid') : 'solid';
          ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'].forEach(p2 => {
            send({ type: 'SP_APPLY_STYLE', property: p2, value: intent });
          });
        }
      }
      if (borderWidthLinked && !strokePerSideOpen && borderWidths.includes(prop)) {
        Promise.all(borderWidths.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      if (cornerRadiusLinked && (borderRadii.includes(prop) || prop === 'borderRadius')) {
        Promise.all(borderRadii.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      applyStyle(prop, val); return;
    }

    // Textarea text change
    const textArea = target.closest<HTMLTextAreaElement>('[data-dm-text]');
    if (textArea) {
      applyText(textArea.value);
      return;
    }
  });

  // Rich-text editor: toolbar commands. document.execCommand is what
  // contenteditable expects — bold/italic/underline/strikeThrough toggle
  // formatting on the selection; insertUnorderedList / insertOrderedList
  // wrap the current line(s) in <ul>/<ol>; createLink / removeFormat
  // self-explanatory. We intentionally call execCommand BEFORE focus
  // checks because `mousedown` on the toolbar button would already
  // have moved focus away from the editor. Each toolbar button has
  // mousedown.preventDefault to keep selection intact.
  root.addEventListener('mousedown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext-cmd]');
    if (btn) {
      e.preventDefault(); // keep selection in the editor
    }
  }, true);
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.dmRichtextCmd!;
    const editor = root.querySelector<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    editor.focus();
    if (cmd === 'createLink') {
      const url = window.prompt('Link URL:');
      if (url) document.execCommand('createLink', false, url);
    } else {
      document.execCommand(cmd, false);
    }
    // Save immediately so the change shows in the Changes tab + page.
    applyHtml(editor.innerHTML);
  }, true);

  // Auto-save on blur (when the user clicks outside the editor).
  root.addEventListener('focusout', (e) => {
    const editor = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    // Defer one tick so a click landing on a toolbar button (which
    // re-focuses the editor) doesn't trigger a save mid-action.
    setTimeout(() => {
      const stillFocused = document.activeElement && (document.activeElement as HTMLElement).closest('[data-dm-richtext]');
      if (stillFocused) return;
      applyHtml(editor.innerHTML);
    }, 0);
  }, true);

  // ── Site-color tokens dropdown — focus-driven popover on hex inputs ──
  // The tokens dropdown opens when a [data-dm-tokens-trigger] input is
  // focused and closes shortly after focus leaves (the delay lets the
  // click on a token register before the dropdown is removed).
  root.addEventListener('focusin', (e) => {
    const inp = (e.target as HTMLElement).closest<HTMLInputElement>('[data-dm-tokens-trigger]');
    if (!inp) return;
    const prop = inp.dataset.dmTokensTrigger!;
    if (tokensDropdownProp !== prop) {
      tokensDropdownProp = prop;
      render();
    }
  });
  root.addEventListener('focusout', (e) => {
    const inp = (e.target as HTMLElement).closest<HTMLInputElement>('[data-dm-tokens-trigger]');
    if (!inp || tokensDropdownProp !== inp.dataset.dmTokensTrigger) return;
    // Wait briefly so a click on a token (which fires after blur) can
    // apply the value before we tear the dropdown down.
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest('[data-dm-tokens-dropdown]')) return; // moved into dropdown
      if (tokensDropdownProp === inp.dataset.dmTokensTrigger) {
        tokensDropdownProp = null;
        render();
      }
    }, 200);
  });

  // ── Rich-text markdown shortcuts + URL autolink ────────────────────
  // Listens on `input` for the keystroke that completes a pattern, then
  // replaces the typed markdown with the corresponding HTML using the
  // existing Selection/Range. All helpers bail out when:
  //   • cursor isn't in a text node, or
  //   • the cursor is already inside an <a>, or
  //   • the pattern doesn't match exactly at the right boundary.
  // Order matters: most specific (markdown link) first, then list
  // prefixes, then bare URL autolink.

  function isInsideAnchor(node: Node | null): boolean {
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'A') return true;
      node = (node as any).parentNode;
    }
    return false;
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }

  function tryMarkdownLink(editor: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    if (!editor.contains(node)) return false;
    if (isInsideAnchor(node)) return false;
    const offset = range.startOffset;
    const text = (node.textContent || '').slice(0, offset);
    const m = text.match(/\[([^\]\n]+)\]\(([^)\s]+)\)$/);
    if (!m) return false;
    const [whole, label, url] = m;
    const start = offset - whole.length;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset);
    r.deleteContents();
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    return true;
  }

  function tryListShortcut(editor: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    if (!editor.contains(node)) return false;
    if (isInsideAnchor(node)) return false;
    // Don't re-list inside an existing list item.
    let parent: Node | null = node;
    while (parent) {
      const tag = (parent as Element).tagName?.toUpperCase?.();
      if (tag === 'LI' || tag === 'UL' || tag === 'OL') return false;
      parent = parent.parentNode;
    }
    const offset = range.startOffset;
    const text = node.textContent || '';
    // Pattern only triggers when the text node STARTS with the prefix and
    // the cursor is right after the trailing space. Conservative — keeps
    // mid-line "- " sequences intact.
    if (text.startsWith('- ') && offset === 2) {
      const r = document.createRange();
      r.setStart(node, 0); r.setEnd(node, 2); r.deleteContents();
      document.execCommand('insertUnorderedList');
      return true;
    }
    const numMatch = text.match(/^\d+\. /);
    if (numMatch && offset === numMatch[0].length) {
      const r = document.createRange();
      r.setStart(node, 0); r.setEnd(node, numMatch[0].length); r.deleteContents();
      document.execCommand('insertOrderedList');
      return true;
    }
    return false;
  }

  function tryUrlAutolink(editor: HTMLElement, trailingChar: string): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    if (!editor.contains(node)) return false;
    if (isInsideAnchor(node)) return false;
    const offset = range.startOffset;
    const text = node.textContent || '';
    // Look for a URL ending right before the trailing space/newline.
    if (text[offset - 1] !== trailingChar) return false;
    const before = text.slice(0, offset - 1);
    const m = before.match(/(https?:\/\/[^\s<>"'`)\]]+|www\.[^\s<>"'`)\]]+)$/);
    if (!m) return false;
    const url = m[1];
    const start = offset - 1 - url.length;
    const href = url.startsWith('http') ? url : 'https://' + url;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset - 1); // keep the trailing space outside the link
    r.deleteContents();
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`);
    return true;
  }

  root.addEventListener('input', (e) => {
    const editor = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    const ie = e as InputEvent;
    const data = ie.data ?? '';
    // Markdown link `[text](url)` triggers on the closing `)`.
    if (data === ')') { if (tryMarkdownLink(editor)) return; }
    // List shortcuts trigger on the trailing space after `- ` or `1. `.
    // URL autolink also triggers on space.
    if (data === ' ') {
      if (tryListShortcut(editor)) return;
      if (tryUrlAutolink(editor, ' ')) return;
    }
    // Newline (Enter) also linkifies a trailing URL.
    if (ie.inputType === 'insertParagraph' || ie.inputType === 'insertLineBreak') {
      tryUrlAutolink(editor, '\n');
    }
  }, true);

  // Paste autolink: a single bare URL becomes an anchor; mixed text
  // gets every URL inside auto-linked too. Falls through to the
  // default paste behavior when no URL is present so formatting from
  // copy sources (Word/Google Docs) still flows through.
  root.addEventListener('paste', (e) => {
    const editor = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    const ce = e as ClipboardEvent;
    const text = ce.clipboardData?.getData('text/plain');
    if (!text) return;
    // Only intervene when the pasted text contains http(s) URLs — leaves
    // formatted HTML pastes alone.
    if (!/(?:https?:\/\/|www\.)\S+/i.test(text)) return;
    e.preventDefault();
    const html = text.replace(/(https?:\/\/[^\s<>"'`)\]]+|www\.[^\s<>"'`)\]]+)/gi, (url) => {
      const href = url.startsWith('http') ? url : 'https://' + url;
      return `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`;
    });
    document.execCommand('insertHTML', false, html);
  }, true);

  // Input handler (color pickers, comment textarea, layer search)
  root.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;

    // Changes-tab search input — live-filter the list as the user types.
    const changesSearchInput = target.closest<HTMLInputElement>('[data-dm-changes-search]');
    if (changesSearchInput) {
      changesSearch = changesSearchInput.value;
      render();
      return;
    }

    // Settings inputs (port, auto-connect, hover/select colours). Each is
    // persisted to chrome.storage.local so the next session starts where
    // the user left off.
    const settingInput = target.closest<HTMLInputElement>('[data-dm-setting]');
    if (settingInput) {
      const key = settingInput.dataset.dmSetting!;
      if (key === 'wsPort') {
        const n = parseInt(settingInput.value, 10);
        if (isFinite(n) && n > 0) { mcpPort = n; chrome.storage?.local?.set?.({ 'dm-mcp-port': n }); }
        return;
      }
      if (key === 'autoConnect') {
        mcpAutoConnect = settingInput.checked;
        chrome.storage?.local?.set?.({ 'dm-mcp-auto-connect': mcpAutoConnect });
        return;
      }
      if (key === 'hoverColor') {
        inspectorHoverColor = settingInput.value;
        chrome.storage?.local?.set?.({ 'dm-inspector-hover-color': inspectorHoverColor });
        send({ type: 'SP_SET_INSPECTOR_COLORS', hover: inspectorHoverColor, select: inspectorSelectColor });
        return;
      }
      if (key === 'selectColor') {
        inspectorSelectColor = settingInput.value;
        chrome.storage?.local?.set?.({ 'dm-inspector-select-color': inspectorSelectColor });
        send({ type: 'SP_SET_INSPECTOR_COLORS', hover: inspectorHoverColor, select: inspectorSelectColor });
        return;
      }
      if (key === 'cloudUrl') {
        // Strip trailing slash for stable comparison + storage. We don't
        // reconnect on every keystroke — only when the user clicks
        // Connect or flips a mode chip.
        mcpCloudUrl = settingInput.value.replace(/\/$/, '');
        chrome.storage?.local?.set?.({ 'dm-mcp-cloud-url': mcpCloudUrl });
        return;
      }
    }

    // Color picker
    const colorPicker = target.closest<HTMLInputElement>('[data-dm-color]');
    if (colorPicker) {
      const prop = colorPicker.dataset.dmColor!;
      const val = colorPicker.value;
      const borderColors = ['borderTopColor','borderRightColor','borderBottomColor','borderLeftColor'];
      if (borderColorLinked && borderColors.includes(prop)) {
        Promise.all(borderColors.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; render();
        }); return;
      }
      applyStyle(prop, val); return;
    }

    // Shadow field inputs (color picker + number fields)
    const shadowInput = target.closest<HTMLInputElement>('[data-dm-shadow-field]');
    if (shadowInput) { applyShadowFromFields(); return; }

    // Text-shadow field inputs (number fields, color hex)
    const tsInput = target.closest<HTMLInputElement>('[data-dm-textshadow-field]');
    if (tsInput) { applyTextShadowFromFields(); return; }

    // Transform components: translate / scale X-Y fields.
    const tcompInput = target.closest<HTMLInputElement>('[data-dm-tcomp-group]');
    if (tcompInput) {
      const group = tcompInput.dataset.dmTcompGroup as 'translate' | 'scale';
      applyTransformComponentFromFields(group);
      return;
    }

    // Filter / backdrop-filter component fields. Sliders and number inputs
    // share group+field; sync the duo first, then recompose. The slider's
    // input event fires continuously as the user drags, so this gives the
    // realtime feedback the user wanted.
    const fcompInput = target.closest<HTMLInputElement>('[data-dm-fcomp-group]');
    if (fcompInput) {
      syncFilterSiblings(fcompInput);
      const group = fcompInput.dataset.dmFcompGroup as 'filter' | 'bfilter';
      applyFilterComponentsFromFields(group);
      return;
    }

    // Color picker — hex input. Each keystroke applies if the value is
    // a valid 3/6-digit hex (alpha 8-digit also tolerated).
    const hexEl = target.closest<HTMLInputElement>('[data-dm-color-hex]');
    if (hexEl) {
      const prop = hexEl.dataset.dmColorHex!;
      let v = hexEl.value.trim().replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(v)) {
        applyStyle(prop, '#' + v);
      }
      return;
    }
    // Color picker — RGB inputs (R, G, B).
    const rgbEl = target.closest<HTMLInputElement>('[data-dm-color-rgb]');
    if (rgbEl) {
      const prop = rgbEl.dataset.dmColorRgb!;
      const inputs = root.querySelectorAll<HTMLInputElement>('[data-dm-color-rgb="' + prop + '"]');
      const vals: Record<string, number> = { r: 0, g: 0, b: 0 };
      inputs.forEach(inp => { vals[inp.dataset.c!] = parseInt(inp.value, 10) || 0; });
      const r = clampInt(vals.r), g = clampInt(vals.g), b = clampInt(vals.b);
      const value = colorFormat === 'rgba' ? `rgb(${r}, ${g}, ${b})` : rgbToHexStr(r, g, b);
      applyStyle(prop, value);
      return;
    }
    // Color picker — HSL inputs (H, S, L) when format is HSL. Reads all
    // three values from the panel and writes back as `hsl(H, S%, L%)`.
    const hslEl = target.closest<HTMLInputElement>('[data-dm-color-hsl]');
    if (hslEl) {
      const prop = hslEl.dataset.dmColorHsl!;
      const inputs = root.querySelectorAll<HTMLInputElement>('[data-dm-color-hsl="' + prop + '"]');
      const vals: Record<string, number> = { h: 0, s: 0, l: 0 };
      inputs.forEach(inp => { vals[inp.dataset.c!] = parseFloat(inp.value) || 0; });
      const hh = ((vals.h % 360) + 360) % 360;
      const ss = Math.max(0, Math.min(100, vals.s));
      const ll = Math.max(0, Math.min(100, vals.l));
      applyStyle(prop, `hsl(${hh}, ${ss}%, ${ll}%)`);
      return;
    }

    // Color trigger input — search/filter the dropdown as user types
    const colorSearchInput = target.closest<HTMLInputElement>('[data-dm-color-trigger]');
    if (colorSearchInput && activeColorPickerProp === colorSearchInput.dataset.dmColorTrigger) {
      colorPickerSearch = colorSearchInput.value;
      // Re-render only the popover, but for simplicity just call render preserving focus
      const cursorPos = colorSearchInput.selectionStart;
      render();
      setTimeout(() => {
        const inp = root.querySelector<HTMLInputElement>('[data-dm-color-trigger="' + activeColorPickerProp + '"]');
        if (inp && document.activeElement !== inp) {
          inp.focus();
          if (cursorPos != null) inp.setSelectionRange(cursorPos, cursorPos);
        }
      }, 0);
      return;
    }

    // Comment text
    const commentInput = target.closest<HTMLTextAreaElement>('[data-dm-comment-input]');
    if (commentInput) {
      commentText = commentInput.value;
      commentDirty = true;
      return;
    }



    // Layer search (Phase 2)
    const searchInput = target.closest<HTMLInputElement>('[data-dm-layer-search]');
    if (searchInput) {
      layerSearch = searchInput.value;
      render();
      return;
    }

    // v1.2: Viz param sliders
    const vizParam = target.closest<HTMLInputElement>('[data-dm-viz-param]');
    if (vizParam) {
      const param = vizParam.dataset.dmVizParam!;
      const val = parseFloat(vizParam.value);
      if (param === 'bezX1') bezX1 = val;
      else if (param === 'bezY1') bezY1 = val;
      else if (param === 'bezX2') bezX2 = val;
      else if (param === 'bezY2') bezY2 = val;
      else if (param === 'sprStiffness') sprStiffness = val;
      else if (param === 'sprDamping') sprDamping = val;
      else if (param === 'sprMass') sprMass = val;
      render();
      return;
    }
  });

  // ─── Double-click on a layer name → enter inline rename mode ───────
  root.addEventListener('dblclick', (e) => {
    const nameEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-name]');
    if (!nameEl) return;
    e.preventDefault();
    e.stopPropagation();
    renamingLayerId = nameEl.dataset.dmLayerName!;
    render();
    setTimeout(() => {
      const inp = root.querySelector<HTMLInputElement>('[data-dm-layer-rename-input="' + renamingLayerId + '"]');
      if (inp) { inp.focus(); inp.select(); }
    }, 0);
  });

  // Commit rename on blur — empty value clears the override (back to the
  // tracker's smart name). Cancel via Escape (handled in keydown below).
  root.addEventListener('focusout', (e) => {
    const inp = (e.target as HTMLElement).closest<HTMLInputElement>('[data-dm-layer-rename-input]');
    if (!inp) return;
    const id = inp.dataset.dmLayerRenameInput!;
    const value = inp.value.trim();
    if (value) layerNameOverrides.set(id, value);
    else layerNameOverrides.delete(id);
    saveLayerState();
    if (renamingLayerId === id) { renamingLayerId = null; render(); }
  });

  // Keydown handler
  root.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;

    // Inline-rename input — Enter commits (focusout), Escape cancels.
    if (target.matches('[data-dm-layer-rename-input]')) {
      if (e.key === 'Enter') { e.preventDefault(); (target as HTMLInputElement).blur(); return; }
      if (e.key === 'Escape') { e.preventDefault(); renamingLayerId = null; render(); return; }
    }

    // Escape dismisses confirmation overlays (Clear All / Delete comment).
    if ((clearAllConfirming || deletingCommentId) && e.key === 'Escape') {
      e.preventDefault();
      clearAllConfirming = false;
      deletingCommentId = null;
      render();
      return;
    }

    // Comment textarea: Ctrl+Enter to submit, Escape to cancel
    if (target.matches('[data-dm-comment-input]')) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitComment(); }
      if (e.key === 'Escape') cancelComment();
      return;
    }

    // Color trigger: Enter applies typed value as custom color, Escape closes
    const colorTriggerKey = target.closest<HTMLInputElement>('[data-dm-color-trigger]');
    if (colorTriggerKey && activeColorPickerProp === colorTriggerKey.dataset.dmColorTrigger) {
      if (e.key === 'Escape') {
        e.preventDefault();
        activeColorPickerProp = null;
        colorPickerSearch = '';
        render();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = colorTriggerKey.value.trim();
        const prop = colorTriggerKey.dataset.dmColorTrigger!;
        activeColorPickerProp = null;
        colorPickerSearch = '';
        if (val) applyStyle(prop, val); else render();
        return;
      }
    }

    // Numeric input arrow keys + strict numeric filter
    // Transform-component / filter-component fields share the numeric-step
    // behavior but recompose their parent property instead of writing the
    // sub-field value directly.
    const tcompKb = target.closest<HTMLInputElement>('[data-dm-tcomp-group]');
    if (tcompKb && tcompKb.dataset.dmNumeric === '1' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      if (e.key !== 'Enter') {
        const step = e.shiftKey ? 10 : 1;
        const current = parseFloat(tcompKb.value) || 0;
        const newVal = e.key === 'ArrowUp' ? current + step : current - step;
        tcompKb.value = String(Math.round(newVal * 100) / 100);
      }
      applyTransformComponentFromFields(tcompKb.dataset.dmTcompGroup as 'translate' | 'scale');
      return;
    }
    const fcompKb = target.closest<HTMLInputElement>('[data-dm-fcomp-group]');
    if (fcompKb && fcompKb.dataset.dmNumeric === '1' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      if (e.key !== 'Enter') {
        const step = e.shiftKey ? (fcompKb.dataset.dmUnit === 'deg' ? 10 : 0.1) : (fcompKb.dataset.dmUnit === 'px' || fcompKb.dataset.dmUnit === 'deg' ? 1 : 0.05);
        const current = parseFloat(fcompKb.value) || 0;
        const newVal = e.key === 'ArrowUp' ? current + step : current - step;
        fcompKb.value = String(Math.round(newVal * 100) / 100);
      }
      syncFilterSiblings(fcompKb);
      applyFilterComponentsFromFields(fcompKb.dataset.dmFcompGroup as 'filter' | 'bfilter');
      return;
    }

    const propInput = target.closest<HTMLInputElement>('input[data-dm-prop]');
    if (propInput) {
      const isNumeric = propInput.dataset.dmNumeric === '1';
      const unit = propInput.dataset.dmUnit || '';

      if (e.key === 'Enter') {
        e.preventDefault();
        const raw = propInput.value.trim();
        const isPureNumber = /^-?\d+(?:\.\d+)?$/.test(raw);
        const val = isNumeric && unit && isPureNumber ? raw + unit : raw;
        applyStyle(propInput.dataset.dmProp!, val);
        return;
      }

      if (isNumeric && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const current = parseFloat(propInput.value) || 0;
        const newVal = e.key === 'ArrowUp' ? current + step : current - step;
        const rounded = Math.round(newVal * 100) / 100; // 2 decimals max
        propInput.value = String(rounded);
        const val = unit ? rounded + unit : String(rounded);
        applyStyle(propInput.dataset.dmProp!, val);
        return;
      }

      // Strict numeric filter — only allow valid number characters
      if (isNumeric) {
        const allowedKeys = ['Backspace','Tab','Escape','ArrowLeft','ArrowRight','Delete','Home','End'];
        if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
        if (e.key.length !== 1) return; // ignore other special keys
        const cur = propInput.value;
        const start = propInput.selectionStart ?? cur.length;
        const end = propInput.selectionEnd ?? cur.length;
        const next = cur.slice(0, start) + e.key + cur.slice(end);
        if (!/^-?\d{0,}(\.\d{0,2})?$/.test(next)) {
          e.preventDefault();
        }
      }
    }

    // Text area: Ctrl+Enter to submit
    const textArea = target.closest<HTMLTextAreaElement>('[data-dm-text]');
    if (textArea && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      applyText(textArea.value);
      return;
    }

    // Phase 4C: Tab cycling through design panel inputs
    if (tab === 'design' && e.key === 'Tab') {
      const inputs = Array.from(root.querySelectorAll('.dm-input, .dm-select')) as HTMLElement[];
      if (inputs.length === 0) return;
      const idx = inputs.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      e.preventDefault();
      const nextIdx = e.shiftKey ? (idx - 1 + inputs.length) % inputs.length : (idx + 1) % inputs.length;
      inputs[nextIdx].focus();
      return;
    }
  });

  // ─── HTML5 drag-and-drop for Fill layer reordering ─────────────────────
  // Each fill row carries `data-dm-fill-row="<idx>"` + `draggable="true"`.
  // dragstart stashes the source index in dataTransfer; drop reads the
  // target index, splices the source out, and re-inserts at the target.
  let fillDragSrc: number | null = null;
  root.addEventListener('dragstart', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (!rowEl) return;
    fillDragSrc = parseInt(rowEl.dataset.dmFillRow || '-1', 10);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(fillDragSrc));
    }
    rowEl.style.opacity = '0.5';
  });
  root.addEventListener('dragend', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (rowEl) rowEl.style.opacity = '';
    fillDragSrc = null;
  });
  root.addEventListener('dragover', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (!rowEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (!rowEl) return;
    e.preventDefault();
    const target = parseInt(rowEl.dataset.dmFillRow || '-1', 10);
    const src = fillDragSrc ?? parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
    fillDragSrc = null;
    rowEl.style.opacity = '';
    if (src < 0 || target < 0 || src === target) return;
    const id = info?.id || '';
    if (!id) return;
    const layers = getFillLayers(id, info?.computedStyles || {});
    if (src >= layers.length || target >= layers.length) return;
    // The solid (bgColorOnly) is anchored at the bottom — disallow moving
    // it or moving anything past it.
    if (layers[src].bgColorOnly || layers[target].bgColorOnly) return;
    const [moved] = layers.splice(src, 1);
    layers.splice(target, 0, moved);
    fillLayersByElement.set(id, layers);
    dispatchFillLayers(layers, applyStyle);
    // Keep expanded layer pointing at the same logical layer.
    if (expandedFillIdx === src) expandedFillIdx = target;
    else if (expandedFillIdx !== null && src < expandedFillIdx && target >= expandedFillIdx) expandedFillIdx -= 1;
    else if (expandedFillIdx !== null && src > expandedFillIdx && target <= expandedFillIdx) expandedFillIdx += 1;
  });

  // ─── HTML5 drag-and-drop for Stroke layer reordering ───────────────────
  // Mirrors the Fill DnD wiring exactly, using `[data-dm-stroke-row]`.
  // Stack-order semantics: top of list paints closest to the element.
  let strokeDragSrc: number | null = null;
  root.addEventListener('dragstart', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (!rowEl) return;
    strokeDragSrc = parseInt(rowEl.dataset.dmStrokeRow || '-1', 10);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(strokeDragSrc));
    }
    rowEl.style.opacity = '0.5';
  });
  root.addEventListener('dragend', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (rowEl) rowEl.style.opacity = '';
    strokeDragSrc = null;
  });
  root.addEventListener('dragover', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (!rowEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (!rowEl) return;
    e.preventDefault();
    const tgt = parseInt(rowEl.dataset.dmStrokeRow || '-1', 10);
    const src = strokeDragSrc ?? parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
    strokeDragSrc = null;
    rowEl.style.opacity = '';
    if (src < 0 || tgt < 0 || src === tgt) return;
    const id = info?.id || '';
    if (!id) return;
    const cs = info?.computedStyles || {};
    const pos = inferStrokePosition(cs);
    const layers = getStrokeLayers(id, cs, pos);
    if (src >= layers.length || tgt >= layers.length) return;
    const [moved] = layers.splice(src, 1);
    layers.splice(tgt, 0, moved);
    strokeLayersByElement.set(id, layers);
    // Keep activeStrokeIdx pointing at the same logical layer.
    if (activeStrokeIdx === src) activeStrokeIdx = tgt;
    else if (src < activeStrokeIdx && tgt >= activeStrokeIdx) activeStrokeIdx -= 1;
    else if (src > activeStrokeIdx && tgt <= activeStrokeIdx) activeStrokeIdx += 1;
    const intent = strokeStyleByElement.get(id);
    const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
    dispatchStrokeLayers(layers, pos, cs, applyStyle, styleNow);
  });

  // ─── HTML5 drag-and-drop for Effects layer reordering ─────────────────
  // Reorder is constrained to within the same CSS chain (a drop shadow
  // can't be dragged onto a layer-blur — different chains, no swap).
  // Cross-chain drops are silently ignored.
  let effectDragSrc: { idx: number; chain: string } | null = null;
  root.addEventListener('dragstart', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (!rowEl) return;
    effectDragSrc = {
      idx: parseInt(rowEl.dataset.dmEffectRow || '-1', 10),
      chain: rowEl.dataset.dmEffectChain || '',
    };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(effectDragSrc.idx));
    }
    rowEl.style.opacity = '0.5';
  });
  root.addEventListener('dragend', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (rowEl) rowEl.style.opacity = '';
    effectDragSrc = null;
  });
  root.addEventListener('dragover', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (!rowEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (!rowEl) return;
    e.preventDefault();
    const dragSrc = effectDragSrc;
    effectDragSrc = null;
    rowEl.style.opacity = '';
    if (!dragSrc) return;
    const tgtChain = rowEl.dataset.dmEffectChain || '';
    if (tgtChain !== dragSrc.chain || !tgtChain) return; // cross-chain ignored
    const id = info?.id || '';
    if (!id) return;
    const cs = info?.computedStyles || {};
    const isTextLayer = !!(info && (info.tagName || '').match(/^(p|h[1-6]|span|a|li|button|label)$/i));
    const list = parseEffects(cs, id, isTextLayer);
    const srcEntry = list[dragSrc.idx];
    const tgtIdx = parseInt(rowEl.dataset.dmEffectRow || '-1', 10);
    const tgtEntry = list[tgtIdx];
    if (!srcEntry || !tgtEntry) return;
    if ((srcEntry as any).chain !== (tgtEntry as any).chain) return;
    if (dragSrc.chain === 'box') {
      const entries = parseCssCommaList(cs.boxShadow || '');
      const sci = (srcEntry as any).chainIdx;
      const tci = (tgtEntry as any).chainIdx;
      const [moved] = entries.splice(sci, 1);
      entries.splice(tci, 0, moved);
      applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
    } else if (dragSrc.chain === 'filter') {
      const list2 = splitFilterFunctions(cs.filter || '');
      const sci = (srcEntry as any).chainIdx;
      const tci = (tgtEntry as any).chainIdx;
      const [moved] = list2.splice(sci, 1);
      list2.splice(tci, 0, moved);
      applyStyle('filter', list2.length ? list2.join(' ') : 'none');
    } else if (dragSrc.chain === 'backdrop') {
      const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
      const sci = (srcEntry as any).chainIdx;
      const tci = (tgtEntry as any).chainIdx;
      const [moved] = list2.splice(sci, 1);
      list2.splice(tci, 0, moved);
      applyStyle('backdropFilter', list2.length ? list2.join(' ') : 'none');
    }
  });

  // Mouseover/mouseout for layer hover (using mouseover because it bubbles, unlike mouseenter)
  root.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const layerEl = target.closest<HTMLElement>('[data-dm-layer]');
    if (layerEl) {
      const layerId = layerEl.dataset.dmLayer!;
      if (hoveredLayerId !== layerId) {
        hoveredLayerId = layerId;
        send({ type: 'SP_HOVER_ELEMENT', elementId: layerId });
        render();
      }
    }
    // Hover-preview for comment rows — scrolls the page so the pin is in
    // view (without selecting). Triggers once per row to avoid spamming
    // the content script. Pins are usually offscreen if the user hasn't
    // visited that element recently.
    const commentRowEl = target.closest<HTMLElement>('[data-dm-comment-item]');
    if (commentRowEl && (commentRowEl as any).__dmHoverScrolled !== true) {
      (commentRowEl as any).__dmHoverScrolled = true;
      const c = comments.find(cc => cc.id === commentRowEl.dataset.dmCommentItem);
      if (c?.elementId) send({ type: 'SP_SCROLL_TO_ELEMENT', elementId: c.elementId });
    }
  });

  root.addEventListener('mouseout', (e) => {
    const target = e.target as HTMLElement;
    const layerEl = target.closest<HTMLElement>('[data-dm-layer]');
    const relatedTarget = (e as MouseEvent).relatedTarget as HTMLElement | null;
    if (layerEl && (!relatedTarget || !layerEl.contains(relatedTarget))) {
      // Check if we left to another layer or completely outside
      const newLayer = relatedTarget?.closest<HTMLElement>('[data-dm-layer]');
      if (!newLayer && hoveredLayerId) {
        hoveredLayerId = null;
        send({ type: 'SP_UNHOVER_ELEMENT' });
        render();
      }
    }
  });

  // Drag and drop for layer reorder
  root.addEventListener('dragstart', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-drag]');
    if (target) {
      dragLayerId = target.dataset.dmLayerDrag!;
      (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    }
  });

  root.addEventListener('dragover', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-drag]');
    if (target) {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'move';
      target.classList.add('dm-drag-over');
    }
  });

  root.addEventListener('dragleave', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-drag]');
    if (target) target.classList.remove('dm-drag-over');
  });

  root.addEventListener('drop', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-drag]');
    if (target) {
      e.preventDefault();
      target.classList.remove('dm-drag-over');
      const targetId = target.dataset.dmLayerDrag!;
      if (dragLayerId && targetId && dragLayerId !== targetId) {
        // Drop on the upper half of the target → insert before; lower half → insert after.
        const rect = target.getBoundingClientRect();
        const position = (e as DragEvent).clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        reorderLayer(dragLayerId, targetId, position);
      }
      dragLayerId = null;
    }
  });

  root.addEventListener('dragend', () => {
    dragLayerId = null;
    root.querySelectorAll('.dm-drag-over').forEach(d => d.classList.remove('dm-drag-over'));
  });
}

/* ── Phase 4C: Global keyboard navigation ── */
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // Undo/Redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoAction(); }
  if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); redoAction(); }

  // Escape to deselect
  if (e.key === 'Escape') {
    if (commentMode) { cancelComment(); return; }
    if (info) { info = null; hoverInfo = null; render(); return; }
  }

  // Arrow keys in layers tab
  if (tab === 'layers' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const visible = getVisibleLayers();
    if (visible.length === 0) return;
    const selectedId = info?.id || '';
    const currentIdx = visible.findIndex(n => n.id === selectedId);
    let nextIdx: number;
    if (e.key === 'ArrowUp') {
      nextIdx = currentIdx <= 0 ? visible.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= visible.length - 1 ? 0 : currentIdx + 1;
    }
    selectElement(visible[nextIdx].id);
    // Scroll into view
    setTimeout(() => {
      const el = root.querySelector('[data-dm-layer="' + visible[nextIdx].id + '"]');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 50);
    return;
  }

  // Enter to toggle collapse on selected layer
  if (tab === 'layers' && e.key === 'Enter' && info) {
    const node = domTree.find(n => n.id === info!.id);
    if (node && node.childCount > 0) {
      if (collapsedNodes.has(node.id)) collapsedNodes.delete(node.id);
      else collapsedNodes.add(node.id);
      render();
    }
    return;
  }
});

/* ── Init ── */
setupDelegation();
render();
