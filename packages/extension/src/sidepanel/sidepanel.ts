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
  smartName?: string; spatialContext?: any; accessibilityInfo?: any;
  sourceLocation?: any; componentHierarchy?: string[];
}
interface StyleChange { id?: string; elementId: string; selector: string; property: string; oldValue: string; newValue: string; timestamp?: number; }
interface TextChange { id: string; elementId: string; selector: string; oldText: string; newText: string; timestamp?: number; }
interface DomChange { id?: string; action: string; tagName: string; selector: string; elementId?: string; timestamp?: number; }
interface CommentEntry { id: string; elementId: string; text: string; selector: string; timestamp: number; }
interface DomNode { id: string; tagName: string; displayName: string; depth: number; childCount: number; isVisible: boolean; hasText: boolean; parentId: string | null; }

/* ── State ── */
type Tab = 'layers' | 'design' | 'changes';
type McpState = 'offline' | 'running' | 'connected';
type Theme = 'dark' | 'light' | 'system';
type ColorFormat = 'hex' | 'rgba';
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
let captureToast: { kind: 'success' | 'error'; text: string } | null = null;
let captureToastTimer: ReturnType<typeof setTimeout> | null = null;
let commentMode = false;
let commentText = '';
let editingCommentId: string | null = null;
let viewingCommentId: string | null = null;
let commentDirty = false;

// Phase 2: Tree state
const collapsedNodes = new Set<string>();
let layerSearch = '';

// Phase 3: Persistent section collapse state
const sectionStates: Record<string, boolean | undefined> = {};

// Phase 4: Changes group collapse
const changesGroupCollapsed = new Set<string>();

// Phase 5: Design tokens
interface DesignToken { name: string; value: string; category: 'color' | 'spacing' | 'font' | 'shadow' | 'other'; }
let designTokens: DesignToken[] = [];

// Drag state (for layer reorder)
let dragLayerId: string | null = null;

// v1.2: Presets
let presetsOpen = false;
let presetsTab: 'builtin' | 'custom' = 'builtin';
let customPresetsList: any[] = [];
let pageTokenGroups: any[] = [];
let presetAccordionOpen: Set<string> = new Set();
let editingPresetData: { id: string; name: string; styles: Record<string, string> } | null = null;
let deletingPresetId: string | null = null;

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

// v1.2: Border link toggles
let borderWidthLinked = false;
let borderStyleLinked = false;
let borderColorLinked = false;
let borderRadiusLinked = false;

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
chrome.storage?.local?.get?.(['dm-theme', 'dm-color-format', 'dm-capture-mode'], (result: any) => {
  if (result?.['dm-theme']) { theme = result['dm-theme']; resolveTheme(); }
  if (result?.['dm-color-format']) { colorFormat = result['dm-color-format']; }
  if (result?.['dm-capture-mode']) { captureMode = result['dm-capture-mode']; }
  render();
});

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
    render(); refreshMcpStatus(); refreshDomTree(); refreshChanges(); refreshDesignTokens();
  }
});

// Immediately deactivate inspect mode when the side panel is hidden or unloading.
// Port disconnect is async — these events fire faster, so the cursor/listeners
// stop on the page within milliseconds.
function signalPanelClosing() {
  try { chrome.runtime.sendMessage({ type: 'SP_PANEL_CLOSING' }); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') signalPanelClosing();
});
window.addEventListener('pagehide', signalPanelClosing);
window.addEventListener('beforeunload', signalPanelClosing);

/* ── Async actions ── */
async function refreshMcpStatus() { const res = await send({ type: 'SP_GET_MCP_STATUS' }); if (res.mcpState) mcpState = res.mcpState; else if (res.connected && res.agentConnected) mcpState = 'connected'; else if (res.connected) mcpState = 'running'; else mcpState = 'offline'; render(); }
async function refreshState() { const res = await send({ type: 'SP_GET_STATE' }); enabled = res.enabled ?? enabled; inspecting = res.inspecting ?? inspecting; undoCount = res.undoCount ?? undoCount; redoCount = res.redoCount ?? redoCount; render(); }
async function refreshChanges() { const res = await send({ type: 'SP_GET_CHANGES' }); styleChanges = res.styleChanges || []; textChanges = res.textChanges || []; domChanges = res.domChanges || []; comments = res.comments || []; render(); }
async function refreshDomTree() { const res = await send({ type: 'SP_GET_DOM_TREE' }); domTree = res.tree || []; render(); }
async function refreshDesignTokens() { const res = await send({ type: 'SP_GET_DESIGN_TOKENS' }); designTokens = res.tokens || []; }
async function refreshMedia() {
  if (!info) { mediaInfo = null; lastMediaElementId = null; return; }
  if (info.id === lastMediaElementId) return;
  lastMediaElementId = info.id;
  const res = await send({ type: 'SP_GET_MEDIA' });
  mediaInfo = res?.media || null;
  render();
}
async function refreshPresets() {
  if (presetsTab === 'builtin') {
    const res = await send({ type: 'SP_GET_PAGE_TOKENS' });
    pageTokenGroups = res.groups || [];
    if (presetAccordionOpen.size === 0 && pageTokenGroups.length > 0) {
      presetAccordionOpen.add(pageTokenGroups[0].name);
    }
  } else {
    const res = await send({ type: 'SP_GET_PRESETS', category: 'custom' });
    customPresetsList = res.presets || [];
  }
  render();
}

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
async function applyStyle(property: string, value: string) { const res = await send({ type: 'SP_APPLY_STYLE', property, value }); if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; render(); }
async function applyText(text: string) { const res = await send({ type: 'SP_SET_TEXT', text }); if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.undoCount != null) undoCount = res.undoCount; if (res.redoCount != null) redoCount = res.redoCount; render(); }
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
async function reorderLayer(sourceId: string, targetId: string) { await send({ type: 'SP_REORDER_LAYER', sourceId, targetId }); await refreshDomTree(); }

