// ============================================================
// Design Mode — Content Script (thin layer)
// Handles DOM inspection, overlays, editing. NO panel UI.
// Communicates with Side Panel via chrome.runtime messages.
// Phases 1-9 integrated + new: parent/child, undo/redo, dom tree, comments
// ============================================================

import { getElementById, getOrAssignId, generateSelector } from './helpers';
import { showHover, hideHover, showSelect, hideSelect, destroyOverlays } from './overlays';
import { enableInspect, disableInspect, isInspectActive, getSelectedElementId, setSelectedElementId, buildElementInfo, getComputedStylesBlock } from './inspector';
import type { ElementInfo } from './inspector';
import { getStyleChanges, getTextChanges, getDomChanges, clearAllChanges, applyStyleChange, applyTextChange, removeStyleChange, removeDomChange, removeTextChange, recordDomChange, connectToServer, disconnectFromServer, isConnected, getChangeReport, reorderChange, getAllChanges, replaySession } from './change-tracker';
import { cutElement, copyElement, pasteElement, duplicateElement, deleteElement, moveElement } from './html-editor';
import { captureElementScreenshot, downloadDataUrl } from './screenshots';
import { getCustomPresets, saveCustomPreset, deleteCustomPreset, updateCustomPreset, importPresets, getPageTokens } from './presets';
import { exportCSS, exportTailwind, exportSCSS, exportJSX, generateGitHubIssueBody, copyToClipboard } from './export';
import { highlightMatching, setSensitivity } from './multi-edit';
import { buildDomTree } from './dom-tree';
import { addComment, getPageComments, deleteComment, hideAllPins as hideCommentPins, showAllPins as showCommentPins } from './comments';
// Phase 1: Annotations
import {
  loadAnnotations, createAnnotation, updateAnnotation, deleteAnnotation,
  updateAnnotationStatus, addThreadMessage, updateThreadMessage,
  getPageAnnotations, showAllAnnotationPins, hideAllAnnotationPins,
  enableTextSelection, disableTextSelection,
  enableMultiSelect, disableMultiSelect, getMultiSelectIds,
  enableDrawing, disableDrawing, isDrawingMode, clearDrawing,
  getDrawingStrokes, getDrawingDataUrl, setDrawingColor, setDrawingWidth, undoLastStroke,
} from './annotations';
// Phase 2: Spatial
import { getSpatialContext, getAccessibilityInfo, getSmartName, getNearbyElementsContext, formatSpatialLines } from './spatial';
// Phase 3: Source detection
import { getSourceLocation, getComponentHierarchy, openInVSCode, formatSourceLocation } from './source-detection';
// Phase 4: Animation controls
import { freezeAnimations, unfreezeAnimations, isFrozen, toggleFreeze, getAnimationState, applySpring, applyEasing, previewTransition, springToCss, easingToCss } from './animation-controls';
// Phase 5: Design/Layout mode
import { COMPONENTS, getComponentsByCategory, startPlacement, placeComponent, showResizeHandles, hideResizeHandles, showSizeIndicator, hideSizeIndicator } from './design-mode';
// Phase 6: Rearrange
import { enableRearrange, disableRearrange, isRearrangeMode, detectSections, getDetectedSections, analyzeLayoutPatterns, addRearrangeNote, getRearrangeNotes } from './rearrange';
// Phase 7: Enhanced export
import { generateOutput, exportMarkdown, exportGitHubIssueBody as exportEnhancedGitHubIssue, captureElementSnapshot } from './enhanced-export';
// Phase 9: Keyboard shortcuts
import { enableShortcuts, disableShortcuts, registerShortcut, loadShortcuts, getShortcuts, formatShortcut } from './keyboard-shortcuts';

let on = false;
let mhc: (() => void) | null = null;

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
    drawing: isDrawingMode(),
    frozen: isFrozen(),
    rearranging: isRearrangeMode(),
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
    extra.smartName = getSmartName(el);
    extra.spatialContext = getSpatialContext(el);
    extra.accessibilityInfo = getAccessibilityInfo(el);
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

