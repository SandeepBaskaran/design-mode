// ============================================================
// Design Mode — Content Script (thin layer)
// Handles DOM inspection, overlays, editing. NO panel UI.
// Communicates with Side Panel via chrome.runtime messages.
// Phases 1-9 integrated + new: parent/child, undo/redo, dom tree, comments
// ============================================================

import { getElementById, getOrAssignId, generateSelector } from './helpers';
import { showHover, hideHover, showSelect, hideSelect, destroyOverlays, resetOverlayTeardown } from './overlays';
import { enableInspect, disableInspect, isInspectActive, getSelectedElementId, setSelectedElementId, buildElementInfo, getComputedStylesBlock } from './inspector';
import type { ElementInfo } from './inspector';
import { getStyleChanges, getTextChanges, getDomChanges, clearAllChanges, applyStyleChange, applyTextChange, applyHtmlChange, removeStyleChange, removeDomChange, removeTextChange, recordDomChange, connectToServer, disconnectFromServer, isConnected, getChangeReport, reorderChange, getAllChanges, replaySession, setOverridesEnabled, applyChangesPayload, setUnhandledMessageHandler, sendRelayResponse } from './change-tracker';
import { cutElement, copyElement, pasteElement, duplicateElement, deleteElement, moveElement } from './html-editor';
import { captureElementScreenshot, downloadDataUrl } from './screenshots';
import { getCustomPresets, saveCustomPreset, deleteCustomPreset, updateCustomPreset, importPresets, getPageTokens } from './presets';
import { exportCSS, exportTailwind, exportSCSS, exportJSX, generateGitHubIssueBody, copyToClipboard } from './export';
import { buildDomTree } from './dom-tree';
import { addComment, getPageComments, deleteComment, hideAllPins as hideCommentPins, showAllPins as showCommentPins, setCommentResolved, setCommentPinOffset, replacePageComments } from './comments';
// Source detection — kept; surfaced in the prompt + Design tab
import { getSourceLocation, getComponentHierarchy, openInVSCode } from './source-detection';
// Animation controls — kept (freeze/preview helpers)
import { isFrozen, toggleFreeze, unfreezeAnimations, getAnimationState } from './animation-controls';
// Multi-select — toggle mode, fan-out style edits to N elements at once
import {
  isMultiSelectActive, enableMultiSelect, disableMultiSelect,
  getSelectedIds as getMultiSelectIds, clearSelection as clearMultiSelect,
  refreshOverlays as refreshMultiSelectOverlays,
  toggleSelection as toggleMultiSelectMember,
} from './multi-select';
// Design/Layout mode — component palette + resize handles
import { getComponentsByCategory, placeComponent, showResizeHandles, hideResizeHandles } from './design-mode';
// Enhanced export — markdown for Copy Prompt
import { exportMarkdown, exportGitHubIssueBody as exportEnhancedGitHubIssue } from './enhanced-export';
// Keyboard shortcuts
import { enableShortcuts, disableShortcuts, registerShortcut, loadShortcuts, getShortcuts } from './keyboard-shortcuts';

let on = false;
// Heartbeat to background — fires every 4s while design-mode is active to
// confirm the side panel is still around. If background reports the panel
// closed (or the SW is asleep / context invalidated), we self-disable so
// the page never shows orphan overlays/pins after the panel went away.
let panelHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
function startPanelHeartbeat() {
  if (panelHeartbeatTimer) return;
  panelHeartbeatTimer = setInterval(async () => {
    if (!on) return;
    // Bail when the extension has been reloaded / disabled — chrome.runtime
    // is null in orphaned content scripts.
    if (!chrome.runtime?.id) { disable(); return; }
    try {
      const r: { open?: boolean } | undefined = await new Promise((resolve) => {
        try { chrome.runtime.sendMessage({ type: 'IS_PANEL_OPEN' }, (resp) => resolve(resp)); }
        catch { resolve(undefined); }
      });
      if (!r || r.open === false) disable();
    } catch {
      // Extension context invalidated or SW gone — definitely no panel.
      disable();
    }
  }, 4000);
}
function stopPanelHeartbeat() {
  if (panelHeartbeatTimer) { clearInterval(panelHeartbeatTimer); panelHeartbeatTimer = null; }
}

// Undo/Redo stacks
interface StyleUndoEntry { kind: "style"; elementId: string; property: string; oldValue: string; newValue: string; changeId?: string; }
interface DomUndoEntry { kind: "dom"; action: string; elementId: string; html: string; parentId: string; nextSiblingId: string | null; oldText?: string; newText?: string; }
interface TextUndoEntry { kind: "text"; elementId: string; oldText: string; newText: string; }
interface VisibilityUndoEntry { kind: "visibility"; elementId: string; wasHidden: boolean; oldDisplay: string; }
type UndoEntry = StyleUndoEntry | DomUndoEntry | TextUndoEntry | VisibilityUndoEntry;
const undoStack: UndoEntry[] = [];
const redoStack: UndoEntry[] = [];

/* —— Helpers —— */

function getFullState() {
  return {
    enabled: on,
    connected: isConnected(),
    inspecting: isInspectActive(),
    frozen: isFrozen(),
    multiSelect: isMultiSelectActive(),
    multiSelectIds: getMultiSelectIds(),
    undoCount: undoStack.length,
    redoCount: redoStack.length,
  };
}

async function getChangesPayload() {
  const pageComments = await getPageComments();
  // Decorate style changes with the number of elements currently matching
  // their saved selector — drives the "applies to N elements" badge in the
  // panel's Changes tab so the user knows what a Zap-Apply will hit.
  const decorated = getStyleChanges().map(c => {
    let matchCount = 1;
    try { matchCount = Math.max(1, document.querySelectorAll(c.selector).length); } catch {}
    return { ...c, matchCount };
  });
  return {
    styleChanges: decorated,
    textChanges: getTextChanges(),
    comments: pageComments,
    domChanges: getDomChanges(),
  };
}

function notifyPanel(type: string, payload?: any) {
  // chrome.runtime.id goes undefined the moment the extension is reloaded
  // / disabled / removed while a content script is still alive on a page.
  // Calling sendMessage at that point throws "Extension context
  // invalidated". Guard so the orphan content script just no-ops.
  if (!chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({ type, ...payload });
  } catch {}
}

function selectAndNotify(el: HTMLElement) {
  const info = buildElementInfo(el);
  setSelectedElementId(info.id);
  showSelect(el);
  onElementSelected(info);
  return info;
}

function onElementSelected(info: ElementInfo) {
  const el = getElementById(info.id);
  const extra: any = {};
  if (el) {
    const source = getSourceLocation(el);
    if (source) {
      extra.sourceLocation = source;
      extra.componentHierarchy = getComponentHierarchy(el).map(c => c.name);
    }
  }
  notifyPanel('ELEMENT_SELECTED', {
    payload: {
      ...info,
      ...extra,
      element: undefined,
      imgSrc: el?.tagName === 'IMG' ? (el as HTMLImageElement).src : undefined,
      textContent: el?.textContent?.trim()?.slice(0, 500) || undefined,
      hasChildElements: el ? el.children.length > 0 : false,
    },
  });
}

/* —— Enable / Disable —— */