/* ── Message handling ── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ELEMENT_SELECTED') {
    info = msg.payload; hoverInfo = null; commentMode = false;
    // Re-fetch tokens if presets panel is open on builtin tab (element changed → filter may change)
    if (presetsOpen && presetsTab === 'builtin') { refreshPresets(); } else { render(); }
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
  if (msg.type === 'STATE_UPDATE') { enabled = msg.enabled ?? enabled; inspecting = msg.inspecting ?? inspecting; undoCount = msg.undoCount ?? undoCount; redoCount = msg.redoCount ?? redoCount; render(); }
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

function getVisibleLayers(): DomNode[] {
  const nodeMap = buildNodeMap();
  let filtered = domTree;

  // Layer search filter
  if (layerSearch.trim()) {
    const q = layerSearch.toLowerCase();
    const matchIds = new Set<string>();
    for (const n of domTree) {
      if (n.displayName.toLowerCase().includes(q) || n.tagName.toLowerCase().includes(q)) {
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
    filtered = domTree.filter(n => matchIds.has(n.id));
  }

  return filtered.filter(n => !isAncestorCollapsed(n, nodeMap));
}

/* ── Shared render helpers ── */
function sec(title: string, iconName: keyof typeof icons, content: string, defaultOpen = true): string {
  const id = 'dm-sec-' + title.toLowerCase().replace(/[\s&]+/g, '-');
  const isOpen = sectionStates[id] !== undefined ? sectionStates[id]! : defaultOpen;
  const chevIcon = isOpen ? 'chevronDown' : 'chevronRight';
  const bodyClass = isOpen ? 'dm-section-body dm-expanded' : 'dm-section-body dm-collapsed';
  const bodyStyle = isOpen ? 'padding:0 14px 14px;max-height:2000px;' : 'padding:0 14px 0;max-height:0;';
  return '<div style="border-bottom:1px solid var(--dm-separator);">' +
    '<div class="dm-section-header" data-dm-toggle-section="' + id + '" aria-expanded="' + isOpen + '" aria-label="' + title + ' section" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none;">' +
    '<span style="color:var(--dm-text-muted);display:flex;align-items:center;">' + icon(iconName, 14) + '</span>' +
    '<span style="font-size:11px;font-weight:600;color:var(--dm-text-secondary);flex:1;">' + title + '</span>' +
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

function colorInp(label: string, prop: string, value: string): string {
  const hex = rgbToHex(value);
  const displayColor = colorFormat === 'hex' ? hex : value;
  const isOpen = activeColorPickerProp === prop;
  const colorTokens = designTokens.filter(t => t.category === 'color');

  // Filter tokens by search query when open
  const q = colorPickerSearch.toLowerCase();
  const filteredTokens = isOpen && q
    ? colorTokens.filter(t => t.name.toLowerCase().includes(q) || t.value.toLowerCase().includes(q))
    : colorTokens;

  const dropdown = isOpen
    ? '<div data-dm-color-popover="' + prop + '" style="position:absolute;top:100%;left:0;right:0;margin-top:4px;background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-height:220px;overflow-y:auto;z-index:50;">' +
      (filteredTokens.length > 0
        ? '<div style="padding:6px 8px 4px;font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Site Colors (' + filteredTokens.length + ')</div>' +
          filteredTokens.map(t => {
            const tokenVal = t.value.trim();
            const tokenHex = rgbToHex(tokenVal);
            const isCurrent = tokenVal === value || tokenHex === hex || ('var(' + t.name + ')') === value;
            return '<button data-dm-pick-color="' + escapeAttr('var(' + t.name + ')') + '" data-dm-pick-prop="' + escapeAttr(prop) + '" style="width:100%;display:flex;align-items:center;gap:8px;padding:5px 8px;background:' + (isCurrent ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;border-radius:0;cursor:pointer;text-align:left;font-family:inherit;color:var(--dm-text);">' +
              '<span style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(tokenVal) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>' +
              '<span style="flex:1;font-size:10px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(t.name) + '</span>' +
              '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;">' + escapeAttr(tokenHex.slice(0, 9)) + '</span>' +
              '</button>';
          }).join('')
        : '<div style="padding:14px;font-size:10px;color:var(--dm-text-dim);text-align:center;">' + (q ? 'No matching colors. Press Enter to use "' + escapeAttr(q) + '" as custom value.' : 'No design tokens on this page.') + '</div>') +
      '</div>'
    : '';

  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;position:relative;">' +
    '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + label + '</label>' +
    '<div style="display:flex;align-items:center;gap:4px;min-width:0;">' +
    '<input type="color" data-dm-color="' + prop + '" value="' + hex + '" style="width:28px;height:28px;border:1px solid var(--dm-input-border);border-radius:5px;cursor:pointer;background:none;padding:0;flex-shrink:0;" title="Custom color picker"/>' +
    '<input type="text" class="dm-input" data-dm-prop="' + prop + '" data-dm-color-trigger="' + escapeAttr(prop) + '" value="' + escapeAttr(displayColor) + '" style="background:var(--dm-input-bg);border:1px solid var(--dm-input-border);flex:1;min-width:0;cursor:pointer;"/>' +
    '</div>' +
    dropdown +
    '</div>';
}

function grid(cols: number, ...children: string[]): string { return '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:8px;">' + children.join('') + '</div>'; }
function sp(): string { return '<div style="height:10px;"></div>'; }
function sub(text: string): string { return '<div style="color:var(--dm-text-dim);font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;margin-top:6px;">' + text + '</div>'; }

/* ── v1.2: Linked 2×2 grid helper — link button centered between rows ── */
function linked2x2(linkKey: string, isLinked: boolean, ...items: string[]): string {
  const linkColor = isLinked ? 'var(--dm-accent)' : 'var(--dm-text-dim)';
  const linkBg = isLinked ? 'var(--dm-accent-bg)' : 'var(--dm-bg)';
  const linkBorder = isLinked ? 'var(--dm-accent-border)' : 'var(--dm-separator)';
  // Each item is `label (12px) + gap (3px) + control (~28px)`. The visual
  // midpoint of the inputs sits ~6px below the geometric center, so nudge the
  // chain icon down so it aligns with the form controls, not the labels.
  const linkBtn = '<button data-dm-border-link="' + linkKey + '" title="' + (isLinked ? 'Linked — all sides change together' : 'Link all sides') + '" style="position:absolute;left:50%;top:calc(50% + 7px);transform:translate(-50%,-50%);width:24px;height:24px;background:' + linkBg + ';border:1px solid ' + linkBorder + ';border-radius:50%;color:' + linkColor + ';cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 0 0 3px var(--dm-bg);">' +
    icon('link', 11) + '</button>';
  return '<div style="position:relative;">' + grid(2, ...items) + linkBtn + '</div>';
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
  const cur = (value || 'none').trim();
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    selKV(label, prop, FILTER_PRESETS.find(p => p.value === cur) ? cur : 'custom', [
      ...FILTER_PRESETS,
      ...(FILTER_PRESETS.find(p => p.value === cur) ? [] : [{ value: 'custom', label: 'Custom (below)' }]),
    ] as any) + sp() +
    inp('Custom value', prop, cur, '') +
    '<div style="margin-top:4px;font-size:9px;color:var(--dm-text-dim);">Combine multiple: <code style="font-family:monospace;">blur(2px) brightness(1.1) contrast(1.2)</code></div>' +
    '</div>';
}

/* ── Transition + Animation editors ── */
function renderTransitionEditor(s: Record<string, string>): string {
  const prop = (s.transitionProperty || 'all').split(',')[0].trim();
  const dur = (s.transitionDuration || '0s').split(',')[0].trim();
  const timing = (s.transitionTimingFunction || 'ease').split(',')[0].trim();
  const delay = (s.transitionDelay || '0s').split(',')[0].trim();
  const previewBtn =
    '<button data-dm-action="preview-transition" title="Preview transition" style="padding:6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;align-self:flex-end;">' + icon('play', 11) + ' Preview</button>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    grid(2,
      selKV('Property', 'transitionProperty', prop, TRANSITION_PROPERTY_OPTIONS as any),
      selKV('Timing', 'transitionTimingFunction', timing, TIMING_FUNCTION_OPTIONS as any)
    ) + sp() +
    grid(2,
      inp('Duration', 'transitionDuration', dur, 's'),
      inp('Delay', 'transitionDelay', delay, 's')
    ) + sp() +
    grid(2,
      '<div style="font-size:9px;color:var(--dm-text-dim);align-self:center;">Applies when this property changes. Press Preview to flash the value.</div>',
      previewBtn
    ) +
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

/* ── v1.2: Presets View ── */
function renderPresetsView(): string {
  const onBuiltin = presetsTab === 'builtin';
  const hasElement = !!info;

  // Import/Export buttons with text+icon — disabled (grayed) on Built-in tab
  const btnBase = 'display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:5px;font-size:10px;font-family:inherit;cursor:pointer;';
  const ioButtons = onBuiltin
    ? '<div style="display:flex;gap:4px;opacity:0.35;pointer-events:none;">' +
      '<span style="' + btnBase + 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);">' + icon('upload', 11) + ' Import</span>' +
      '<span style="' + btnBase + 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);">' + icon('download', 11) + ' Export</span>' +
      '</div>'
    : '<div style="display:flex;gap:4px;">' +
      '<label style="' + btnBase + 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);" title="Import presets from JSON file">' +
      icon('upload', 11) + ' Import<input type="file" accept=".json" data-dm-import-presets style="display:none;"/></label>' +
      '<button data-dm-action="export-presets" style="' + btnBase + 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);" title="Export presets as JSON">' + icon('download', 11) + ' Export</button>' +
      '</div>';

  const presetsHeader = '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dm-separator-strong);flex-shrink:0;">' +
    '<button data-dm-action="close-presets" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:2px;">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:13px;font-weight:600;color:var(--dm-text);flex:1;">Presets</span>' +
    ioButtons + '</div>';

  // Two tabs
  const tabs = '<div style="display:flex;border-bottom:1px solid var(--dm-separator);flex-shrink:0;">' +
    '<button data-dm-preset-tab="builtin" style="flex:1;padding:8px 4px;background:none;border:none;border-bottom:2px solid ' + (onBuiltin ? 'var(--dm-accent)' : 'transparent') + ';color:' + (onBuiltin ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;font-size:11px;font-weight:' + (onBuiltin ? '600' : '400') + ';font-family:inherit;">Built-in</button>' +
    '<button data-dm-preset-tab="custom" style="flex:1;padding:8px 4px;background:none;border:none;border-bottom:2px solid ' + (!onBuiltin ? 'var(--dm-accent)' : 'transparent') + ';color:' + (!onBuiltin ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;font-size:11px;font-weight:' + (!onBuiltin ? '600' : '400') + ';font-family:inherit;">My Presets</button>' +
    '</div>';

  let content = '';
  let deleteOverlay = '';

  if (onBuiltin) {
    // Context bar: show selected element or instruction to select one
    const selectedLabel = info
      ? '<div style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:var(--dm-accent-bg);border-bottom:1px solid var(--dm-accent-border);flex-shrink:0;">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:var(--dm-accent);flex-shrink:0;"></span>' +
        '<span style="font-size:10px;color:var(--dm-accent);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Showing tokens for &lt;' + escapeAttr((info as any).tagName || 'element') + '&gt;</span>' +
        '</div>'
      : '<div style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:var(--dm-bg-secondary);border-bottom:1px solid var(--dm-separator);flex-shrink:0;">' +
        '<span style="font-size:10px;color:var(--dm-text-dim);">Click an element on the page to filter tokens</span>' +
        '</div>';

    if (pageTokenGroups.length === 0) {
      content = selectedLabel + '<div style="text-align:center;padding:28px 16px;color:var(--dm-text-dim);font-size:11px;line-height:1.7;">' +
        (info ? 'No design tokens found for this element type.<br/>Try selecting a different element.' :
          'No CSS custom properties found on this page.<br/><br/>Built-in presets come from <code style="font-family:SF Mono,monospace;font-size:10px;">--variable-name</code> declarations in the site\'s CSS.') +
        '</div>';
    } else {
      // Apply button disabled state when no element selected
      const applyStyle = hasElement
        ? 'padding:2px 5px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:3px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;flex-shrink:0;'
        : 'padding:2px 5px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:3px;color:var(--dm-text-dim);cursor:default;font-size:9px;font-family:inherit;flex-shrink:0;opacity:0.5;pointer-events:none;';

      const tokenAccordions = pageTokenGroups.map((group: any) => {
        const isOpen = presetAccordionOpen.has(group.name);
        let tokenRows = '';
        if (isOpen) {
          tokenRows = '<div style="padding:0 6px 8px;">' +
            group.tokens.map((t: any) => {
              const val = (t.value || '').trim();
              const isColor = /^(#[0-9a-fA-F]{3,8}$|rgb|hsl|oklch|lch|lab|color\()/.test(val);
              const swatch = isColor ? '<span style="width:13px;height:13px;border-radius:3px;background:' + escapeAttr(val) + ';border:1px solid var(--dm-separator);flex-shrink:0;display:inline-block;"></span>' : '';
              const displayName = t.cssVar.replace(/^--/, '');
              const shortVal = val.length > 22 ? val.slice(0, 20) + '…' : val;
              return '<div style="display:flex;align-items:center;gap:5px;padding:3px 4px;border-radius:4px;">' +
                swatch +
                '<span style="flex:1;font-size:9px;color:var(--dm-text-secondary);font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeAttr(t.cssVar) + '">' + escapeAttr(displayName) + '</span>' +
                '<span style="font-size:9px;color:var(--dm-text-dim);max-width:55px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;" title="' + escapeAttr(val) + '">' + escapeAttr(shortVal) + '</span>' +
                '<button data-dm-apply-token="' + escapeAttr(t.cssVar) + '" data-dm-token-prop="' + escapeAttr(t.property) + '" title="' + (hasElement ? 'Apply to selected element' : 'Select an element first') + '" style="' + applyStyle + '">Apply</button>' +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div style="border-bottom:1px solid var(--dm-separator);">' +
          '<button data-dm-toggle-token-group="' + escapeAttr(group.name) + '" style="width:100%;display:flex;align-items:center;gap:6px;padding:8px 10px;background:none;border:none;cursor:pointer;color:var(--dm-text);font-size:11px;font-weight:500;font-family:inherit;text-align:left;">' +
          '<span style="display:flex;transition:transform 0.15s;transform:rotate(' + (isOpen ? '90deg' : '0deg') + ');">' + icon('chevronRight', 10) + '</span>' +
          '<span style="flex:1;">' + escapeAttr(group.name) + '</span>' +
          '<span style="font-size:9px;color:var(--dm-text-dim);">' + group.tokens.length + '</span>' +
          '</button>' + tokenRows + '</div>';
      }).join('');

      content = selectedLabel + tokenAccordions;
    }
  } else {
    // My Presets tab
    if (editingPresetData) {
      // Edit view: name + editable style properties
      const styleRows = Object.entries(editingPresetData.styles).map(([prop, val]) =>
        '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">' +
        '<span style="font-size:9px;color:var(--dm-text-secondary);min-width:90px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeAttr(prop) + '">' + escapeAttr(prop) + '</span>' +
        '<input class="dm-input" data-dm-edit-prop="' + escapeAttr(prop) + '" value="' + escapeAttr(String(val)) + '" style="flex:1;font-size:9px;padding:3px 5px;min-width:0;font-family:SF Mono,Monaco,monospace;"/>' +
        '<button data-dm-remove-edit-prop="' + escapeAttr(prop) + '" title="Remove property" style="padding:2px;background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;flex-shrink:0;">' + icon('x', 9) + '</button>' +
        '</div>'
      ).join('');
      content = '<div style="padding:10px;">' +
        '<div style="margin-bottom:10px;">' +
        '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:4px;">Preset Name</div>' +
        '<input class="dm-input" data-dm-edit-preset-name value="' + escapeAttr(editingPresetData.name) + '" style="width:100%;font-size:11px;padding:5px 7px;box-sizing:border-box;"/>' +
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
      // List view — save form always shown, disabled when no element selected
      const saveDisabled = !hasElement;
      const saveForm = '<div style="padding:8px 10px;border-bottom:1px solid var(--dm-separator);">' +
        (saveDisabled
          ? '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:5px;">Click an element on the page to enable saving</div>'
          : '') +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '<input type="text" class="dm-input" data-dm-preset-name placeholder="Save current element as preset..." ' +
        (saveDisabled ? 'disabled style="flex:1;min-width:0;font-size:10px;opacity:0.4;"' : 'style="flex:1;min-width:0;font-size:10px;"') + '/>' +
        '<button data-dm-action="save-preset" ' +
        (saveDisabled ? 'disabled style="padding:4px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-dim);font-size:9px;font-family:inherit;white-space:nowrap;display:flex;align-items:center;gap:3px;opacity:0.4;cursor:default;pointer-events:none;"' :
          'style="padding:4px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;white-space:nowrap;display:flex;align-items:center;gap:3px;"') +
        '>' + icon('save', 9) + ' Save</button>' +
        '</div></div>';

      // Apply preset disabled state
      const applyPresetStyle = hasElement
        ? 'padding:2px 6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:3px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;flex-shrink:0;'
        : 'padding:2px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:3px;color:var(--dm-text-dim);cursor:default;font-size:9px;font-family:inherit;flex-shrink:0;opacity:0.45;pointer-events:none;';

      const presetsHtml = customPresetsList.length === 0
        ? '<div style="text-align:center;padding:28px 16px;color:var(--dm-text-dim);font-size:11px;line-height:1.7;">No custom presets yet.<br/><br/>Click an element on the page,<br/>type a name above, and click Save.</div>'
        : '<div style="padding:8px;">' +
          customPresetsList.map((p: any) =>
            '<div style="display:flex;align-items:center;gap:5px;padding:6px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;margin-bottom:4px;">' +
            '<span style="flex:1;font-size:10px;font-weight:500;color:var(--dm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeAttr(p.name) + '">' + escapeAttr(p.name) + '</span>' +
            '<button data-dm-apply-preset-id="' + escapeAttr(p.id) + '" title="' + (hasElement ? 'Apply to selected element' : 'Select an element first') + '" style="' + applyPresetStyle + '">Apply</button>' +
            '<button data-dm-edit-preset="' + escapeAttr(p.id) + '" title="Edit" style="padding:2px 4px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:3px;color:var(--dm-text-secondary);cursor:pointer;display:flex;flex-shrink:0;">' + icon('pencil', 9) + '</button>' +
            '<button data-dm-delete-preset="' + escapeAttr(p.id) + '" title="Delete" style="padding:2px 4px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:3px;color:var(--dm-danger);cursor:pointer;display:flex;flex-shrink:0;">' + icon('trash', 9) + '</button>' +
            '</div>'
          ).join('') + '</div>';

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

      content = saveForm + presetsHtml;
    }
  }

  return presetsHeader + tabs +
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
  if (mcpState === 'offline') { dotStyle = 'width:7px;height:7px;border-radius:50%;background:var(--dm-text-muted);flex-shrink:0;'; tooltipText = 'MCP not running'; textColor = 'var(--dm-text-muted)'; }
  else if (mcpState === 'running') { dotStyle = 'width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0;animation:dm-pulse 2s ease-in-out infinite;'; tooltipText = 'MCP running'; textColor = '#22c55e'; }
  else { dotStyle = 'width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,0.4);flex-shrink:0;'; tooltipText = 'MCP connected'; textColor = '#22c55e'; }
  return '<div style="display:flex;align-items:center;gap:5px;padding:4px 8px;background:var(--dm-bg-secondary);border-radius:6px;cursor:default;" title="' + escapeAttr(tooltipText) + '">' +
    '<span style="' + dotStyle + '"></span><span style="font-size:10px;color:' + textColor + ';font-weight:500;">MCP</span>' +
    '<button data-dm-action="refresh-mcp" title="Refresh" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:2px;">' + icon('rotateCw', 10) + '</button></div>';
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
    '<button data-dm-action="screenshot" title="Screenshot" style="' + bs(undefined, true) + '">' + icon('camera', 14) + '</button>' +
    '<div style="width:1px;height:16px;background:var(--dm-separator-strong);margin:0 2px;"></div>' +
    '<button data-dm-action="view-computed-css" title="View computed CSS" style="' + bs() + '">' + icon('code', 14) + '</button>' +
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
  const dis = previewingOriginal || !hasChanges;
  const copyS = 'flex:1;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:500;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;' +
    (dis ? 'background:var(--dm-btn-bg-disabled);border:1px solid var(--dm-btn-border-disabled);color:var(--dm-text-dim);cursor:default;opacity:0.5;pointer-events:none;' : 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);cursor:pointer;');
  const sendS = 'flex:1;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:500;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;' +
    (dis ? 'background:var(--dm-btn-bg-disabled);border:1px solid var(--dm-btn-border-disabled);color:var(--dm-text-dim);cursor:default;opacity:0.5;pointer-events:none;' : 'background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);color:var(--dm-accent);cursor:pointer;');
  return '<div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--dm-separator-strong);flex-shrink:0;background:var(--dm-bg);position:sticky;bottom:0;z-index:10;">' +
    '<button id="dm-copy-prompt-btn" data-dm-action="copy-prompt" style="' + copyS + '">' + icon('clipboard', 13) + ' Copy Prompt</button>' +
    '<button id="dm-send-agent-btn" data-dm-action="send-to-agent" style="' + sendS + '">' + icon('send', 13) + ' Send to Agent</button></div>';
}

/* ── Phase 2: Layers Tab ── */
function renderLayersTab(): string {
  if (domTree.length === 0) return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('crosshair', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">Click the inspector icon to start selecting elements</div></div>';

  const selectedId = info?.id || '';
  const visible = getVisibleLayers();

  // Search bar
  const searchBar = '<div style="padding:8px 12px;border-bottom:1px solid var(--dm-separator);position:relative;">' +
    '<span style="position:absolute;left:20px;top:50%;transform:translateY(-50%);color:var(--dm-text-dim);display:flex;pointer-events:none;">' + icon('search', 12) + '</span>' +
    '<input type="text" class="dm-layer-search" data-dm-layer-search placeholder="Search layers..." value="' + escapeAttr(layerSearch) + '"/></div>';

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

  const rows = visible.map(n => {
    const indent = n.depth * 16;
    const isSel = n.id === selectedId;
    const isHov = n.id === hoveredLayerId;
    const bg = isSel ? 'var(--dm-accent-bg)' : isHov ? 'var(--dm-bg-secondary)' : 'transparent';

    // Chevron for expand/collapse
    const isCollapsed = collapsedNodes.has(n.id);
    let chevron = '<span style="width:14px;flex-shrink:0;"></span>';
    if (n.childCount > 0) {
      const chevIcon = isCollapsed ? 'chevronRight' : 'chevronDown';
      chevron = '<span data-dm-toggle-collapse="' + n.id + '" style="color:var(--dm-text-dim);display:flex;cursor:pointer;flex-shrink:0;width:14px;align-items:center;justify-content:center;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>';
    }

    // Tag icon
    const tagIconName = TAG_ICON_MAP[n.tagName] || 'box';
    const tagIcon = '<span style="color:' + (isSel ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';display:flex;flex-shrink:0;">' + icon(tagIconName, 10) + '</span>';

    // Indentation guides
    let guides = '';
    for (let d = 1; d <= n.depth; d++) {
      guides += '<span class="dm-indent-guide" style="left:' + (4 + (d - 1) * 16 + 7) + 'px;"></span>';
    }

    // Drag handle
    const dragHandle = '<span class="dm-layer-drag" style="color:var(--dm-text-dimmer);display:flex;cursor:grab;flex-shrink:0;">' + icon('gripVertical', 12) + '</span>';

    // Hover actions (eye toggle only — delete is in top action row)
    const hoverActions = '<span class="dm-layer-hover-actions" style="display:flex;gap:2px;margin-left:auto;flex-shrink:0;">' +
      '<button data-dm-toggle-vis="' + n.id + '" title="Toggle visibility" aria-label="Toggle visibility" style="background:none;border:none;color:' + (n.isVisible ? 'var(--dm-text-muted)' : 'var(--dm-accent)') + ';cursor:pointer;display:flex;padding:2px;">' + icon(n.isVisible ? 'eye' : 'eyeOff', 12) + '</button></span>';

    const tagColor = isSel ? 'var(--dm-accent)' : 'var(--dm-text-secondary)';

    return '<div class="dm-layer-item" data-dm-layer="' + n.id + '" draggable="true" data-dm-layer-drag="' + n.id + '" style="display:flex;align-items:center;gap:3px;padding:3px 6px 3px ' + (4 + indent) + 'px;background:' + bg + ';cursor:pointer;border-left:2px solid ' + (isSel ? 'var(--dm-accent)' : 'transparent') + ';position:relative;min-height:30px;opacity:' + (!n.isVisible || dimmedByAncestor.has(n.id) ? '0.4' : '1') + ';" title="' + escapeAttr(n.displayName) + '">' +
      guides + dragHandle + chevron + tagIcon +
      '<span style="font-size:11px;color:' + tagColor + ';font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + escapeAttr(n.displayName) + '</span>' +
      hoverActions + '</div>';
  }).join('');

  return searchBar + '<div style="overflow-y:auto;">' + rows + '</div>';
}

/* ── Phase 3: Design Tab ── */
function renderDesignTab(): string {
  const displayInfo = info ?? hoverInfo;
  const isHovering = !info && !!hoverInfo;

  if (!displayInfo) return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('crosshair', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">No element selected</div><div style="font-size:11px;margin-top:4px;color:var(--dm-text-dim);">Hover over elements on the page or select from the Layers panel</div></div>';

  const s = displayInfo.computedStyles;
  const tag = displayInfo.tagName?.toLowerCase() || 'div';
  const isImg = tag === 'img';

  // Hover/Selected indicator
  const indicator = isHovering
    ? '<div style="padding:6px 12px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;gap:6px;"><span class="dm-hover-indicator hovering">' + icon('eye', 8) + ' Hovering</span><span style="font-size:10px;color:var(--dm-text-dim);font-family:SF Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">&lt;' + escapeAttr(tag) + '&gt;</span></div>'
    : '<div style="padding:6px 12px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;gap:6px;"><span class="dm-hover-indicator selected">' + icon('crosshair', 8) + ' Selected</span><span style="font-size:10px;color:var(--dm-text-dim);font-family:SF Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">&lt;' + escapeAttr(tag) + '&gt;</span></div>';

  // Text content editing — show for ANY text-tagged layer (the same set whose
  // Layers icon is the "T"/type glyph). Editing a text element with children
  // will replace its inner content, so we surface a one-line warning when that
  // would happen instead of hiding the field entirely.
  const directTextTags = ['p','h1','h2','h3','h4','h5','h6','span','a','li','td','th','label','button','strong','em','b','i','small','mark','figcaption','caption','dt','dd','abbr','cite','q','code','pre','blockquote'];
  const isTextTag = directTextTags.includes(tag);
  const showTextEdit = isTextTag && !!displayInfo.textContent;
  const textVal = displayInfo.textContent || '';
  const textWarning = showTextEdit && displayInfo.hasChildElements
    ? '<div style="font-size:9px;color:var(--dm-text-dim);margin-top:3px;">Saving will replace the child elements with plain text.</div>'
    : '';
  const textField = showTextEdit
    ? '<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">' +
      '<label style="font-size:9px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Text Content</label>' +
      '<textarea data-dm-text class="dm-input" rows="4" style="width:100%;min-height:88px;resize:vertical;font-family:SF Mono,Monaco,monospace;line-height:1.5;padding:8px;box-sizing:border-box;">' + escapeAttr(textVal) + '</textarea>' +
      textWarning +
      '</div>'
    : '';

  // Smart section defaults (Phase 3D)
  const positionDefault = (s.position === 'static' || !s.position) ? false : true;
  const hasEffects = (s.boxShadow && s.boxShadow !== 'none') || (s.textShadow && s.textShadow !== 'none') ||
    (s.filter && s.filter !== 'none') || (s.backdropFilter && s.backdropFilter !== 'none') ||
    (s.transition && s.transition !== 'none') || (s.animation && s.animation !== 'none');

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

  return '<div style="overflow-x:hidden;">' + indicator + iconSection +
    sec('Typography', 'type', textField +
      inp('Font', 'fontFamily', s.fontFamily || 'inherit', '') + sp() +
      grid(2, selKV('Weight', 'fontWeight', s.fontWeight || '400', FONT_WEIGHTS), inp('Size', 'fontSize', s.fontSize || '16px')) + sp() +
      grid(2, inp('Line H', 'lineHeight', s.lineHeight || 'normal', ''), inp('Spacing', 'letterSpacing', s.letterSpacing || 'normal')) + sp() +
      '<div style="display:flex;gap:4px;">' +
      '<div style="display:flex;gap:2px;flex:1;">' + alignBtn('left', s.textAlign || 'left', 'alignLeft') + alignBtn('center', s.textAlign || 'left', 'alignCenter') + alignBtn('right', s.textAlign || 'left', 'alignRight') + alignBtn('justify', s.textAlign || 'left', 'alignJustify') + '</div>' +
      '<div style="width:1px;background:var(--dm-separator-strong);margin:0 2px;self-align:stretch;"></div>' +
      '<div style="display:flex;gap:2px;flex:1;">' +
        textDecBtn('fontWeight', '700', '400', s.fontWeight || '400', 'bold', 'Bold') +
        textDecBtn('fontStyle', 'italic', 'normal', s.fontStyle || 'normal', 'italic', 'Italic') +
        textDecBtn('textDecorationLine', 'underline', 'none', (s.textDecoration || '').split(' ')[0] || 'none', 'underline', 'Underline') +
        textDecBtn('textDecorationLine', 'line-through', 'none', (s.textDecoration || '').split(' ')[0] || 'none', 'strikethrough', 'Strikethrough') +
      '</div></div>' + sp() +
      colorInp('Color', 'color', s.color || '#000') + sp() +
      sel('Transform', 'textTransform', s.textTransform || 'none', ['none','uppercase','lowercase','capitalize'])
    ) +
    renderMediaSection(displayInfo, s, isImg) +
    sec('Background', 'palette',
      colorInp('Color', 'backgroundColor', s.backgroundColor || 'transparent') + sp() +
      inp('Image / Gradient', 'backgroundImage', s.backgroundImage || 'none', '') + sp() +
      grid(2,
        sel('Size', 'backgroundSize', s.backgroundSize || 'auto', ['auto','cover','contain','100% 100%']),
        sel('Repeat', 'backgroundRepeat', s.backgroundRepeat || 'repeat', ['repeat','no-repeat','repeat-x','repeat-y','space','round'])
      ) + sp() +
      sel('Position', 'backgroundPosition', s.backgroundPosition || 'left top', ['left top','center top','right top','left center','center','right center','left bottom','center bottom','right bottom'])
    ) +
    sec('Size', 'maximize',
      grid(2, inp('W', 'width', s.width || 'auto'), inp('H', 'height', s.height || 'auto')) + sp() +
      grid(4, inp('Min W', 'minWidth', s.minWidth || '0'), inp('Max W', 'maxWidth', s.maxWidth || 'none'), inp('Min H', 'minHeight', s.minHeight || '0'), inp('Max H', 'maxHeight', s.maxHeight || 'none'))
    ) +
    sec('Spacing', 'spacing',
      spacingBox(s, displayInfo)
    ) +
    sec('Layout', 'layoutGrid',
      grid(2, sel('Display', 'display', s.display || 'block', ['block','flex','grid','inline','inline-block','inline-flex','inline-grid','none']), sel('Overflow', 'overflow', s.overflow || 'visible', ['visible','hidden','scroll','auto'])) +
      ((s.display === 'flex' || s.display === 'inline-flex') ? sp() + sub('Flex') +
        grid(2, sel('Dir', 'flexDirection', s.flexDirection || 'row', ['row','row-reverse','column','column-reverse']), sel('Wrap', 'flexWrap', s.flexWrap || 'nowrap', ['nowrap','wrap','wrap-reverse'])) + sp() +
        grid(2, sel('Justify', 'justifyContent', s.justifyContent || 'flex-start', ['flex-start','center','flex-end','space-between','space-around','space-evenly']), sel('Align', 'alignItems', s.alignItems || 'stretch', ['flex-start','center','flex-end','stretch','baseline'])) + sp() +
        grid(3, inp('Gap', 'gap', s.gap || '0px'), inp('Grow', 'flexGrow', s.flexGrow || '0', ''), inp('Shrink', 'flexShrink', s.flexShrink || '1', '')) : '') +
      ((s.display === 'grid' || s.display === 'inline-grid') ? sp() + sub('Grid') +
        inp('Cols', 'gridTemplateColumns', s.gridTemplateColumns || 'none', '') + sp() + inp('Rows', 'gridTemplateRows', s.gridTemplateRows || 'none', '') + sp() +
        grid(2, inp('Col Gap', 'columnGap', s.columnGap || '0px'), inp('Row Gap', 'rowGap', s.rowGap || '0px')) : '')
    ) +
    sec('Position', 'move',
      grid(2, sel('Pos', 'position', s.position || 'static', ['static','relative','absolute','fixed','sticky']), inp('Z-Index', 'zIndex', s.zIndex || 'auto', '')) + sp() +
      grid(4, inp('Top', 'top', s.top || 'auto'), inp('Right', 'right', s.right || 'auto'), inp('Bottom', 'bottom', s.bottom || 'auto'), inp('Left', 'left', s.left || 'auto')),
      positionDefault
    ) +
    sec('Border', 'squareDashed',
      sub('Width') + linked2x2('width', borderWidthLinked,
        inp('\u22A4', 'borderTopWidth', s.borderTopWidth || '0px'),
        inp('\u22A2', 'borderRightWidth', s.borderRightWidth || '0px'),
        inp('\u22A5', 'borderBottomWidth', s.borderBottomWidth || '0px'),
        inp('\u22A3', 'borderLeftWidth', s.borderLeftWidth || '0px')
      ) + sp() +
      sub('Style') + linked2x2('style', borderStyleLinked,
        sel('\u22A4', 'borderTopStyle', s.borderTopStyle || 'solid', ['none','solid','dashed','dotted','double','groove','ridge','inset','outset']),
        sel('\u22A2', 'borderRightStyle', s.borderRightStyle || 'solid', ['none','solid','dashed','dotted','double','groove','ridge','inset','outset']),
        sel('\u22A5', 'borderBottomStyle', s.borderBottomStyle || 'solid', ['none','solid','dashed','dotted','double','groove','ridge','inset','outset']),
        sel('\u22A3', 'borderLeftStyle', s.borderLeftStyle || 'solid', ['none','solid','dashed','dotted','double','groove','ridge','inset','outset'])
      ) + sp() +
      sub('Color') + linked2x2('color', borderColorLinked,
        colorInp('\u22A4', 'borderTopColor', s.borderTopColor || '#000'),
        colorInp('\u22A2', 'borderRightColor', s.borderRightColor || '#000'),
        colorInp('\u22A5', 'borderBottomColor', s.borderBottomColor || '#000'),
        colorInp('\u22A3', 'borderLeftColor', s.borderLeftColor || '#000')
      ) + sp() +
      sub('Radius') + linked2x2('radius', borderRadiusLinked,
        inp('\u250C', 'borderTopLeftRadius', s.borderTopLeftRadius || '0px'),
        inp('\u2510', 'borderTopRightRadius', s.borderTopRightRadius || '0px'),
        inp('\u2514', 'borderBottomLeftRadius', s.borderBottomLeftRadius || '0px'),
        inp('\u2518', 'borderBottomRightRadius', s.borderBottomRightRadius || '0px')
      ) + sp() +
      sub('Outline') +
      grid(3,
        inp('Width', 'outlineWidth', s.outlineWidth || '0px'),
        sel('Style', 'outlineStyle', s.outlineStyle || 'none', ['none','solid','dashed','dotted','double']),
        colorInp('Color', 'outlineColor', s.outlineColor || '#000')
      )
    ) +
    sec('Appearance', 'eye',
      grid(2, inp('Opacity', 'opacity', s.opacity || '1', ''), inp('Rotation', 'rotate', (s.rotate || '0').replace('deg',''), 'deg')) + sp() +
      grid(2, sel('Visible', 'visibility', s.visibility || 'visible', ['visible','hidden','collapse']), sel('Blend', 'mixBlendMode', s.mixBlendMode || 'normal', ['normal','multiply','screen','overlay','darken','lighten'])) + sp() +
      grid(2, sel('Cursor', 'cursor', s.cursor || 'auto', ['auto','default','pointer','text','move','grab','not-allowed']), inp('Transform', 'transform', s.transform || 'none', '')) +
      '<div style="margin-top:4px;font-size:9px;color:var(--dm-text-dim);">e.g. <code style="font-family:monospace;">translate(10px,0)</code>, <code style="font-family:monospace;">scale(1.2)</code>, <code style="font-family:monospace;">rotate(15deg)</code>, <code style="font-family:monospace;">skewX(10deg)</code> — combine with spaces.</div>' + sp() +
      sub('Transform components') +
      grid(2, inp('Translate', 'translate', s.translate || '0px 0px', ''), inp('Scale', 'scale', s.scale || '1', '')) +
      '<div style="margin-top:4px;font-size:9px;color:var(--dm-text-dim);">Translate accepts <code style="font-family:monospace;">10px 20px</code> (X Y). Scale accepts a single number (uniform) or two (X Y). Standalone props compose with Transform above.</div>' + sp() +
      sub('Interaction') +
      grid(2,
        sel('Pointer events', 'pointerEvents', s.pointerEvents || 'auto', ['auto','none','all','painted','visiblePainted','visible','stroke','fill']),
        sel('User select', 'userSelect', s.userSelect || 'auto', ['auto','none','text','all','contain'])
      )
    ) +
    sec('Effects', 'sparkles',
      sub('Box Shadow') + renderShadowEditor(s) + sp() +
      sub('Text Shadow') + renderTextShadowEditor(s) + sp() +
      sub('Filter') + renderFilterEditor('filter', 'Effect', s.filter || 'none') + sp() +
      sub('Backdrop Filter') + renderFilterEditor('backdropFilter', 'Effect', s.backdropFilter || 'none') + sp() +
      sub('Transition') + renderTransitionEditor(s) +
      '<div style="display:flex;justify-content:flex-end;margin-top:3px;margin-bottom:4px;">' +
      '<button data-dm-viz-open="transition" style="padding:2px 6px;background:' + (vizProp==='transition'?'var(--dm-accent-bg)':'var(--dm-btn-bg)') + ';border:1px solid ' + (vizProp==='transition'?'var(--dm-accent-border)':'var(--dm-btn-border)') + ';border-radius:3px;color:' + (vizProp==='transition'?'var(--dm-accent)':'var(--dm-text-dim)') + ';cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:2px;">' + icon('activity',9) + ' custom curve</button></div>' +
      (vizProp === 'transition' ? renderVizPanel() : '') + sp() +
      sub('Animation') + renderAnimationEditor(s),
      hasEffects
    ) + '</div>';
}

/* ── Phase 4: Changes Tab (Grouped) ── */
function renderChangesTab(): string {
  type ChangeItem =
    | { type: 'style'; data: StyleChange; idx: number }
    | { type: 'text'; data: TextChange; idx: number }
    | { type: 'dom'; data: DomChange; idx: number }
    | { type: 'comment'; data: CommentEntry; idx: number };
  const items: ChangeItem[] = [
    ...styleChanges.map((c, idx) => ({ type: 'style' as const, data: c, idx })),
    ...textChanges.map((c, idx) => ({ type: 'text' as const, data: c, idx })),
    ...domChanges.map((c, idx) => ({ type: 'dom' as const, data: c, idx })),
    ...comments.map((c, idx) => ({ type: 'comment' as const, data: c, idx })),
  ].sort((a, b) => ((a.data as any).timestamp || 0) - ((b.data as any).timestamp || 0));

  if (items.length === 0) return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('sparkles', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">No changes yet</div><div style="font-size:11px;margin-top:6px;color:var(--dm-text-dim);">Changes will appear here as you edit.<br/>Copy as prompt or send directly to your coding agent.</div></div>';

  // Group by selector
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
  const clearAllBtn = '<div style="padding:6px 10px;border-bottom:1px solid var(--dm-separator);display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
    '<div style="display:flex;gap:4px;">' + originalBtn + changesBtn + '</div>' +
    '<button data-dm-action="clear-all-changes" style="padding:4px 10px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:4px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:4px;">' + icon('trash', 10) + ' Clear All</button></div>' + previewBanner;

  const groupHtml = Array.from(groups.entries()).map(([key, group]) => {
    const isCollapsed = changesGroupCollapsed.has(key);
    const count = group.items.length;
    const chevIcon = isCollapsed ? 'chevronRight' : 'chevronDown';

    const header = '<div class="dm-change-group-header" data-dm-change-group="' + escapeAttr(key) + '">' +
      '<span style="color:var(--dm-text-dim);display:flex;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>' +
      '<span style="font-family:SF Mono,Monaco,monospace;font-size:10px;color:var(--dm-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + escapeAttr(group.selector) + '</span>' +
      '<span style="font-size:9px;background:var(--dm-accent-bg);color:var(--dm-accent);border-radius:8px;padding:1px 6px;flex-shrink:0;">' + count + '</span>' +
      (group.elementId ? '<button data-dm-select-change-el="' + escapeAttr(group.elementId) + '" title="Select element" style="background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('crosshair', 10) + '</button>' : '') +
      '</div>';

    if (isCollapsed) return '<div class="dm-change-group">' + header + '</div>';

    const body = group.items.map(item => {
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
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '" style="display:flex;align-items:center;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;">' +
          '<span style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('sliders', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:10px;"><span style="color:var(--dm-text-muted);">' + c.property + '</span>: <span style="color:var(--dm-danger);text-decoration:line-through;font-size:9px;">' + escapeAttr((c.oldValue || '').slice(0, 20)) + '</span> \u2192 <span style="color:var(--dm-success);">' + escapeAttr((c.newValue || '').slice(0, 20)) + '</span></div>' +
          '</div>' +
          '<button data-dm-batch-apply="' + cid + '" title="' + zapTitle + '" style="' + zapStyle + '" aria-label="Batch apply">' + icon('zap', 10) + countBadge + '</button>' +
          '<button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else if (item.type === 'text') {
        const c = item.data;
        const cid = c.id;
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '" style="display:flex;align-items:center;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;">' +
          '<span style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('type', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:10px;"><span style="color:var(--dm-text-muted);">text</span>: <span style="color:var(--dm-danger);text-decoration:line-through;font-size:9px;">' + escapeAttr((c.oldText || '').slice(0, 20)) + '</span> \u2192 <span style="color:var(--dm-success);">' + escapeAttr((c.newText || '').slice(0, 20)) + '</span></div>' +
          '</div>' +
          '<button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else if (item.type === 'dom') {
        const c = item.data;
        const colors: Record<string, string> = { delete: 'var(--dm-danger)', duplicate: 'var(--dm-purple)', move: '#f59e0b', insert: 'var(--dm-success)', text: 'var(--dm-accent)' };
        const ic: Record<string, keyof typeof icons> = { delete: 'trash', duplicate: 'layers', move: 'move', insert: 'plus', text: 'type' };
        const cid = c.id || 'dom-' + c.action;
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '" style="display:flex;align-items:center;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;">' +
          '<span style="color:' + (colors[c.action] || 'var(--dm-text-muted)') + ';display:flex;flex-shrink:0;">' + icon(ic[c.action] || 'sparkles', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:10px;color:' + (colors[c.action] || 'var(--dm-text-muted)') + ';">' + c.action.toUpperCase() + ' &lt;' + c.tagName + '&gt;</div>' +
          '</div><button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else {
        const c = item.data;
        const isViewing = c.id === viewingCommentId;
        if (isViewing) {
          return '<div class="dm-change-item" style="border-bottom:1px solid var(--dm-separator);background:var(--dm-purple-bg);">' +
            '<div style="display:flex;align-items:center;gap:6px;padding:8px 12px 6px 28px;">' +
            '<span style="color:var(--dm-yellow);display:flex;flex-shrink:0;">' + icon('messageSquare', 10) + '</span>' +
            '<span style="font-size:10px;font-weight:600;color:var(--dm-text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(c.selector || '') + '</span>' +
            '<button data-dm-action="close-viewing-comment" aria-label="Close" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('x', 10) + '</button>' +
            '</div>' +
            '<div style="padding:0 12px 6px 28px;font-size:11px;color:var(--dm-text);line-height:1.5;">' + escapeAttr(c.text) + '</div>' +
            '<div style="display:flex;gap:6px;padding:0 12px 8px 28px;">' +
            '<button data-dm-edit-comment="' + c.id + '" aria-label="Edit comment" style="padding:3px 10px;background:rgba(139,92,246,0.12);border:1px solid var(--dm-purple-border);border-radius:3px;color:var(--dm-purple);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Edit</button>' +
            '<button data-dm-delete-comment="' + c.id + '" aria-label="Delete comment" style="padding:3px 10px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:3px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;">Delete</button>' +
            '</div></div>';
        }
        return '<div class="dm-change-item" data-dm-comment-item="' + c.id + '" style="display:flex;align-items:start;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);background:var(--dm-purple-bg);cursor:pointer;">' +
          '<span style="color:var(--dm-yellow);display:flex;flex-shrink:0;margin-top:2px;">' + icon('messageSquare', 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:10px;color:var(--dm-text);margin-bottom:4px;">' + escapeAttr(c.text) + '</div>' +
          '<div style="display:flex;gap:6px;">' +
          '<button data-dm-edit-comment="' + c.id + '" aria-label="Edit comment" style="padding:2px 8px;background:rgba(139,92,246,0.12);border:1px solid var(--dm-purple-border);border-radius:3px;color:var(--dm-purple);cursor:pointer;font-size:9px;font-family:inherit;">Edit</button>' +
          '<button data-dm-delete-comment="' + c.id + '" aria-label="Delete comment" style="padding:2px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-input-border);border-radius:3px;color:var(--dm-text-muted);cursor:pointer;font-size:9px;font-family:inherit;">Delete</button>' +
          '</div></div></div>';
      }
    }).join('');

    return '<div class="dm-change-group">' + header + body + '</div>';
  }).join('');

  return '<div>' + clearAllBtn + groupHtml + '</div>';
}

/* ── Settings View ── */
function renderSettingsView(): string {
  const cfHex = colorFormat === 'hex';
  const cfRgba = colorFormat === 'rgba';
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
    '<div style="' + sS + '"><div style="' + sT + '">MCP Server</div><div style="display:flex;flex-direction:column;gap:6px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">WebSocket Port</span><input type="number" class="dm-input" data-dm-setting="wsPort" value="9960" style="width:80px;text-align:right;"/></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Auto-connect</span><input type="checkbox" data-dm-setting="autoConnect" checked style="accent-color:var(--dm-accent);"/></div></div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Inspector</div><div style="display:flex;flex-direction:column;gap:6px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Hover color</span><input type="color" data-dm-setting="hoverColor" value="#4F9EFF" style="width:28px;height:22px;border:1px solid var(--dm-input-border);border-radius:4px;cursor:pointer;background:none;padding:0;"/></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Selection color</span><input type="color" data-dm-setting="selectColor" value="#FF6B35" style="width:28px;height:22px;border:1px solid var(--dm-input-border);border-radius:4px;cursor:pointer;background:none;padding:0;"/></div></div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Color Format</div><div style="display:flex;gap:4px;">' +
    '<button data-dm-color-format="hex" style="' + (cfHex ? activeBtn : inactiveBtn) + '">HEX</button>' +
    '<button data-dm-color-format="rgba" style="' + (cfRgba ? activeBtn : inactiveBtn) + '">RGBA</button></div></div>' +
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
      // Preserve focused input/textarea/select — don't touch them during morphdom
      if (fromEl === document.activeElement &&
          (fromEl.tagName === 'INPUT' || fromEl.tagName === 'TEXTAREA' || fromEl.tagName === 'SELECT')) {
        return false;
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
  // Click handler
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Tab switching
    const tabBtn = target.closest<HTMLElement>('[data-dm-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.dmTab as Tab;
      if (tab === 'layers') refreshDomTree();
      else if (tab === 'changes') refreshChanges();
      else render();
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
        case 'refresh-mcp': refreshMcpStatus(); break;
        case 'copy-prompt': copyPrompt(); break;
        case 'send-to-agent': sendToAgent(); break;
        case 'toggle-theme': toggleTheme(); break;
        case 'submit-comment': submitComment(); break;
        case 'cancel-comment': cancelComment(); break;
        case 'close-viewing-comment': viewingCommentId = null; render(); break;
        case 'clear-all-changes': clearAllChanges(); break;
        case 'back-from-settings': settingsOpen = false; render(); break;
        case 'settings': settingsOpen = !settingsOpen; render(); break;
        // v1.2: Presets
        case 'open-presets':
          presetsOpen = true; presetsTab = 'builtin';
          editingPresetData = null; deletingPresetId = null; presetAccordionOpen = new Set();
          refreshPresets(); break;
        case 'close-presets': presetsOpen = false; editingPresetData = null; deletingPresetId = null; render(); break;
        case 'save-preset': {
          const nameInput = root.querySelector('[data-dm-preset-name]') as HTMLInputElement;
          const name = nameInput?.value?.trim();
          if (name) {
            send({ type: 'SP_SAVE_PRESET', name }).then(() => {
              presetsTab = 'custom';
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
          send({ type: 'SP_UPDATE_PRESET', presetId: id, name: newName, styles: newStyles }).then(() => refreshPresets());
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
        case 'preview-transition': send({ type: 'SP_PREVIEW_TRANSITION_RULE' }); break;
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

    // Section toggle (Phase 3B)
    const sectionHeader = target.closest<HTMLElement>('[data-dm-toggle-section]');
    if (sectionHeader) {
      const sid = sectionHeader.dataset.dmToggleSection!;
      const current = sectionStates[sid];
      const body = root.querySelector('[data-dm-section-body="' + sid + '"]') as HTMLElement;
      // Determine current open state from body class
      const isOpen = current !== undefined ? current : (body ? !body.classList.contains('dm-collapsed') : true);
      sectionStates[sid] = !isOpen;
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

    // Layer delete
    const delLayerBtn = target.closest<HTMLElement>('[data-dm-delete-layer]');
    if (delLayerBtn) {
      e.stopPropagation();
      deleteLayer(delLayerBtn.dataset.dmDeleteLayer!);
      return;
    }

    // Layer selection
    const layerEl = target.closest<HTMLElement>('[data-dm-layer]');
    if (layerEl && !target.closest('[data-dm-toggle-collapse]') && !target.closest('[data-dm-toggle-vis]') && !target.closest('[data-dm-delete-layer]')) {
      selectElement(layerEl.dataset.dmLayer!);
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
      deleteCommentEntry(deleteCommentBtn.dataset.dmDeleteComment!);
      return;
    }

    const commentItem = target.closest<HTMLElement>('[data-dm-comment-item]');
    if (commentItem && !target.closest('[data-dm-edit-comment]') && !target.closest('[data-dm-delete-comment]')) {
      const c = comments.find(cc => cc.id === commentItem.dataset.dmCommentItem);
      if (c) scrollToComment(c);
      return;
    }

    // Remove change
    const removeChangeBtn = target.closest<HTMLElement>('[data-dm-remove-change]');
    if (removeChangeBtn) {
      removeChange(removeChangeBtn.dataset.dmRemoveChange!);
      return;
    }

    // Change group toggle (Phase 4A)
    const changeGroupHeader = target.closest<HTMLElement>('[data-dm-change-group]');
    if (changeGroupHeader && !target.closest('[data-dm-select-change-el]')) {
      const key = changeGroupHeader.dataset.dmChangeGroup!;
      if (changesGroupCollapsed.has(key)) changesGroupCollapsed.delete(key);
      else changesGroupCollapsed.add(key);
      render();
      return;
    }

    // Select element from change group / change item — but not when the
    // click was on an inner button (zap, trash, etc.) which has its own handler.
    const selectChangeEl = target.closest<HTMLElement>('[data-dm-select-change-el]');
    if (selectChangeEl && !target.closest('button[data-dm-batch-apply], button[data-dm-remove-change], button[data-dm-edit-comment], button[data-dm-delete-comment]')) {
      e.stopPropagation();
      const elementId = selectChangeEl.dataset.dmSelectChangeEl;
      if (elementId) selectElement(elementId);
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

    // v1.2: Apply page token
    const applyTokenBtn = target.closest<HTMLElement>('[data-dm-apply-token]');
    if (applyTokenBtn) {
      const cssVar = applyTokenBtn.dataset.dmApplyToken!;
      const property = applyTokenBtn.dataset.dmTokenProp!;
      send({ type: 'SP_APPLY_TOKEN', cssVar, property }).then(r => {
        if (r?.info) info = r.info;
        if (r?.styleChanges) styleChanges = r.styleChanges;
        if (r?.domChanges) domChanges = r.domChanges;
        if (r?.comments) comments = r.comments;
        if (r?.undoCount != null) undoCount = r.undoCount;
        if (r?.redoCount != null) redoCount = r.redoCount;
        render();
      });
      return;
    }

    // v1.2: Toggle token group accordion
    const tokenGroupBtn = target.closest<HTMLElement>('[data-dm-toggle-token-group]');
    if (tokenGroupBtn) {
      const groupName = tokenGroupBtn.dataset.dmToggleTokenGroup!;
      if (presetAccordionOpen.has(groupName)) presetAccordionOpen.delete(groupName);
      else presetAccordionOpen.add(groupName);
      render(); return;
    }

    // v1.2: Edit preset (open edit view)
    const editPresetBtn = target.closest<HTMLElement>('[data-dm-edit-preset]');
    if (editPresetBtn) {
      const pid = editPresetBtn.dataset.dmEditPreset!;
      const preset = customPresetsList.find((p: any) => p.id === pid);
      if (preset) { editingPresetData = { id: pid, name: preset.name, styles: { ...preset.styles } }; render(); }
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

    // v1.2: Preset tab switcher
    const presetTabBtn = target.closest<HTMLElement>('[data-dm-preset-tab]');
    if (presetTabBtn) {
      presetsTab = presetTabBtn.dataset.dmPresetTab as 'builtin' | 'custom';
      editingPresetData = null; deletingPresetId = null;
      refreshPresets(); return;
    }

    // v1.2: Border link toggle
    const borderLinkBtn = target.closest<HTMLElement>('[data-dm-border-link]');
    if (borderLinkBtn) {
      const key = borderLinkBtn.dataset.dmBorderLink!;
      if (key === 'width') borderWidthLinked = !borderWidthLinked;
      else if (key === 'style') borderStyleLinked = !borderStyleLinked;
      else if (key === 'color') borderColorLinked = !borderColorLinked;
      else if (key === 'radius') borderRadiusLinked = !borderRadiusLinked;
      render(); return;
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

    // Import presets file input
    const importInput = target.closest<HTMLInputElement>('[data-dm-import-presets]');
    if (importInput && importInput.files?.[0]) {
      const file = importInput.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const json = ev.target?.result as string;
        send({ type: 'SP_IMPORT_PRESETS', json }).then(r => {
          importInput.value = '';
          if (r?.count != null) { presetsTab = 'custom'; refreshPresets(); }
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
      applyStyle(prop, val); return;
    }

    // Shadow field select change
    const shadowSelect = target.closest<HTMLSelectElement>('[data-dm-shadow-field]');
    if (shadowSelect) { applyShadowFromFields(); return; }

    // Text-shadow color picker (input event fires for type="color")
    const tsColor = target.closest<HTMLInputElement>('[data-dm-textshadow-field="color"]');
    if (tsColor) { applyTextShadowFromFields(); return; }

    // Text input change (on blur/enter)
    const propInput = target.closest<HTMLInputElement>('input[data-dm-prop]');
    if (propInput) {
      const prop = propInput.dataset.dmProp!;
      const isNumeric = propInput.dataset.dmNumeric === '1';
      const unit = propInput.dataset.dmUnit || '';
      const raw = propInput.value.trim();
      const isPureNumber = /^-?\d+(?:\.\d+)?$/.test(raw);
      const val = isNumeric && unit && isPureNumber ? raw + unit : raw;
      const borderWidths = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'];
      const borderRadii = ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'];
      if (borderWidthLinked && borderWidths.includes(prop)) {
        Promise.all(borderWidths.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      if (borderRadiusLinked && borderRadii.includes(prop)) {
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

  // Input handler (color pickers, comment textarea, layer search)
  root.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;

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

  // Keydown handler
  root.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;

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
        reorderLayer(dragLayerId, targetId);
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