function enable() {
  if (on) return;
  on = true;
  connectToServer();
  enableInspect((i: ElementInfo) => onElementSelected(i));
  loadAnnotations().then(() => showAllAnnotationPins());
  loadShortcuts().then(() => {
    enableShortcuts();
    registerAllShortcuts();
  });
  enableTextSelection((text, elementId, rect) => {
    notifyPanel('TEXT_SELECTED', { payload: { text, elementId, rect } });
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
  disableInspect();
  destroyOverlays();
  disconnectFromServer();
  hideAllAnnotationPins();
  disableTextSelection();
  disableMultiSelect();
  disableDrawing();
  disableShortcuts();
  if (isRearrangeMode()) disableRearrange();
  if (isFrozen()) unfreezeAnimations();
  if (mhc) { mhc(); mhc = null; }
  setSelectedElementId(null);
}

function registerAllShortcuts() {
  registerShortcut('toggle-inspect', () => {
    if (isInspectActive()) disableInspect();
    else enableInspect((i: ElementInfo) => onElementSelected(i));
    notifyPanel('STATE_UPDATE', getFullState());
  });
  registerShortcut('add-annotation', () => {
    const sid = getSelectedElementId();
    if (sid) notifyPanel('PROMPT_ANNOTATION', { elementId: sid });
  });
  registerShortcut('toggle-drawing', () => {
    if (isDrawingMode()) disableDrawing(); else enableDrawing();
    notifyPanel('STATE_UPDATE', getFullState());
  });
  registerShortcut('freeze-animations', () => {
    toggleFreeze();
    notifyPanel('STATE_UPDATE', getFullState());
    notifyPanel('ANIMATION_STATE', { payload: getAnimationState() });
  });
  registerShortcut('toggle-rearrange', () => {
    if (isRearrangeMode()) {
      disableRearrange();
    } else {
      const sections = enableRearrange();
      notifyPanel('SECTIONS_DETECTED', { payload: sections });
    }
    notifyPanel('STATE_UPDATE', getFullState());
  });
  registerShortcut('deselect', () => {
    if (isDrawingMode()) disableDrawing();
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
    case 'GET_CHANGES': { getChangesPayload().then(p => sendResponse(p)); return true; }

    // New: DOM tree for Layers panel
    case 'GET_DOM_TREE': {
      const tree = buildDomTree();
      sendResponse({ tree });
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

    // New: Select specific element by ID (from Layers panel) — falls back to
    // the saved selector for changes from a previous session whose dm-id no
    // longer exists in the current DOM (the selector-based stylesheet still
    // applies, but the element-id lookup misses).
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
          if (el) el.textContent = textChange.oldText;
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

    case 'APPLY_STYLE': {
      const sid = getSelectedElementId();
      if (sid && msg.property) {
        const el = getElementById(sid);
        if (el) {
          const kebab = msg.property.replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase());
          const beforeValue = window.getComputedStyle(el).getPropertyValue(kebab);
          const change = applyStyleChange(sid, msg.property, msg.value, () => {
            const el2 = getElementById(sid);
            if (el2) onElementSelected(buildElementInfo(el2));
          });
          const afterValue = window.getComputedStyle(el).getPropertyValue(kebab);
          if (afterValue !== beforeValue) {
            undoStack.push({ kind: 'style', elementId: sid, property: msg.property, oldValue: beforeValue, newValue: msg.value, changeId: change?.id });
            redoStack.length = 0;
          }
        }
        const updatedEl = getElementById(sid);
        const updatedInfo = updatedEl ? buildElementInfo(updatedEl) : null;
        getChangesPayload().then(p => sendResponse({
          info: updatedInfo ? { ...updatedInfo, element: undefined, imgSrc: updatedEl?.tagName === 'IMG' ? (updatedEl as HTMLImageElement).src : undefined } : null,
          ...p,
          undoCount: undoStack.length,
          redoCount: redoStack.length,
        }));
        return true;
      } else sendResponse({ error: 'No element selected' });
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
      // Drop preview state if active
      if ((window as any).__dmPreviewSaved) delete (window as any).__dmPreviewSaved;

      // Style changes are reverted by clearAllChanges() below — it drops the
      // override stylesheet, and computed styles return to their natural values.

      // Revert text changes — first oldText per element
      const firstTextOld = new Map<string, { elementId: string; oldText: string }>();
      for (const ch of getTextChanges()) {
        if (!firstTextOld.has(ch.elementId)) firstTextOld.set(ch.elementId, ch);
      }
      for (const [, ch] of firstTextOld) {
        const el = getElementById(ch.elementId);
        if (el) el.textContent = ch.oldText;
      }

      // For each DOM change: remove duplicates/inserts, restore deletes
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

      // Clean leftover preview markers
      document.querySelectorAll('[data-dm-preview-restored="1"]').forEach(el => el.remove());
      document.querySelectorAll('[data-dm-preview-hidden="1"]').forEach(el => {
        (el as HTMLElement).style.display = '';
        el.removeAttribute('data-dm-preview-hidden');
      });

      // Delete all comments for this page so the Changes tab is truly empty
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
    case 'SET_SENSITIVITY': if (typeof msg.value === 'number') setSensitivity(msg.value); sendResponse({ ok: true }); break;

    case 'HIGHLIGHT_MATCHING': {
      const sid = getSelectedElementId();
      if (mhc) { mhc(); mhc = null; }
      else if (sid) { mhc = highlightMatching(sid); setTimeout(() => { if (mhc) { mhc(); mhc = null; } }, 3000); }
      sendResponse({ ok: true }); break;
    }

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
    case 'SAVE_PRESET': { const sid = getSelectedElementId(); if (sid && msg.name) { saveCustomPreset(msg.name, sid).then(() => sendResponse({ ok: true })); return true; } sendResponse({ error: 'No element selected' }); break; }
    case 'DELETE_PRESET': if (msg.presetId) { deleteCustomPreset(msg.presetId).then(() => sendResponse({ ok: true })); return true; } sendResponse({ ok: true }); break;
    case 'UPDATE_PRESET': { if (msg.presetId && msg.name && msg.styles) { updateCustomPreset(msg.presetId, msg.name, msg.styles).then(() => sendResponse({ ok: true })); return true; } sendResponse({ ok: false }); break; }
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
    case 'EXPORT_PRESETS': { getCustomPresets().then(presets => sendResponse({ json: JSON.stringify(presets, null, 2) })); return true; }
    case 'IMPORT_PRESETS': { if (msg.json) { importPresets(msg.json).then(count => sendResponse({ ok: true, count })); return true; } sendResponse({ ok: false }); break; }

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

    // ── Phase 1: Annotations ──
    case 'CREATE_ANNOTATION': {
      createAnnotation(msg.payload).then(ann => {
        sendResponse({ annotation: ann });
        notifyPanel('ANNOTATION_CREATED', { payload: ann });
      });
      return true;
    }
    case 'UPDATE_ANNOTATION': { updateAnnotation(msg.id, msg.updates).then(ann => sendResponse({ annotation: ann })); return true; }
    case 'DELETE_ANNOTATION': { deleteAnnotation(msg.id).then(ok => sendResponse({ ok })); return true; }
    case 'UPDATE_ANNOTATION_STATUS': { updateAnnotationStatus(msg.id, msg.status).then(ann => sendResponse({ annotation: ann })); return true; }
    case 'ADD_THREAD_MESSAGE': { addThreadMessage(msg.annotationId, msg.text, msg.authorType).then(m => sendResponse({ message: m })); return true; }
    case 'UPDATE_THREAD_MESSAGE': { updateThreadMessage(msg.annotationId, msg.messageId, msg.text).then(ok => sendResponse({ ok })); return true; }
    case 'GET_ANNOTATIONS': { sendResponse({ annotations: getPageAnnotations() }); break; }
    case 'TOGGLE_MULTI_SELECT': {
      if (getMultiSelectIds().length > 0) { disableMultiSelect(); sendResponse({ active: false, ids: [] }); }
      else { enableMultiSelect(); sendResponse({ active: true, ids: [] }); }
      break;
    }
    case 'GET_MULTI_SELECT': { sendResponse({ ids: getMultiSelectIds() }); break; }
    case 'TOGGLE_DRAWING': {
      if (isDrawingMode()) { disableDrawing(); } else { enableDrawing(); }
      sendResponse({ drawing: isDrawingMode() }); break;
    }
    case 'SET_DRAWING_COLOR': { setDrawingColor(msg.color); sendResponse({ ok: true }); break; }
    case 'SET_DRAWING_WIDTH': { setDrawingWidth(msg.width); sendResponse({ ok: true }); break; }
    case 'UNDO_DRAWING': { undoLastStroke(); sendResponse({ ok: true }); break; }
    case 'CLEAR_DRAWING': { clearDrawing(); sendResponse({ ok: true }); break; }
    case 'GET_DRAWING': { sendResponse({ strokes: getDrawingStrokes(), dataUrl: getDrawingDataUrl() }); break; }

    // ── Phase 2: Spatial ──
    case 'GET_SPATIAL_CONTEXT': {
      const el = getElementById(msg.elementId || getSelectedElementId() || '');
      if (el) sendResponse({ context: getSpatialContext(el), accessibility: getAccessibilityInfo(el), smartName: getSmartName(el), nearby: getNearbyElementsContext(el) });
      else sendResponse({ error: 'No element' });
      break;
    }

    // ── Phase 3: Source detection ──
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

    // ── Phase 4: Animation ──
    case 'TOGGLE_FREEZE': { toggleFreeze(); sendResponse({ frozen: isFrozen(), state: getAnimationState() }); break; }
    case 'GET_ANIMATION_STATE': { sendResponse({ state: getAnimationState() }); break; }
    case 'APPLY_SPRING': { if (msg.elementId && msg.config) applySpring(msg.elementId, msg.config, msg.property); sendResponse({ ok: true, css: msg.config ? springToCss(msg.config) : '' }); break; }
    case 'APPLY_EASING': { if (msg.elementId && msg.config) applyEasing(msg.elementId, msg.config); sendResponse({ ok: true, css: msg.config ? easingToCss(msg.config) : '' }); break; }
    case 'PREVIEW_TRANSITION': { if (msg.elementId) previewTransition(msg.elementId, msg.property, msg.from, msg.to, msg.duration, msg.easing); sendResponse({ ok: true }); break; }

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

    case 'TOGGLE_REARRANGE': {
      if (isRearrangeMode()) { disableRearrange(); sendResponse({ active: false, sections: [] }); }
      else { const sections = enableRearrange(); sendResponse({ active: true, sections }); }
      break;
    }
    case 'GET_SECTIONS': { sendResponse({ sections: getDetectedSections() }); break; }
    case 'ANALYZE_LAYOUT': { sendResponse({ analysis: analyzeLayoutPatterns() }); break; }

    // ── Phase 7: Enhanced export ──
    case 'GENERATE_OUTPUT': { sendResponse({ output: generateOutput(msg.level || 'standard') }); break; }
    case 'EXPORT_MARKDOWN': { sendResponse({ markdown: exportMarkdown(msg.level || 'standard') }); break; }
    case 'CAPTURE_SNAPSHOT': { const snap = captureElementSnapshot(msg.elementId || getSelectedElementId() || '', msg.level); sendResponse({ snapshot: snap }); break; }

    // ── Phase 9: Shortcuts ──
    case 'GET_SHORTCUTS': { sendResponse({ shortcuts: getShortcuts() }); break; }

    case 'GET_COMPUTED_CSS': {
      const el = getElementById(msg.elementId || getSelectedElementId() || '');
      sendResponse({ css: el ? getComputedStylesBlock(el) : '' }); break;
    }

    case 'PREVIEW_ORIGINAL': {
      const savedStyles: Record<string, string> = {};
      const savedTexts: Array<{ elementId: string; currentText: string }> = [];
      const hiddenAdditions: Array<{ elementId: string; selector: string; previousDisplay: string }> = [];

      // Revert style changes — keep only the FIRST oldValue per (element, prop)
      const firstOld = new Map<string, { elementId: string; property: string; oldValue: string }>();
      for (const ch of getStyleChanges()) {
        const key = ch.elementId + '|' + ch.property;
        if (!firstOld.has(key)) firstOld.set(key, ch);
      }
      for (const [key, ch] of firstOld) {
        const el = getElementById(ch.elementId);
        if (el) {
          savedStyles[key] = (el.style as any)[ch.property] || '';
          (el.style as any)[ch.property] = ch.oldValue;
        }
      }

      // Revert text changes — store current text, restore the FIRST oldText per element
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

      // For each DOM change, hide additions and re-insert deletions
      for (const ch of getDomChanges()) {
        try {
          if (ch.action === 'duplicate' || ch.action === 'insert') {
            // Hide the duplicated/inserted element so the original page is shown
            const el = (getElementById(ch.elementId) || document.querySelector(ch.selector)) as HTMLElement | null;
            if (el && el.style.display !== 'none') {
              hiddenAdditions.push({ elementId: ch.elementId, selector: ch.selector, previousDisplay: el.style.display || '' });
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

      // Hide comment pins so the page looks pristine
      try { hideCommentPins(); } catch {}

      (window as any).__dmPreviewSaved = { savedStyles, savedTexts, hiddenAdditions };
      sendResponse({ ok: true }); break;
    }

    case 'RESTORE_CHANGES': {
      const saved = (window as any).__dmPreviewSaved as
        | { savedStyles: Record<string, string>; savedTexts: Array<{ elementId: string; currentText: string }>; hiddenAdditions: Array<{ elementId: string; selector: string; previousDisplay: string }> }
        | undefined;
      if (saved) {
        // Re-apply current styles
        for (const key of Object.keys(saved.savedStyles || {})) {
          const sep = key.indexOf('|');
          const elementId = key.slice(0, sep);
          const property = key.slice(sep + 1);
          const el = getElementById(elementId);
          if (el) (el.style as any)[property] = saved.savedStyles[key];
        }
        // Re-apply current text
        for (const t of saved.savedTexts || []) {
          const el = getElementById(t.elementId);
          if (el) el.textContent = t.currentText;
        }
        // Restore display on hidden duplications/insertions
        for (const h of saved.hiddenAdditions || []) {
          const el = (getElementById(h.elementId) || document.querySelector(h.selector)) as HTMLElement | null;
          if (el) {
            el.style.display = h.previousDisplay;
            el.removeAttribute('data-dm-preview-hidden');
          }
        }
        // Remove any preview-restored deleted elements
        document.querySelectorAll('[data-dm-preview-restored="1"]').forEach(el => el.remove());
        delete (window as any).__dmPreviewSaved;
      }
      // Bring comment pins back
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
        const computedDisplay = window.getComputedStyle(el).display;
        const isHidden = el.style.display === 'none' || computedDisplay === 'none';
        const oldDisplay = el.style.display;
        undoStack.push({ kind: 'visibility', elementId: msg.elementId, wasHidden: isHidden, oldDisplay });
        redoStack.length = 0;
        if (isHidden) {
          el.style.display = '';
          el.style.visibility = '';
          applyStyleChange(msg.elementId, 'display', el.style.display || '');
        } else {
          el.style.display = 'none';
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
        const sel = generateSelector(source);
        target.parentElement.insertBefore(source, target);
        recordDomChange(msg.sourceId, sel, 'move', source.tagName.toLowerCase());
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