// Cloud-tools dispatcher. Mirrors the local server's MCP handlers but runs
// here in the content script because cloud has no server-side state — we
// answer queries straight from the live page.
function dispatchCloudMessage(msg: any) {
  if (!msg?.requestId) return;
  switch (msg.type) {
    case 'CLOUD_GET_CHANGES':
      (async () => {
        const report: any = getChangeReport();
        try {
          const pageComments = await getPageComments();
          report.comments = pageComments.map(c => ({
            selector: c.selector, text: c.text,
            timestamp: new Date(c.timestamp).toISOString(),
            pageUrl: (c as any).pageUrl, resolved: !!(c as any).resolved,
          }));
        } catch { report.comments = []; }
        sendRelayResponse(msg.requestId, report);
      })();
      return;
    case 'CLOUD_APPLY_CHANGES': {
      // Same shape as the local APPLY_CHANGES but the cloud expects an
      // ack for the agent's tool call. Apply via the managed-stylesheet
      // path so changes show up in the Changes tab and survive reloads.
      const items: Array<{ elementId: string; styles: Record<string, string> }> =
        Array.isArray(msg.payload?.changes) ? msg.payload.changes : [];
      let totalProps = 0, totalEls = 0;
      for (const ch of items) {
        if (!ch?.elementId || !ch.styles) continue;
        for (const [prop, val] of Object.entries(ch.styles)) {
          applyStyleChange(ch.elementId, prop, val as string);
          totalProps++;
        }
        totalEls++;
      }
      sendRelayResponse(msg.requestId, { ok: true, totalProps, totalEls });
      return;
    }
    case 'CLOUD_CLEAR_CHANGES':
      clearAllChanges();
      sendRelayResponse(msg.requestId, { ok: true });
      return;
    case 'CLOUD_GET_SESSION_SUMMARY':
      sendRelayResponse(msg.requestId, {
        pageUrl: location.href,
        pageTitle: document.title,
        totalStyleChanges: getStyleChanges().length,
        totalTextChanges: getTextChanges().length,
        totalDomChanges: getDomChanges().length,
      });
      return;
    case 'CLOUD_EXPORT_CHANGES':
      sendRelayResponse(msg.requestId, { text: renderExportText(msg.payload?.format || 'css') });
      return;
  }
}

// Lightweight format renderers — kept here so the content script doesn't
// have to ship the local server's full export module. Only the four
// formats the agent can request via export_changes.
function renderExportText(format: 'css' | 'tailwind' | 'scss' | 'jsx'): string {
  const styles = getStyleChanges();
  if (styles.length === 0) return 'No changes to export.';
  const bySelector = new Map<string, Map<string, string>>();
  for (const c of styles) {
    if (!bySelector.has(c.selector)) bySelector.set(c.selector, new Map());
    bySelector.get(c.selector)!.set(c.property, c.newValue);
  }
  const kebab = (s: string) => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
  if (format === 'css' || format === 'scss') {
    const out: string[] = [];
    for (const [sel, props] of bySelector) {
      out.push(`${sel} {\n${Array.from(props).map(([k, v]) => `  ${kebab(k)}: ${v};`).join('\n')}\n}`);
    }
    return (format === 'scss' ? '// Design Mode SCSS export\n\n' : '') + out.join('\n\n');
  }
  if (format === 'tailwind') {
    const out: string[] = [];
    for (const [sel, props] of bySelector) {
      const classes = Array.from(props).map(([prop, val]) => `[${kebab(prop)}:${val.replace(/\s+/g, '_')}]`);
      out.push(`/* ${sel} */\nclass="${classes.join(' ')}"`);
    }
    return out.join('\n\n');
  }
  // jsx
  const blocks: string[] = [];
  for (const [sel, props] of bySelector) {
    const entries = Array.from(props).map(([k, v]) => `  ${k}: '${v}'`).join(',\n');
    blocks.push(`// ${sel}\nconst styles = {\n${entries}\n};`);
  }
  return blocks.join('\n\n');
}

setUnhandledMessageHandler(dispatchCloudMessage);

// Reads the user's chosen MCP transport mode + cloud creds from storage,
// then opens the appropriate transport. Falls back to local on any error.
async function openConfiguredTransport() {
  try {
    const conf = await chrome.storage.local.get(['dm-mcp-mode', 'dm-mcp-cloud-token', 'dm-mcp-cloud-url']);
    const mode = (conf['dm-mcp-mode'] as 'local' | 'cloud' | 'self-hosted' | undefined) || 'local';
    if (mode === 'local') { connectToServer({ mode: 'local' }); return; }
    const cloudToken = conf['dm-mcp-cloud-token'];
    const cloudUrl = conf['dm-mcp-cloud-url'] || (mode === 'cloud' ? 'https://www.mcp.designmode.app' : '');
    // No token yet (user picked Cloud mode but hasn't registered) — leave
    // every transport closed instead of dialing localhost. The MCP status
    // dot stays "offline" and the panel's tooltip points the user to
    // Settings → MCP → Connect to Cloud.
    if (!cloudToken || !cloudUrl) { disconnectFromServer(); return; }
    connectToServer({ mode, cloudToken, cloudUrl });
  } catch {
    connectToServer({ mode: 'local' });
  }
}

function enable() {
  if (on) return;
  on = true;
  resetOverlayTeardown();
  showCommentPins();         // surface saved comment pins on the page
  startPanelHeartbeat();     // detect a panel-close that the message chain missed
  void openConfiguredTransport();
  enableInspect((i: ElementInfo) => onElementSelected(i));
  loadShortcuts().then(() => {
    enableShortcuts();
    registerAllShortcuts();
  });
  // Replay any changes saved in this session for this URL — survives reloads
  // and back/forward navigation. Always notify so the side panel resets
  // its state to match the new page (even if it's empty).
  replaySession().finally(() => {
    notifyPanel('CHANGES_UPDATE', {
      styleChanges: getStyleChanges(),
      textChanges: getTextChanges(),
      domChanges: getDomChanges(),
    });
  });
  setTimeout(() => notifyPanel('STATE_UPDATE', getFullState()), 1000);
}

function disable() {
  if (!on) return;
  on = false;
  stopPanelHeartbeat();
  // Order matters: kill the input handlers BEFORE removing the overlays so
  // an in-flight mouseover can't repaint the hover layer after we tear it
  // down. disableInspect already removes the listeners and resets the
  // crosshair cursor; disableMultiSelect tears down its own outline overlays.
  disableInspect();
  disableMultiSelect();
  destroyOverlays();
  hideCommentPins();
  if (isFrozen()) unfreezeAnimations();
  disconnectFromServer();
  disableShortcuts();
  setSelectedElementId(null);
  // Final sweep — if any other module attached an overlay-like element, this
  // catches the strays so the page goes back to a pristine state the moment
  // the panel closes.
  document.querySelectorAll('#dm-hover, #dm-select, #dm-dim-label, #dm-toolbar, .dm-multi-overlay, .dm-comment-pin').forEach(el => el.remove());
  if (document.documentElement.style.cursor === 'crosshair') {
    document.documentElement.style.cursor = '';
  }
}

function registerAllShortcuts() {
  registerShortcut('toggle-inspect', () => {
    if (isInspectActive()) disableInspect();
    else enableInspect((i: ElementInfo) => onElementSelected(i));
    notifyPanel('STATE_UPDATE', getFullState());
  });
  registerShortcut('freeze-animations', () => {
    toggleFreeze();
    notifyPanel('STATE_UPDATE', getFullState());
    notifyPanel('ANIMATION_STATE', { payload: getAnimationState() });
  });
  registerShortcut('deselect', () => {
    if (isMultiSelectActive()) disableMultiSelect();
    else if (isInspectActive()) disableInspect();
    else { hideSelect(); setSelectedElementId(null); }
    notifyPanel('STATE_UPDATE', getFullState());
  });
  registerShortcut('delete-element', () => {
    const sid = getSelectedElementId();
    if (sid) { deleteElement(sid); setSelectedElementId(null); hideSelect(); }
  });
  registerShortcut('screenshot', () => {
    const sid = getSelectedElementId();
    if (sid) captureElementScreenshot(sid).then(url => { if (url) downloadDataUrl(url, `element-${Date.now()}.png`); });
  });
  registerShortcut('export-css', () => {
    const ch = getStyleChanges();
    const css = exportCSS(ch);
    copyToClipboard(css);
  });
}

