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
  // For 'move' actions: where the element ended up. Lets us replay the move
  // after a page reload AND tell the agent exactly which container the
  // element belongs in now.
  destination?: { parentSelector: string; index: number };
  // Where the element was BEFORE the (first) move. Captured once and never
  // updated on subsequent moves so Clear All can put it back regardless of
  // how many times it was dragged.
  origin?: { parentSelector: string; index: number };
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

function kebab(prop: string): string {
  return prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
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
    for (const [prop, val] of props) decls.push(`  ${kebab(prop)}: ${val};`);
    blocks.push(`[data-dm-id="${elementId}"] {\n${decls.join('\n')}\n}`);
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
        const parent = document.querySelector(c.destination.parentSelector) as HTMLElement | null;
        if (!parent) continue;
        const siblings = Array.from(parent.children);
        const idx = Math.min(c.destination.index, siblings.length);
        const before = siblings[idx];
        if (before) parent.insertBefore(fragment, before);
        else parent.appendChild(fragment);
      } else if (c.action === 'move' && c.destination) {
        // Prefer id-based lookup — selectors recorded at edit time may
        // describe positions that no longer match after a reconstruction.
        const source =
          (document.querySelector(`[${DATA_ATTR}="${c.elementId}"]`) as HTMLElement | null) ||
          (document.querySelector(c.selector) as HTMLElement | null);
        const parent = document.querySelector(c.destination.parentSelector) as HTMLElement | null;
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

export function recordDomChange(
  elementId: string, selector: string, action: DomChange['action'],
  tagName: string, outerHTML?: string,
  destination?: DomChange['destination'],
  origin?: DomChange['origin']
): DomChange {
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
      ws.onclose = () => { ws = null; };
      ws.onerror = () => { ws = null; };
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
}