/* —— Message handler —— */

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  switch (msg.type) {
    // Ping for checking if content script is injected
    case 'PING': sendResponse({ ok: true }); break;

    case 'ACTIVATE_DESIGN_MODE': enable(); sendResponse(getFullState()); break;
    case 'DEACTIVATE_DESIGN_MODE': disable(); sendResponse(getFullState()); break;
    case 'TOGGLE_DESIGN_MODE': if (on) disable(); else enable(); sendResponse(getFullState()); break;

    case 'TOGGLE_INSPECT':
      if (isInspectActive()) disableInspect();
      else enableInspect((i: ElementInfo) => onElementSelected(i));
      sendResponse({ inspecting: isInspectActive() });
      break;

    case 'GET_STATE': sendResponse(getFullState()); break;
    // Side panel asked us to drop the active transport and open a fresh
    // one — used when the user flips Mode in Settings or finishes the
    // Connect-to-Cloud flow.
    case 'RECONFIGURE_TRANSPORT': {
      void openConfiguredTransport();
      sendResponse({ ok: true });
      break;
    }
    case 'GET_CHANGES': { getChangesPayload().then(p => sendResponse(p)); return true; }

    // New: DOM tree for Layers panel
    case 'GET_DOM_TREE': {
      const tree = buildDomTree();
      sendResponse({ tree });
      break;
    }

    // Scroll the page so the named element comes into view (without selecting it).
    case 'SCROLL_TO_ELEMENT': {
      const eid = (msg as any).elementId;
      if (eid) {
        // The tracker stamps each element with `data-dm-{id}`; we look it up
        // by attribute selector. Pseudo-element / shadow-root virtual nodes
        // (e.g. `<id>::before`, `<id>::shadow`) don't have real DOM nodes,
        // so we strip any `::*` suffix and target the host instead.
        const realId = String(eid).replace(/::.*$/, '');
        const el = document.querySelector('[data-dm-' + realId + ']') as HTMLElement | null;
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }
      sendResponse({ ok: true });
      break;
    }

    // New: Page URL for header
    case 'GET_PAGE_URL': {
      sendResponse({ url: window.location.href, hostname: window.location.hostname });
      break;
    }

    // New: MCP status (3 states)
    case 'GET_MCP_STATUS': {
      // isConnected() checks WebSocket to server
      // We don't have direct access to MCP client state from content script
      // so we report what we know: WebSocket connection state
      sendResponse({
        connected: isConnected(),
        serverRunning: isConnected(),
        agentConnected: false, // Will be updated by server push
        mcpState: isConnected() ? 'running' : 'offline',
      });
      break;
    }

    // Implicit page-context selection. Side panel calls this when no element
    // is selected so the design tab can show body's properties as defaults.
    // Selects <body> WITHOUT painting the orange select overlay (the overlay
    // would visually wrap the entire viewport and look broken).
    case 'INSPECT_PAGE': {
      const body = document.body;
      if (body) {
        const info = buildElementInfo(body);
        setSelectedElementId(info.id);
        // Deliberately DO NOT call showSelect here.
        sendResponse({ payload: { ...info, element: undefined } });
      } else sendResponse({ error: 'No body element' });
      break;
    }

    // New: Select specific element by ID (from Layers panel) — falls back to
    // the saved selector for changes from a previous session whose dm-id no
    // longer exists in the current DOM (the selector-based stylesheet still
    // applies, but the element-id lookup misses). When multi-select is on,
    // clicking a layer toggles its membership in the multi-select set
    // (matches the inspector's click-to-add behavior on the page).
    case 'SELECT_ELEMENT': {
      let el = getElementById(msg.elementId) as HTMLElement | null;
      if (!el) {
        const fallbackSel =
          getStyleChanges().find(c => c.elementId === msg.elementId)?.selector ||
          getTextChanges().find(c => c.elementId === msg.elementId)?.selector ||
          getDomChanges().find(c => c.elementId === msg.elementId)?.selector;
        if (fallbackSel) {
          try { el = document.querySelector(fallbackSel) as HTMLElement | null; } catch {}
        }
      }
      if (el) {
        if (isMultiSelectActive()) {
          toggleMultiSelectMember(msg.elementId);
          notifyPanel('MULTI_SELECT_UPDATE', { payload: { ids: getMultiSelectIds() } });
        }
        const info = selectAndNotify(el);
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        sendResponse({ payload: { ...info, element: undefined } });
      } else sendResponse({ error: 'Element not found' });
      break;
    }

    // New: Select parent of current element
    case 'SELECT_PARENT': {
      const sid = getSelectedElementId();
      if (sid) {
        const current = getElementById(sid);
        if (current?.parentElement && current.parentElement !== document.documentElement && current.parentElement !== document.body.parentElement) {
          const parent = current.parentElement;
          const info = selectAndNotify(parent);
          sendResponse({ payload: { ...info, element: undefined } });
        } else sendResponse({ error: 'No parent available' });
      } else sendResponse({ error: 'No element selected' });
      break;
    }

    // New: Select first child of current element
    case 'SELECT_CHILD': {
      const sid = getSelectedElementId();
      if (sid) {
        const current = getElementById(sid);
        const firstChild = current?.children?.[0] as HTMLElement | undefined;
        if (firstChild) {
          const info = selectAndNotify(firstChild);
          sendResponse({ payload: { ...info, element: undefined } });
        } else sendResponse({ error: 'No child elements' });
      } else sendResponse({ error: 'No element selected' });
      break;
    }

    // New: Hover element from Layers panel
    case 'HOVER_ELEMENT': {
      const el = getElementById(msg.elementId);
      if (el) showHover(el);
      sendResponse({ ok: true });
      break;
    }

    case 'UNHOVER_ELEMENT': {
      hideHover();
      sendResponse({ ok: true });
      break;
    }

    // Undo (supports style, dom, text, visibility)
    case 'UNDO': {
      if (undoStack.length > 0) {
        const entry = undoStack.pop()!;
        if (entry.kind === 'style') {
          // Remove the rule; computed style returns to its natural cascaded
          // value (which is what we recorded as oldValue). No inline write
          // — that would shadow future re-applies.
          if (entry.changeId) removeStyleChange(entry.changeId);
        } else if (entry.kind === 'dom') {
          if (entry.action === 'delete') {
            const parent = getElementById(entry.parentId);
            if (parent) {
              const temp = document.createElement('div');
              temp.innerHTML = entry.html;
              const restored = temp.firstElementChild as HTMLElement;
              if (restored) {
                const next = entry.nextSiblingId ? getElementById(entry.nextSiblingId) : null;
                parent.insertBefore(restored, next);
              }
            }
          } else if (entry.action === 'duplicate') {
            const dup = getElementById(entry.elementId);
            if (dup) dup.remove();
          }
        } else if (entry.kind === 'text') {
          const el = getElementById(entry.elementId);
          if (el) el.textContent = entry.oldText;
        } else if (entry.kind === 'visibility') {
          const el = getElementById(entry.elementId);
          if (el) {
            if (entry.wasHidden) { el.style.display = 'none'; }
            else { el.style.display = entry.oldDisplay; }
          }
        }
        redoStack.push(entry);
      }
      const sid = getSelectedElementId();
      const el = sid ? getElementById(sid) : null;
      getChangesPayload().then(p => sendResponse({
        ...p,
        info: el ? { ...buildElementInfo(el), element: undefined } : null,
        undoCount: undoStack.length,
        redoCount: redoStack.length,
      }));
      return true;
      break;
    }

    // Redo (supports style, dom, text, visibility)
    case 'REDO': {
      if (redoStack.length > 0) {
        const entry = redoStack.pop()!;
        if (entry.kind === 'style') {
          const change = applyStyleChange(entry.elementId, entry.property, entry.newValue);
          if (change) (entry as StyleUndoEntry).changeId = change.id;
        } else if (entry.kind === 'dom') {
          if (entry.action === 'delete') {
            const el = getElementById(entry.elementId);
            if (el) el.remove();
          } else if (entry.action === 'duplicate') {
            const parent = getElementById(entry.parentId);
            if (parent) {
              const temp = document.createElement('div');
              temp.innerHTML = entry.html;
              const restored = temp.firstElementChild as HTMLElement;
              if (restored) {
                const next = entry.nextSiblingId ? getElementById(entry.nextSiblingId) : null;
                parent.insertBefore(restored, next);
              }
            }
          }
        } else if (entry.kind === 'text') {
          const el = getElementById(entry.elementId);
          if (el) el.textContent = entry.newText;
        } else if (entry.kind === 'visibility') {
          const el = getElementById(entry.elementId);
          if (el) {
            if (!entry.wasHidden) { el.style.display = 'none'; }
            else { el.style.display = entry.oldDisplay; }
          }
        }
        undoStack.push(entry);
      }
      const sid = getSelectedElementId();
      const el = sid ? getElementById(sid) : null;
      getChangesPayload().then(p => sendResponse({
        ...p,
        info: el ? { ...buildElementInfo(el), element: undefined } : null,
        undoCount: undoStack.length,
        redoCount: redoStack.length,
      }));
      return true;
      break;
    }

    // New: Add comment on selected element
    case 'ADD_COMMENT': {
      const sid = getSelectedElementId();
      if (sid && msg.text) {
        const el = getElementById(sid);
        const selector = el ? (el.id ? `#${el.id}` : el.tagName.toLowerCase()) : sid;
        addComment(sid, selector, msg.text).then(comment => {
          sendResponse({ comment });
        });
        return true;
      }
      sendResponse({ error: 'No element selected or no text' });
      break;
    }

    // Toggle / set the resolved flag on a comment.
    case 'SET_COMMENT_RESOLVED': {
      const cid = (msg as any).commentId;
      const resolved = !!(msg as any).resolved;
      if (cid) {
        setCommentResolved(cid, resolved).then(() => {
          // After mutation, ensure pins re-render with the new ordinal /
          // colour. showCommentPins is idempotent.
          void showCommentPins();
          sendResponse({ ok: true });
        });
        return true;
      }
      sendResponse({ ok: false });
      break;
    }

    // Persist a manually-dragged pin offset.
    case 'SET_COMMENT_PIN_OFFSET': {
      const cid = (msg as any).commentId;
      const offset = (msg as any).offset;
      if (cid) {
        setCommentPinOffset(cid, offset || null).then(() => {
          void showCommentPins();
          sendResponse({ ok: true });
        });
        return true;
      }
      sendResponse({ ok: false });
      break;
    }

    // New: Remove/revert a specific change
    case 'REMOVE_CHANGE': {
      if (msg.changeId?.startsWith('comment-')) {
        const commentId = msg.changeId.replace('comment-', '');
        deleteComment(commentId).then(async () => { const p = await getChangesPayload(); sendResponse({ ok: true, ...p }); });
        return true;
      }
      const styleChange = getStyleChanges().find(c => c.id === msg.changeId);
      if (styleChange) {
        const el = getElementById(styleChange.elementId);
        if (el) (el.style as any)[styleChange.property] = styleChange.oldValue;
        removeStyleChange(msg.changeId);
      } else {
        const textChange = getTextChanges().find(c => c.id === msg.changeId);
        if (textChange) {
          const el = getElementById(textChange.elementId);
          if (el) {
            if (textChange.isHtml) el.innerHTML = textChange.oldText;
            else el.textContent = textChange.oldText;
          }
          removeTextChange(msg.changeId);
        } else {
          // DOM change — actually reverse the action when possible
          const domChange = getDomChanges().find(c => c.id === msg.changeId);
          if (domChange) {
            try {
              if (domChange.action === 'duplicate' || domChange.action === 'insert') {
                const el = getElementById(domChange.elementId) || document.querySelector(domChange.selector);
                if (el) el.remove();
              } else if (domChange.action === 'delete' && domChange.outerHTML) {
                if (!document.querySelector(domChange.selector)) {
                  const temp = document.createElement('div');
                  temp.innerHTML = domChange.outerHTML;
                  const restored = temp.firstElementChild as HTMLElement | null;
                  if (restored) (document.body || document.documentElement).appendChild(restored);
                }
              }
              // 'move' has no original-position info — record removal only
            } catch {}
            removeDomChange(msg.changeId);
          }
        }
      }
      getChangesPayload().then(p => sendResponse({ ok: true, ...p })); return true;
    }

    case 'SET_TEXT': {
      const sid = getSelectedElementId();
      if (sid && msg.text !== undefined) {
        const el = getElementById(sid);
        if (el) {
          const oldText = el.textContent || '';
          if (oldText !== msg.text) {
            applyTextChange(sid, msg.text);
            undoStack.push({ kind: 'text', elementId: sid, oldText, newText: msg.text });
            redoStack.length = 0;
          }
          const info = buildElementInfo(el);
          onElementSelected(info);
        }
      }
      getChangesPayload().then(p => sendResponse({ ok: true, ...p, undoCount: undoStack.length, redoCount: redoStack.length }));
      return true;
    }

    // Rich text save — sets innerHTML so bold/italic/lists/links survive.
    // The undoStack entry records the OLD innerHTML; revert via el.innerHTML.
    case 'SET_HTML': {
      const sid = getSelectedElementId();
      if (sid && typeof msg.html === 'string') {
        const el = getElementById(sid);
        if (el) {
          const oldHtml = el.innerHTML || '';
          if (oldHtml !== msg.html) {
            applyHtmlChange(sid, msg.html);
            undoStack.push({ kind: 'text', elementId: sid, oldText: oldHtml, newText: msg.html });
            redoStack.length = 0;
          }
          const info = buildElementInfo(el);
          onElementSelected(info);
        }
      }
      getChangesPayload().then(p => sendResponse({ ok: true, ...p, undoCount: undoStack.length, redoCount: redoStack.length }));
      return true;
    }

    case 'APPLY_STYLE': {
      const sid = getSelectedElementId();
      if (sid && msg.property) {
        // Targets: in multi-select mode, apply to every selected element
        // (one change record each so the Changes tab shows the full impact
        // and the agent gets a per-element diff in Copy Prompt). Otherwise
        // just the focused element. Make sure the focused element is in
        // the target list so the side-panel preview updates correctly.
        const multiIds = isMultiSelectActive() ? getMultiSelectIds() : [];
        const targetIds = multiIds.length > 0
          ? Array.from(new Set([sid, ...multiIds]))
          : [sid];
        const kebab = msg.property.replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase());
        for (const id of targetIds) {
          const el = getElementById(id);
          if (!el) continue;
          const beforeValue = window.getComputedStyle(el).getPropertyValue(kebab);
          const change = applyStyleChange(id, msg.property, msg.value, () => {
            const el2 = getElementById(id);
            if (el2 && id === sid) onElementSelected(buildElementInfo(el2));
          });
          const afterValue = window.getComputedStyle(el).getPropertyValue(kebab);
          if (afterValue !== beforeValue) {
            undoStack.push({ kind: 'style', elementId: id, property: msg.property, oldValue: beforeValue, newValue: msg.value, changeId: change?.id });
          }
        }
        if (targetIds.length > 0) redoStack.length = 0;
        // Re-position overlays after the browser repaints — the style we just
        // wrote can change the element's bounding rect (width/height/left/top)
        // and the select+hover overlays plus the W×H dimension label all need
        // to track the new geometry. Without this, the boxes and the size
        // label visually lag behind until the next mouse event triggers
        // refreshSelection().
        requestAnimationFrame(() => {
          if (multiIds.length > 0) refreshMultiSelectOverlays();
          const focusedEl = getElementById(sid);
          if (focusedEl) showSelect(focusedEl);
        });
        const updatedEl = getElementById(sid);
        const updatedInfo = updatedEl ? buildElementInfo(updatedEl) : null;
        getChangesPayload().then(p => sendResponse({
          info: updatedInfo ? { ...updatedInfo, element: undefined, imgSrc: updatedEl?.tagName === 'IMG' ? (updatedEl as HTMLImageElement).src : undefined } : null,
          ...p,
          undoCount: undoStack.length,
          redoCount: redoStack.length,
          appliedTo: targetIds.length,
        }));
        return true;
      } else sendResponse({ error: 'No element selected' });
      break;
    }

    case 'APPLY_PARENT_STYLE': {
      const sid = getSelectedElementId();
      const el = sid ? getElementById(sid) : null;
      const parent = el?.parentElement as HTMLElement | null;
      if (parent && msg.property) {
        const parentId = getOrAssignId(parent);
        applyStyleChange(parentId, msg.property, msg.value, () => {});
        requestAnimationFrame(() => {
          const focusedEl = sid ? getElementById(sid) : null;
          if (focusedEl) showSelect(focusedEl);
        });
        const updatedEl = el;
        const updatedInfo = updatedEl ? buildElementInfo(updatedEl) : null;
        getChangesPayload().then(p => sendResponse({
          info: updatedInfo ? { ...updatedInfo, element: undefined } : null,
          ...p,
          undoCount: undoStack.length,
          redoCount: redoStack.length,
        }));
        return true;
      }
      sendResponse({ error: 'No parent' });
      break;
    }

    case 'DOM_ACTION': {
      const sid = getSelectedElementId();
      if (!sid && msg.action !== 'paste') { sendResponse({ error: 'No element selected' }); break; }
      let newInfo: any = null;
      switch (msg.action) {
        case 'cut': if (sid) { cutElement(sid); setSelectedElementId(null); hideSelect(); } break;
        case 'copy': if (sid) copyElement(sid); break;
        case 'paste': if (sid) { const nid = pasteElement(sid); if (nid) { setSelectedElementId(nid); const el = getElementById(nid); if (el) { showSelect(el); newInfo = buildElementInfo(el); } } } break;
        case 'duplicate': if (sid) {
          const nid = duplicateElement(sid);
          if (nid) {
            const dupEl = getElementById(nid);
            if (dupEl) {
              showSelect(dupEl); newInfo = buildElementInfo(dupEl);
              setSelectedElementId(nid);
              const dupParentId = dupEl.parentElement ? getOrAssignId(dupEl.parentElement as HTMLElement) : '';
              const dupNextId = dupEl.nextElementSibling ? getOrAssignId(dupEl.nextElementSibling as HTMLElement) : null;
              undoStack.push({ kind: 'dom', action: 'duplicate', elementId: nid, html: dupEl.outerHTML, parentId: dupParentId, nextSiblingId: dupNextId });
              redoStack.length = 0;
              // Note: recordDomChange is already called inside duplicateElement() — don't double-record
            }
          }
        } break;
        case 'delete': { const delTarget = msg.elementId || sid; if (delTarget) {
          const delEl = getElementById(delTarget);
          if (delEl) {
            const parentId = delEl.parentElement ? getOrAssignId(delEl.parentElement as HTMLElement) : '';
            const nextId = delEl.nextElementSibling ? getOrAssignId(delEl.nextElementSibling as HTMLElement) : null;
            const html = delEl.outerHTML;
            undoStack.push({ kind: 'dom', action: 'delete', elementId: delTarget, html, parentId, nextSiblingId: nextId });
            redoStack.length = 0;
          }
          deleteElement(delTarget); if (delTarget === sid) { setSelectedElementId(null); hideSelect(); }
        }} break;
        case 'move-up': if (sid) moveElement(sid, 'up'); break;
        case 'move-down': if (sid) moveElement(sid, 'down'); break;
      }
      getChangesPayload().then(p => sendResponse({ info: newInfo ? { ...newInfo, element: undefined } : null, ...p, undoCount: undoStack.length, redoCount: redoStack.length }));
      break;
    }

    case 'CLEAR_CHANGES': {
      // Make sure the override stylesheet is enabled before we clear it,
      // otherwise the page would still be showing `disabled` overrides.
      setOverridesEnabled(true);
      if ((window as any).__dmPreviewSaved) delete (window as any).__dmPreviewSaved;

      // 1. Revert text changes (textContent isn't stylesheet-able). For
      // HTML edits, restore innerHTML so bold/italic/lists are preserved.
      const firstTextOld = new Map<string, { elementId: string; oldText: string; isHtml?: boolean }>();
      for (const ch of getTextChanges()) {
        if (!firstTextOld.has(ch.elementId)) firstTextOld.set(ch.elementId, ch);
      }
      for (const [, ch] of firstTextOld) {
        const el = getElementById(ch.elementId);
        if (!el) continue;
        if (ch.isHtml) el.innerHTML = ch.oldText;
        else el.textContent = ch.oldText;
      }

      // 2. Revert DOM changes:
      //    - duplicate / insert → remove the added node
      //    - delete             → re-create from outerHTML if missing
      //    - move               → put the element back at its origin parent + index
      const moves = getDomChanges().filter(ch => ch.action === 'move' && ch.origin);
      for (const ch of getDomChanges()) {
        try {
          if (ch.action === 'duplicate' || ch.action === 'insert') {
            const el = getElementById(ch.elementId) || document.querySelector(ch.selector);
            if (el) el.remove();
          } else if (ch.action === 'delete' && ch.outerHTML) {
            if (document.querySelector(ch.selector)) continue;
            const temp = document.createElement('div');
            temp.innerHTML = ch.outerHTML;
            const restored = temp.firstElementChild as HTMLElement | null;
            if (restored) (document.body || document.documentElement).appendChild(restored);
          }
        } catch {}
      }
      // Process moves AFTER duplicates are gone (so origin index lines up).
      // Origin parent might also have been moved — try our best.
      for (const ch of moves) {
        try {
          const source = getElementById(ch.elementId) ||
            (ch.selector ? document.querySelector(ch.selector) : null) as HTMLElement | null;
          const originParent = ch.origin && document.querySelector(ch.origin.parentSelector) as HTMLElement | null;
          if (source && originParent && source !== originParent) {
            const idx = Math.min(ch.origin!.index, originParent.children.length);
            const before = originParent.children[idx];
            if (before && before !== source) originParent.insertBefore(source, before);
            else if (!before) originParent.appendChild(source);
          }
        } catch {}
      }

      // 3. Clean leftover preview markers from any in-flight View Original mode.
      document.querySelectorAll('[data-dm-preview-restored="1"]').forEach(el => el.remove());
      document.querySelectorAll<HTMLElement>('[data-dm-preview-hidden="1"]').forEach(el => {
        el.style.display = el.dataset.dmPreviewPrevDisplay || '';
        delete el.dataset.dmPreviewPrevDisplay;
        el.removeAttribute('data-dm-preview-hidden');
      });

      // 4. Defensive sweep — strip stray inline styles on tracked elements
      //    that older code paths might have written (visibility:none, etc.).
      //    Only touches elements that participated in some change, so we
      //    don't reset things the page itself set inline.
      const touchedIds = new Set<string>();
      for (const c of getStyleChanges()) touchedIds.add(c.elementId);
      for (const c of getTextChanges()) touchedIds.add(c.elementId);
      for (const c of getDomChanges()) touchedIds.add(c.elementId);
      for (const id of touchedIds) {
        const el = getElementById(id);
        if (!el) continue;
        // Only clear styles we know we may have leaked. Don't touch arbitrary
        // page-author inline styles.
        if (el.style.display === 'none' || el.style.display === '') el.style.removeProperty('display');
        el.style.removeProperty('animation');
        el.style.removeProperty('animation-name');
      }

      // 5. Comments + arrays + override stylesheet.
      getPageComments().then(async (pageComments) => {
        for (const c of pageComments) await deleteComment(c.id);
        clearAllChanges();
        undoStack.length = 0;
        redoStack.length = 0;
        sendResponse({ ok: true });
      });
      return true;
    }
    case 'REORDER_CHANGE': if (typeof msg.from === 'number' && typeof msg.to === 'number') reorderChange(msg.from, msg.to); getChangesPayload().then(p => sendResponse(p)); return true; break;

    case 'APPLY_PRESET': {
      const sid = getSelectedElementId();
      if (sid && msg.preset) {
        const el = getElementById(sid);
        if (el) {
          for (const [prop, val] of Object.entries(msg.preset.styles as Record<string, string>)) {
            const kebab = prop.replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase());
            const beforeValue = window.getComputedStyle(el).getPropertyValue(kebab);
            const change = applyStyleChange(sid, prop, val);
            const afterValue = window.getComputedStyle(el).getPropertyValue(kebab);
            if (afterValue !== beforeValue) {
              undoStack.push({ kind: 'style', elementId: sid, property: prop, oldValue: beforeValue, newValue: val, changeId: change?.id });
            }
          }
          redoStack.length = 0;
          const updatedInfo = buildElementInfo(el);
          getChangesPayload().then(p => sendResponse({ info: { ...updatedInfo, element: undefined }, ...p, undoCount: undoStack.length, redoCount: redoStack.length }));
          return true;
        }
      }
      sendResponse({ error: 'No element selected' }); break;
    }
    case 'SAVE_PRESET': {
      const sid = getSelectedElementId();
      const kindsAllowed = ['position', 'layout', 'appearance', 'typography', 'fill', 'stroke', 'effects'] as const;
      const kind = (kindsAllowed as readonly string[]).includes(msg.kind) ? msg.kind : 'typography';
      const props: string[] = Array.isArray(msg.props) ? msg.props : [];
      if (sid && msg.name) {
        saveCustomPreset(msg.name, sid, kind, props).then(res => {
          sendResponse(res?.error ? { ok: false, error: res.error } : { ok: true, preset: res?.preset });
        });
        return true;
      }
      sendResponse({ ok: false, error: 'No element selected' });
      break;
    }
    case 'DELETE_PRESET': if (msg.presetId) { deleteCustomPreset(msg.presetId).then(() => sendResponse({ ok: true })); return true; } sendResponse({ ok: true }); break;
    case 'UPDATE_PRESET': {
      if (msg.presetId && msg.name && msg.styles) {
        updateCustomPreset(msg.presetId, msg.name, msg.styles).then(res => sendResponse(res));
        return true;
      }
      sendResponse({ ok: false });
      break;
    }
    case 'GET_PRESETS': { getCustomPresets().then(presets => sendResponse({ presets })); return true; }
    case 'GET_PAGE_TOKENS': {
      const sid = getSelectedElementId();
      const el = (sid ? getElementById(sid) : null) || document.body;
      const groups = getPageTokens(el);
      sendResponse({ groups }); break;
    }
    case 'APPLY_TOKEN': {
      const sid = getSelectedElementId();
      if (sid && msg.cssVar && msg.property) {
        const el = getElementById(sid);
        if (el) {
          const kebab = msg.property.replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase());
          const beforeValue = window.getComputedStyle(el).getPropertyValue(kebab);
          const varValue = `var(${msg.cssVar})`;
          const change = applyStyleChange(sid, msg.property, varValue);
          const afterValue = window.getComputedStyle(el).getPropertyValue(kebab);
          if (afterValue !== beforeValue) {
            undoStack.push({ kind: 'style', elementId: sid, property: msg.property, oldValue: beforeValue, newValue: varValue, changeId: change?.id });
            redoStack.length = 0;
          }
          const updatedInfo = buildElementInfo(el);
          getChangesPayload().then(p => sendResponse({ info: { ...updatedInfo, element: undefined }, ...p, undoCount: undoStack.length, redoCount: redoStack.length }));
          return true;
        }
      }
      sendResponse({ error: 'No element selected' }); break;
    }
    case 'IMPORT_CHANGES': {
      // Replace every change on the page with the imported payload. Clears
      // first so we don't double-apply, then replays via the same path
      // session-restore uses. Comments are scoped to the current pageUrl.
      (async () => {
        try {
          const payload = msg.payload || {};
          const styleChanges = Array.isArray(payload.styleChanges) ? payload.styleChanges : [];
          const textChanges = Array.isArray(payload.textChanges) ? payload.textChanges : [];
          const domChanges = Array.isArray(payload.domChanges) ? payload.domChanges : [];
          const comments = Array.isArray(payload.comments) ? payload.comments : [];
          clearAllChanges();
          applyChangesPayload({ styleChanges, textChanges, domChanges });
          await replacePageComments(comments);
          const p = await getChangesPayload();
          sendResponse({ ok: true, ...p });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
      })();
      return true;
    }
    case 'EXPORT_PRESETS': { getCustomPresets().then(presets => sendResponse({ json: JSON.stringify(presets, null, 2) })); return true; }
    case 'IMPORT_PRESETS': {
      if (msg.json) {
        importPresets(msg.json).then(res => sendResponse({
          ok: !res.error,
          count: res.count,
          total: res.total,
          error: res.error,
        }));
        return true;
      }
      sendResponse({ ok: false, error: 'Empty file' });
      break;
    }

    case 'GET_MEDIA': {
      const sid = getSelectedElementId();
      if (!sid) { sendResponse({ media: null }); break; }
      const el = getElementById(sid);
      if (!el) { sendResponse({ media: null }); break; }
      const tag = el.tagName.toLowerCase();
      let media: any = null;
      if (tag === 'img') {
        const img = el as HTMLImageElement;
        media = { kind: 'image', src: img.src, alt: img.alt, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, filename: (img.src.split('/').pop() || 'image').split('?')[0] };
      } else if (tag === 'video') {
        const v = el as HTMLVideoElement;
        media = { kind: 'video', src: v.currentSrc || v.src, poster: v.poster, filename: ((v.currentSrc || v.src).split('/').pop() || 'video').split('?')[0] };
      } else if (tag === 'audio') {
        const a = el as HTMLAudioElement;
        media = { kind: 'audio', src: a.currentSrc || a.src, filename: ((a.currentSrc || a.src).split('/').pop() || 'audio').split('?')[0] };
      } else if (tag === 'svg') {
        const svgMarkup = el.outerHTML;
        const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        media = { kind: 'svg', src: url, markup: svgMarkup, filename: 'icon.svg', isObjectUrl: true };
      } else if (tag === 'source' || tag === 'picture') {
        const inner = el.querySelector('img, video, source');
        if (inner) {
          const src = (inner as any).src || (inner as any).srcset?.split(',')[0]?.trim().split(' ')[0] || '';
          if (src) media = { kind: 'image', src, filename: (src.split('/').pop() || 'image').split('?')[0] };
        }
      } else {
        // Check for background-image
        const bg = window.getComputedStyle(el).backgroundImage;
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (m && m[1]) media = { kind: 'background', src: m[1], filename: (m[1].split('/').pop() || 'background').split('?')[0] };
        // Check for nested SVG / IMG
        const innerSvg = el.querySelector('svg');
        const innerImg = el.querySelector('img');
        if (innerSvg && !media) {
          const svgMarkup = innerSvg.outerHTML;
          const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          media = { kind: 'svg', src: url, markup: svgMarkup, filename: 'icon.svg', isObjectUrl: true };
        } else if (innerImg && !media) {
          media = { kind: 'image', src: innerImg.src, alt: innerImg.alt, filename: (innerImg.src.split('/').pop() || 'image').split('?')[0] };
        }
      }
      sendResponse({ media });
      break;
    }

    case 'EXPORT': {
      const ch = getStyleChanges();
      let output = '';
      if (msg.format === 'css') output = exportCSS(ch);
      else if (msg.format === 'tailwind') output = exportTailwind(ch);
      else if (msg.format === 'scss') output = exportSCSS(ch);
      else if (msg.format === 'jsx') output = exportJSX(ch);
      else if (msg.format === 'github') { sendResponse({ body: generateGitHubIssueBody(ch, window.location.href, document.title) }); break; }
      else if (msg.format === 'markdown') { getPageComments().then(pc => sendResponse({ output: exportMarkdown(msg.level || 'standard', pc) })); return true; }
      else if (msg.format === 'enhanced-github') { sendResponse({ body: exportEnhancedGitHubIssue() }); break; }
      sendResponse({ output }); break;
    }

    case 'SCREENSHOT_ELEMENT': { const sid = getSelectedElementId(); if (sid) { captureElementScreenshot(sid).then(dataUrl => sendResponse({ dataUrl })); return true; } sendResponse({ dataUrl: null }); break; }
    case 'UPLOAD_IMAGE': { const sid = getSelectedElementId(); if (sid && msg.dataUrl) { const el = getElementById(sid); if (el?.tagName === 'IMG') (el as HTMLImageElement).src = msg.dataUrl; else if (el) { el.style.backgroundImage = `url(${msg.dataUrl})`; el.style.backgroundSize = 'cover'; } if (el) sendResponse({ info: { ...buildElementInfo(el), element: undefined } }); } sendResponse({ ok: true }); break; }

    // ── Source detection ──
    case 'GET_SOURCE_LOCATION': {
      const el = getElementById(msg.elementId || getSelectedElementId() || '');
      if (el) { const s = getSourceLocation(el); const h = getComponentHierarchy(el); sendResponse({ source: s, hierarchy: h }); }
      else sendResponse({ error: 'No element' });
      break;
    }
    case 'OPEN_IN_VSCODE': {
      if (msg.source) openInVSCode(msg.source);
      sendResponse({ ok: true }); break;
    }

    // ── Animation freeze (Alt+F) ──
    case 'TOGGLE_FREEZE': { toggleFreeze(); sendResponse({ frozen: isFrozen(), state: getAnimationState() }); break; }
    case 'GET_ANIMATION_STATE': { sendResponse({ state: getAnimationState() }); break; }

    // ── Multi-select ──
    case 'TOGGLE_MULTI_SELECT': {
      if (isMultiSelectActive()) disableMultiSelect();
      else enableMultiSelect();
      sendResponse({ active: isMultiSelectActive(), ids: getMultiSelectIds() });
      break;
    }
    case 'CLEAR_MULTI_SELECT': {
      clearMultiSelect();
      sendResponse({ active: isMultiSelectActive(), ids: [] });
      break;
    }
    case 'GET_MULTI_SELECT': {
      sendResponse({ active: isMultiSelectActive(), ids: getMultiSelectIds() });
      break;
    }

    // Briefly flash a transitioned property to a contrast value so the user
    // can see the transition they just configured. Reads transition-property
    // and transition-duration from the live computed style (which includes
    // our managed-stylesheet rule).
    case 'PREVIEW_TRANSITION_RULE': {
      const sid = getSelectedElementId();
      if (sid) {
        const el = getElementById(sid);
        if (el) {
          const cs = window.getComputedStyle(el);
          const propRaw = (cs.transitionProperty || 'all').split(',')[0].trim();
          const property = propRaw === 'all' || propRaw === '' ? 'opacity' : propRaw;
          const flash: Record<string, string> = {
            opacity: '0.25',
            transform: 'translateY(-12px)',
            'background-color': 'rgba(255, 200, 0, 0.65)',
            color: 'rgba(255, 100, 100, 1)',
            'border-color': 'rgba(255, 100, 100, 1)',
            'box-shadow': '0 0 0 4px rgba(59, 130, 246, 0.6)',
            width: 'calc(100% - 24px)',
            height: 'calc(100% - 24px)',
          };
          const flashVal = flash[property];
          if (flashVal !== undefined) {
            const durStr = (cs.transitionDuration || '0.3s').split(',')[0].trim();
            const durMs = durStr.endsWith('ms')
              ? parseFloat(durStr)
              : parseFloat(durStr) * 1000;
            const wait = Math.max(250, isNaN(durMs) ? 300 : durMs) + 80;
            (el.style as any)[property] = flashVal;
            setTimeout(() => { (el.style as any)[property] = ''; }, wait);
          }
        }
      }
      sendResponse({ ok: true });
      break;
    }

    // Re-trigger the animation on the selected element by toggling the
    // animation-name longhand to 'none', forcing reflow, then clearing the
    // inline override so the stylesheet rule's animation-name kicks back in.
    case 'PREVIEW_ANIMATION': {
      const sid = getSelectedElementId();
      if (sid) {
        const el = getElementById(sid);
        if (el) {
          // Toggle longhand animation-name only — preserves duration/timing/etc.
          // applied via the rule.
          el.style.animationName = 'none';
          // Reading offsetHeight forces a synchronous style recalc and reflow,
          // so the next change re-triggers the animation cleanly.
          void el.offsetHeight;
          el.style.animationName = '';
        }
      }
      sendResponse({ ok: true });
      break;
    }

    // ── Phase 5: Design/Layout ──
    case 'GET_COMPONENTS': { sendResponse({ components: getComponentsByCategory(msg.category) }); break; }
    case 'PLACE_COMPONENT': {
      if (msg.html && msg.parentId) { const id = placeComponent(msg.html, msg.parentId); sendResponse({ elementId: id }); }
      else sendResponse({ error: 'Missing html or parentId' }); break;
    }
    case 'SHOW_RESIZE_HANDLES': { const el = getElementById(msg.elementId || getSelectedElementId() || ''); if (el) showResizeHandles(el); sendResponse({ ok: true }); break; }
    case 'HIDE_RESIZE_HANDLES': { hideResizeHandles(); sendResponse({ ok: true }); break; }

    // ── Phase 6: Rearrange ──
    case 'GET_DESIGN_TOKENS': {
      sendResponse({ tokens: detectDesignTokens() });
      break;
    }

    case 'GET_PAGE_FONTS': {
      sendResponse({ fonts: detectPageFonts() });
      break;
    }

    // ── Keyboard shortcuts ──
    case 'GET_SHORTCUTS': { sendResponse({ shortcuts: getShortcuts() }); break; }

    case 'GET_COMPUTED_CSS': {
      const el = getElementById(msg.elementId || getSelectedElementId() || '');
      sendResponse({ css: el ? getComputedStylesBlock(el) : '' }); break;
    }

    case 'PREVIEW_ORIGINAL': {
      // Style rollback is one DOM op — flip the override stylesheet's
      // disabled bit. Everything else (text + DOM mutations) still needs
      // hand-rolling because they aren't stylesheet-based.
      setOverridesEnabled(false);

      const savedTexts: Array<{ elementId: string; currentText: string }> = [];
      const firstOldText = new Map<string, { elementId: string; oldText: string }>();
      for (const ch of getTextChanges()) {
        if (!firstOldText.has(ch.elementId)) firstOldText.set(ch.elementId, ch);
      }
      for (const [, ch] of firstOldText) {
        const el = getElementById(ch.elementId);
        if (el) {
          savedTexts.push({ elementId: ch.elementId, currentText: el.textContent || '' });
          el.textContent = ch.oldText;
        }
      }

      // For each DOM change, hide additions and re-insert deletions. The
      // `data-dm-preview-*` attributes are markers we strip during restore;
      // Clear All also strips them.
      for (const ch of getDomChanges()) {
        try {
          if (ch.action === 'duplicate' || ch.action === 'insert') {
            const el = (getElementById(ch.elementId) || document.querySelector(ch.selector)) as HTMLElement | null;
            if (el && el.style.display !== 'none') {
              el.dataset.dmPreviewPrevDisplay = el.style.display || '';
              el.style.display = 'none';
              el.setAttribute('data-dm-preview-hidden', '1');
            }
          } else if (ch.action === 'delete' && ch.outerHTML) {
            if (document.querySelector(ch.selector)) continue;
            const temp = document.createElement('div');
            temp.innerHTML = ch.outerHTML;
            const restored = temp.firstElementChild as HTMLElement | null;
            if (restored) {
              restored.setAttribute('data-dm-preview-restored', '1');
              (document.body || document.documentElement).appendChild(restored);
            }
          }
        } catch {}
      }

      try { hideCommentPins(); } catch {}
      (window as any).__dmPreviewSaved = { savedTexts };
      sendResponse({ ok: true }); break;
    }

    case 'RESTORE_CHANGES': {
      setOverridesEnabled(true);
      const saved = (window as any).__dmPreviewSaved as
        | { savedTexts: Array<{ elementId: string; currentText: string }> }
        | undefined;
      if (saved) {
        for (const t of saved.savedTexts || []) {
          const el = getElementById(t.elementId);
          if (el) el.textContent = t.currentText;
        }
        delete (window as any).__dmPreviewSaved;
      }
      // Restore display on the duplicates/inserts we hid; remove preview-only deletes.
      document.querySelectorAll<HTMLElement>('[data-dm-preview-hidden="1"]').forEach(el => {
        el.style.display = el.dataset.dmPreviewPrevDisplay || '';
        delete el.dataset.dmPreviewPrevDisplay;
        el.removeAttribute('data-dm-preview-hidden');
      });
      document.querySelectorAll('[data-dm-preview-restored="1"]').forEach(el => el.remove());
      try { showCommentPins(); } catch {}
      sendResponse({ ok: true }); break;
    }

    case 'BATCH_APPLY_CHANGE': {
      const change = getStyleChanges().find(c => c.id === msg.changeId);
      if (change) {
        try {
          const matchingEls = document.querySelectorAll(change.selector);
          for (const el of Array.from(matchingEls)) {
            const htmlEl = el as HTMLElement;
            const elId = getOrAssignId(htmlEl);
            if (elId !== change.elementId) {
              applyStyleChange(elId, change.property, change.newValue);
            }
          }
        } catch {}
      }
      getChangesPayload().then(p => sendResponse({ ok: true, ...p })); return true;
      break;
    }

    case 'TOGGLE_VISIBILITY': {
      const el = getElementById(msg.elementId);
      if (el) {
        // Three-way state on the element:
        //   1. We've previously injected `display: none` via Design Mode.
        //      → drop our rule; element returns to its author cascade.
        //   2. The element is hidden by something else (author / user CSS).
        //      → push our own `display: revert` so it falls back through the
        //      cascade to the user-agent default. Just clearing our rule
        //      wouldn't help — there isn't one yet.
        //   3. The element is visible right now.
        //      → inject `display: none` to hide it.
        const ours = getStyleChanges().find(c => c.elementId === msg.elementId && c.property === 'display');
        const computedHidden = window.getComputedStyle(el).display === 'none';
        undoStack.push({ kind: 'visibility', elementId: msg.elementId, wasHidden: computedHidden, oldDisplay: '' });
        redoStack.length = 0;
        if (ours && ours.newValue === 'none') {
          // Our own override is hiding it — pull our rule out cleanly.
          applyStyleChange(msg.elementId, 'display', '');
        } else if (computedHidden) {
          // Hidden by author/user CSS — `revert` resets our cascade level
          // back to the user-agent default (block / inline / etc.) which
          // is reliably visible regardless of what the page author wrote.
          applyStyleChange(msg.elementId, 'display', 'revert');
        } else {
          applyStyleChange(msg.elementId, 'display', 'none');
        }
      }
      getChangesPayload().then(p => sendResponse({ ok: true, ...p, undoCount: undoStack.length, redoCount: redoStack.length }));
      return true;
      break;
    }

    case 'REORDER_LAYER': {
      const source = getElementById(msg.sourceId);
      const target = getElementById(msg.targetId);
      if (source && target && source !== target && target.parentElement) {
        // Capture origin BEFORE the move so Clear All can put the element back.
        let origin: { parentSelector: string; index: number } | undefined;
        if (source.parentElement) {
          origin = {
            parentSelector: generateSelector(source.parentElement),
            index: Array.from(source.parentElement.children).indexOf(source),
          };
        }
        const parent = target.parentElement;
        const position: 'before' | 'after' = msg.position === 'after' ? 'after' : 'before';
        if (position === 'after') parent.insertBefore(source, target.nextSibling);
        else parent.insertBefore(source, target);
        const sourceSelector = generateSelector(source);
        const parentSelector = generateSelector(parent);
        const index = Array.from(parent.children).indexOf(source);
        recordDomChange(
          msg.sourceId, sourceSelector, 'move', source.tagName.toLowerCase(),
          undefined,
          { parentSelector, index },
          origin,
        );
      }
      getChangesPayload().then(p => sendResponse({ ok: true, ...p }));
      return true;
      break;
    }

    default: return false;
  }
  return true;
});

// Detect CSS design tokens from the page's stylesheets
function detectDesignTokens(): Array<{ name: string; value: string; category: 'color' | 'spacing' | 'font' | 'shadow' | 'other' }> {
  const tokens = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule && (rule.selectorText === ':root' || rule.selectorText === 'html')) {
          const style = rule.style;
          for (let i = 0; i < style.length; i++) {
            const name = style[i];
            if (name.startsWith('--')) tokens.set(name, style.getPropertyValue(name).trim());
          }
        }
      }
    } catch {}
  }
  return Array.from(tokens.entries()).map(([name, value]) => ({ name, value, category: categoriseToken(name, value) }));
}

// Build the list of fonts to surface in the Typography → Font dropdown.
// Two sources, deduped + sorted: every `font-family` declared in the page's
// own stylesheets, plus a curated set of web-safe / system fallbacks. The
// first family in each comma-separated stack is what the user picks; the
// `value` field keeps the full stack so applying it preserves fallbacks.
function detectPageFonts(): Array<{ value: string; label: string }> {
  const seen = new Map<string, string>(); // primary-family-lowercase → full stack
  const isSystemKeyword = (s: string) =>
    /^(inherit|initial|unset|revert|revert-layer)$/i.test(s.trim());
  const addStack = (raw: string) => {
    const stack = (raw || '').trim();
    if (!stack || isSystemKeyword(stack)) return;
    // Skip stacks that contain unresolved CSS variables — `var(--font-primary)`
    // shouldn't appear as a font choice in the dropdown.
    if (/var\(/i.test(stack)) return;
    const first = stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!first) return;
    // Skip primary-family values that look like CSS keywords or expressions.
    if (/^(var|calc|attr|env|--|inherit|initial|unset|revert)\b/i.test(first)) return;
    const key = first.toLowerCase();
    if (!seen.has(key)) seen.set(key, stack);
  };
  // Walk every accessible stylesheet rule for font-family declarations.
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) {
            const ff = rule.style.getPropertyValue('font-family');
            if (ff) addStack(ff);
          }
        }
      } catch {} // cross-origin sheet — skip
    }
  } catch {}
  // Curated fallbacks so the dropdown is always useful, even on a vanilla page.
  const fallbacks = [
    'system-ui, sans-serif',
    'Arial, Helvetica, sans-serif',
    'Helvetica, Arial, sans-serif',
    'Georgia, serif',
    'Times New Roman, Times, serif',
    'Courier New, Courier, monospace',
    'Verdana, Geneva, sans-serif',
    'Trebuchet MS, sans-serif',
    'Tahoma, Geneva, sans-serif',
    'Impact, Charcoal, sans-serif',
    'Comic Sans MS, cursive',
    'monospace',
    'serif',
    'sans-serif',
  ];
  for (const f of fallbacks) addStack(f);
  // Stable order: page-detected first (insertion order from the rules walk)
  // then fallbacks. `seen` already preserves insertion order.
  return Array.from(seen.entries()).map(([key, stack]) => {
    const primary = stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
    return { value: stack, label: primary };
  });
}

function categoriseToken(name: string, value: string): 'color' | 'spacing' | 'font' | 'shadow' | 'other' {
  const lname = name.toLowerCase();
  if (lname.includes('color') || lname.includes('bg') || lname.includes('text') || lname.includes('border') ||
    /^#[0-9a-f]{3,8}$/i.test(value) || value.startsWith('rgb') || value.startsWith('hsl')) return 'color';
  if (lname.includes('space') || lname.includes('gap') || lname.includes('padding') || lname.includes('margin') ||
    lname.includes('radius') || lname.includes('size') || /^\d+(\.\d+)?(px|rem|em)$/.test(value)) return 'spacing';
  if (lname.includes('font') || lname.includes('weight') || lname.includes('line-height') || lname.includes('letter')) return 'font';
  if (lname.includes('shadow')) return 'shadow';
  return 'other';
}

// Forward comment bubble clicks to sidepanel
window.addEventListener('dm-comment-clicked', (e: any) => {
  const detail = e.detail;
  if (detail && (detail.id || detail.commentId)) {
    notifyPanel('COMMENT_BUBBLE_CLICKED', { commentId: detail.id || detail.commentId });
  }
});

// Pin drag → persist offset, then notify the side panel so the Changes
// tab updates without a full re-fetch.
window.addEventListener('dm-comment-pin-dragged', (e: any) => {
  const detail = e.detail;
  if (!detail?.commentId || !detail?.offset) return;
  setCommentPinOffset(detail.commentId, detail.offset).then(() => {
    notifyPanel('CHANGES_UPDATE', {});
  });
});

// Debug surface for the test fixture and ad-hoc inspection from DevTools.
// Inspect what the extension thinks is applied without guessing.
(window as any).__dm = {
  dump: () => ({
    styleChanges: getStyleChanges(),
    textChanges: getTextChanges(),
    domChanges: getDomChanges(),
  }),
  applied: () => {
    const el = document.getElementById('dm-applied-styles');
    return el?.textContent ?? '';
  },
};

console.log('[Design Mode] Content script loaded (v0.3.0). All phases active.');
