// ============================================================
// Design Mode — Content Script (thin layer)
// Handles DOM inspection, overlays, editing. NO panel UI.
// Communicates with Side Panel via chrome.runtime messages.
// Phases 1-9 integrated + new: parent/child, undo/redo, dom tree, comments
// ============================================================

import { getElementById, getOrAssignId, generateSelector, reserveIdsAtLeast } from './helpers';
import { setLayoutGuides as setLayoutGuidesOverlay, clearAllLayoutGuides, getLayoutGuidesFor } from './layout-guides';
import { showHover, hideHover, showSelect, hideSelect, destroyOverlays, resetOverlayTeardown } from './overlays';
import { enableInspect, disableInspect, isInspectActive, getSelectedElementId, setSelectedElementId, buildElementInfo, getComputedStylesBlock } from './inspector';
import type { ElementInfo } from './inspector';
import { initCustomCursor, applyBaseCursor, clearBaseCursor } from './custom-cursor';
import { getStyleChanges, getTextChanges, getDomChanges, clearAllChanges, applyStyleChange, applyWithCompanions, applyTextChange, applyHtmlChange, removeStyleChange, removeDomChange, removeTextChange, recordDomChange, connectToServer, disconnectFromServer, isConnected, isAgentConnected, getChangeReport, reorderChange, getAllChanges, replaySession, setOverridesEnabled, applyChangesPayload, setUnhandledMessageHandler, sendRelayResponse, setChangesStatus, syncCommentChange, syncCommentDeleted, stageAgentHandoff } from './change-tracker';
import { cutElement, copyElement, pasteElement, duplicateElement, deleteElement, moveElement } from './html-editor';
import { captureElementScreenshot, captureViewportScreenshotClean, downloadDataUrl } from './screenshots';
import {
  getPageTokens, detectScales, annotateDrift, findTokenUsages,
  getCustomPresets, saveCustomPreset, deleteCustomPreset,
  type PresetKind,
} from './presets';
import { captureOriginalIfNew, clearRootVarEdit, clearAllRootVarEdits, getRootVarEdits } from './root-var-store';
import { exportCSS, exportTailwind, exportSCSS, exportJSX, generateGitHubIssueBody, copyToClipboard } from './export';
import { buildDomTree } from './dom-tree';
import { addComment, addRegionComment, getPageComments, deleteComment, hideAllPins as hideCommentPins, showAllPins as showCommentPins, setCommentResolved, setCommentPinOffset, replacePageComments } from './comments';
import { startRegionDraw, cancelRegionDraw, clearPendingRegionBox, type Region } from './region-annotate';
// Source detection — kept; surfaced in the prompt + Design tab
import { getSourceLocation, getComponentHierarchy, openInVSCode } from './source-detection';
// Animation controls — kept (freeze/preview helpers)
import { isFrozen, toggleFreeze, unfreezeAnimations, getAnimationState } from './animation-controls';
// Multi-select — toggle mode, fan-out style edits to N elements at once
import {
  isMultiSelectActive, enableMultiSelect, disableMultiSelect,
  getSelectedIds as getMultiSelectIds, clearSelection as clearMultiSelect,
  setSelectedIds as setMultiSelectIds,
  refreshOverlays as refreshMultiSelectOverlays,
  toggleSelection as toggleMultiSelectMember,
  findSimilarElements,
} from './multi-select';
// Section rearrange — detect top-level sections, reorder with recorded moves
import { detectSections, reorderSection } from './section-rearrange';
// Design/Layout mode — component palette + wireframe placement
import { getComponentsByCategory, placeComponent } from './design-mode';
// Measurement guides — axis lines, distance pills, resize handles
import { setResizeCommitHandler, setResizePreviewHandler, setMoveCommitHandler, setMovePreviewHandler, teardownMeasureGuides, resetMeasureTeardown, showResizeDots, repositionResizeDots } from './measure-guides';
// Enhanced export — markdown for Copy Prompt
import { exportMarkdown, exportGitHubIssueBody as exportEnhancedGitHubIssue } from './enhanced-export';
// Keyboard shortcuts
import { enableShortcuts, disableShortcuts, registerShortcut, loadShortcuts, getShortcuts } from './keyboard-shortcuts';

let on = false;
// Lets the cursor module repaint correctly on a live settings toggle
// without importing the inspector (which imports the cursor module).
initCustomCursor(isInspectActive);
// Region pending a comment — set when the user finishes drawing a freeform
// rectangle, consumed by ADD_REGION_COMMENT once they type the note.
let pendingRegion: Region | null = null;
// True for Design Mode's own injected pins/boxes so a region's centre-point
// hit-test resolves the underlying page element, not our overlay.
function isOverlayLike(el: HTMLElement): boolean {
  return !!el.closest('.dm-comment-pin,.dm-comment-region');
}
// Enter region draw mode; on release stash the region and tell the panel to
// open its comment composer (shared by the SP message and the shortcut).
function beginRegionDraw() {
  clearPendingRegionBox(); // drop any leftover box from a prior, uncommitted draw
  startRegionDraw((region) => {
    if (region) { pendingRegion = region; notifyPanel('REGION_DRAWN', {}); }
    else { pendingRegion = null; notifyPanel('REGION_CANCELLED', {}); }
  });
}
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

// Corner-dot resize commits its final width/height through the change-tracker
// (so it lands in the Changes tab and exports), pushes an undo entry per
// dimension, and refreshes the panel — same path the side panel's APPLY_STYLE
// would take, just initiated from the page.
setResizeCommitHandler((id, width, height) => {
  const el = getElementById(id);
  if (!el) return;
  const meta = { groupId: `resize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, groupLabel: 'Resize' };
  const cs = window.getComputedStyle(el);
  const beforeW = cs.width, beforeH = cs.height;
  if (width) applyWithCompanions(id, 'width', width, undefined, meta);
  const change = height ? applyWithCompanions(id, 'height', height, undefined, meta) : null;
  if (width) undoStack.push({ kind: 'style', elementId: id, property: 'width', oldValue: beforeW, newValue: width });
  if (height) undoStack.push({ kind: 'style', elementId: id, property: 'height', oldValue: beforeH, newValue: height, changeId: change?.id });
  redoStack.length = 0;
  const updated = getElementById(id);
  if (updated) onElementSelected(buildElementInfo(updated));
  getChangesPayload().then(p => notifyPanel('CHANGES_UPDATE', p));
});

// Live (uncommitted) dimensions while a resize handle is dragged — the panel
// patches just its W/H fields so they tick along without a full reselect.
setResizePreviewHandler((id, width, height) => {
  notifyPanel('LIVE_RESIZE', { elementId: id, width, height });
});

// Body-drag commit: final left/top per element (and `position: relative` on
// any element that was promoted from `static`) lands here on mouseup. All
// entries share one groupId so the multi-select drag is one undo step in
// the Changes tab.
setMoveCommitHandler((entries) => {
  if (!entries.length) return;
  const meta = { groupId: `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, groupLabel: 'Move' };
  for (const entry of entries) {
    const el = getElementById(entry.id);
    if (!el) continue;
    const cs = window.getComputedStyle(el);
    const beforeLeft = cs.left, beforeTop = cs.top, beforePos = cs.position;
    if (entry.promotedPosition) {
      applyWithCompanions(entry.id, 'position', entry.promotedPosition, undefined, meta);
      undoStack.push({ kind: 'style', elementId: entry.id, property: 'position', oldValue: beforePos, newValue: entry.promotedPosition });
    }
    if (entry.left) {
      applyWithCompanions(entry.id, 'left', entry.left, undefined, meta);
      undoStack.push({ kind: 'style', elementId: entry.id, property: 'left', oldValue: beforeLeft, newValue: entry.left });
    }
    if (entry.top) {
      const change = applyWithCompanions(entry.id, 'top', entry.top, undefined, meta);
      undoStack.push({ kind: 'style', elementId: entry.id, property: 'top', oldValue: beforeTop, newValue: entry.top, changeId: change?.id });
    }
  }
  redoStack.length = 0;
  const focusId = getSelectedElementId();
  const focusEl = focusId ? getElementById(focusId) : null;
  if (focusEl) onElementSelected(buildElementInfo(focusEl));
  getChangesPayload().then(p => notifyPanel('CHANGES_UPDATE', p));
});

// Live (uncommitted) position while a body drag is in flight — the panel
// patches its X/Y fields (and Position select if the static-promotion just
// landed) so they tick along without a full reselect.
setMovePreviewHandler((id, left, top, promotedPosition) => {
  notifyPanel('LIVE_MOVE', { elementId: id, left, top, position: promotedPosition });
});

/* —— Helpers —— */

function getFullState() {
  return {
    enabled: on,
    connected: isConnected(),
    agentConnected: isAgentConnected(),
    inspecting: isInspectActive(),
    frozen: isFrozen(),
    multiSelect: isMultiSelectActive(),
    multiSelectIds: getMultiSelectIds(),
    undoCount: undoStack.length,
    redoCount: redoStack.length,
  };
}

// Walks every tracked change and reverts it on the live DOM, returning
// the page to its pre-Design-Mode state — short of an actual reload.
// Both Clear All and Import call this before clearing arrays / applying
// a fresh payload, so a fresh import always starts from a clean slate.
//
// Importantly: this only mutates the page. It does NOT touch the
// in-memory change arrays or the override stylesheet — the caller is
// expected to follow up with `clearAllChanges()` (which empties both).
function revertAllPageMutations() {
  // 1. Text changes: restore each tracked element's earliest oldText so
  //    multiple overlapping edits collapse to the original.
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

  // 2. DOM changes pass A: remove duplicates / inserts (we created
  //    them, we kill them).
  const moves = getDomChanges().filter(ch => ch.action === 'move' && ch.origin);
  for (const ch of getDomChanges()) {
    try {
      if (ch.action === 'duplicate' || ch.action === 'insert') {
        const el = getElementById(ch.elementId) || document.querySelector(ch.selector);
        if (el) el.remove();
      }
    } catch {}
  }

  // 3. DOM changes pass B: belt-and-braces. Force-remove any element
  //    bearing a data-dm-id that maps to a duplicate / insert change.
  //    Catches stragglers when getElementById returned a stale node from
  //    elementMap or the saved selector drifted (the duplicate moved
  //    after creation, so its position-based selector no longer matches
  //    the current location). Without this sweep, the bug surfaces as
  //    "Clear All didn't actually clear the duplicate."
  for (const ch of getDomChanges()) {
    if (ch.action !== 'duplicate' && ch.action !== 'insert') continue;
    document.querySelectorAll(`[data-dm-id="${ch.elementId}"]`).forEach(el => el.remove());
    // Class-based fallback — duplicates / pastes carry a `dm-clone-<id>`
    // marker class that survives even when the page (e.g. a React app)
    // strips the data-dm-id attribute on its next render.
    document.querySelectorAll(`.dm-clone-${ch.elementId}`).forEach(el => el.remove());
  }
  // Final cleanup: any orphan `.dm-clone` element on the page whose
  // owning change is gone too. Belt-and-braces × 2.
  document.querySelectorAll('.dm-clone').forEach(el => el.remove());

  // 4. DOM changes pass C: restore deletes in REVERSE chronological
  //    order. Reverse so that when the user deletes B then C from
  //    [A, B, C, D], the indices recorded at delete-time (B: 1, C: 1
  //    after B is gone) un-stack correctly: restoring C first puts
  //    [A, C, D], then restoring B puts [A, B, C, D].
  //
  //    Detection of "still in DOM" uses data-dm-id rather than the
  //    saved position-based selector. The old code checked the
  //    selector — but `body > div:nth-of-type(2)` matches WHATEVER
  //    sits at position 2, including a sibling that slid into the
  //    deleted element's place. The check then skipped the restore
  //    and the user saw "Clear All did nothing." data-dm-id is
  //    unique-per-element, so it actually answers the question.
  const deletes = getDomChanges().filter(ch => ch.action === 'delete' && ch.outerHTML);
  for (let i = deletes.length - 1; i >= 0; i--) {
    const ch = deletes[i];
    try {
      const stillThere = document.querySelector(`[data-dm-id="${ch.elementId}"]`);
      if (stillThere) continue;
      const temp = document.createElement('div');
      temp.innerHTML = ch.outerHTML!;
      const restored = temp.firstElementChild as HTMLElement | null;
      if (!restored) continue;
      // Restore at origin if we recorded it. Prefer parentId (data-dm-id
      // of the parent at record time) over parentSelector — selectors
      // with nth-of-type are fragile across reorders. Fall back to body
      // so the element doesn't vanish entirely on legacy entries.
      if (ch.origin) {
        let parent: HTMLElement | null = null;
        if ((ch.origin as any).parentId) {
          parent = document.querySelector(`[data-dm-id="${(ch.origin as any).parentId}"]`) as HTMLElement | null;
        }
        if (!parent) parent = document.querySelector(ch.origin.parentSelector) as HTMLElement | null;
        if (parent) {
          const idx = Math.min(ch.origin.index, parent.children.length);
          const before = parent.children[idx];
          if (before) parent.insertBefore(restored, before);
          else parent.appendChild(restored);
          continue;
        }
      }
      (document.body || document.documentElement).appendChild(restored);
    } catch {}
  }

  // 5. DOM changes pass D: relocate moved elements back to their origin.
  //    Skip when the source isn't currently attached — the duplicate-
  //    revert pass above might have just removed it, and getElementById
  //    would otherwise return the detached node from elementMap.
  for (const ch of moves) {
    try {
      const source = getElementById(ch.elementId) ||
        (ch.selector ? document.querySelector(ch.selector) : null) as HTMLElement | null;
      if (!source || !document.contains(source)) continue;
      // Prefer parentId for the same reason as the replay path —
      // selectors drift, data-dm-id is stable.
      let originParent: HTMLElement | null = null;
      if (ch.origin && (ch.origin as any).parentId) {
        originParent = document.querySelector(`[data-dm-id="${(ch.origin as any).parentId}"]`) as HTMLElement | null;
      }
      if (!originParent && ch.origin) {
        originParent = document.querySelector(ch.origin.parentSelector) as HTMLElement | null;
      }
      if (originParent && source !== originParent) {
        const idx = Math.min(ch.origin!.index, originParent.children.length);
        const before = originParent.children[idx];
        if (before && before !== source) originParent.insertBefore(source, before);
        else if (!before) originParent.appendChild(source);
      }
    } catch {}
  }

  // 6. Strip any stray inline styles older code paths might have written
  //    on tracked elements. Only touches elements that participated in
  //    some change — page-author inline styles are left alone.
  const touchedIds = new Set<string>();
  for (const c of getStyleChanges()) touchedIds.add(c.elementId);
  for (const c of getTextChanges()) touchedIds.add(c.elementId);
  for (const c of getDomChanges()) touchedIds.add(c.elementId);
  for (const id of touchedIds) {
    const el = getElementById(id);
    if (!el) continue;
    if (el.style.display === 'none' || el.style.display === '') el.style.removeProperty('display');
    el.style.removeProperty('animation');
    el.style.removeProperty('animation-name');
  }

  // 7. Clean leftover preview markers from any in-flight View Original.
  document.querySelectorAll('[data-dm-preview-restored="1"]').forEach(el => el.remove());
  document.querySelectorAll<HTMLElement>('[data-dm-preview-hidden="1"]').forEach(el => {
    el.style.display = el.dataset.dmPreviewPrevDisplay || '';
    delete el.dataset.dmPreviewPrevDisplay;
    el.removeAttribute('data-dm-preview-hidden');
  });
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
    tokenChanges: getRootVarEdits(),
  };
}

// Look up the transferred size of a resource via the Performance API.
// Returns undefined when the entry is missing (resource not navigated
// through the network — e.g. inline data:, cross-origin opaque) or when
// transferSize is 0 (cache hit on a CORS-opaque response). encodedBodySize
// is the on-the-wire compressed bytes; falling back to decodedBodySize
// approximates the uncompressed size when both are zero.
function resolveResourceBytes(src: string): number | undefined {
  try {
    const url = new URL(src, location.href).href;
    const entries = performance.getEntriesByName(url) as PerformanceResourceTiming[];
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.transferSize) return e.transferSize;
      if (e.encodedBodySize) return e.encodedBodySize;
      if (e.decodedBodySize) return e.decodedBodySize;
    }
  } catch {}
  return undefined;
}

// This content script's own tab id, fetched once from the background. Used to
// stamp panel broadcasts so each panel surface (side panel / floating window)
// only reacts to the tab it's bound to — otherwise a panel for tab B would
// pick up tab A's ELEMENT_SELECTED etc.
let selfTabId: number | null = null;
function refreshSelfTabId() {
  if (!chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, (r) => { selfTabId = r?.tabId ?? null; });
  } catch {}
}

function notifyPanel(type: string, payload?: any) {
  // chrome.runtime.id goes undefined the moment the extension is reloaded
  // / disabled / removed while a content script is still alive on a page.
  // Calling sendMessage at that point throws "Extension context
  // invalidated". Guard so the orphan content script just no-ops.
  if (!chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({ type, ...payload, _dmTab: selfTabId });
  } catch {}
}

function selectAndNotify(el: HTMLElement) {
  const info = buildElementInfo(el);
  setSelectedElementId(info.id);
  showSelect(el);
  showResizeDots(el);
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
      layoutGuides: getLayoutGuidesFor(info.id),
    },
  });
}

/* —— Enable / Disable —— */

// Single clear path for the panel's Clear All and the agent's clear_changes
// (both transports). Reverts every page mutation, deletes comment pins,
// clears the trackers, and resets the undo stacks.
async function performFullClear() {
  // Make sure the override stylesheet is enabled before we clear it,
  // otherwise the page would still be showing `disabled` overrides.
  setOverridesEnabled(true);
  if ((window as any).__dmPreviewSaved) delete (window as any).__dmPreviewSaved;

  // Page DOM revert — text / DOM mutations / inline-style sweep /
  // preview markers — runs synchronously so the state-flip is immediate.
  revertAllPageMutations();

  // Comments live in chrome.storage.local (separate from the change
  // arrays), so they need their own async cleanup.
  const pageComments = await getPageComments();
  for (const c of pageComments) await deleteComment(c.id);
  clearAllChanges();
  clearAllRootVarEdits();
  clearAllLayoutGuides();
  undoStack.length = 0;
  redoStack.length = 0;
}

// Cloud-tools dispatcher. Mirrors the local server's MCP handlers but runs
// here in the content script because cloud has no server-side state — we
// answer queries straight from the live page.
function dispatchCloudMessage(msg: any) {
  // Status round-trip. Arrives with a requestId from the cloud relay
  // (CLOUD_SET_CHANGE_STATUS) or fire-and-forget from the local server
  // (SET_CHANGE_STATUS) — handle both before the requestId guard.
  if (msg?.type === 'SET_CHANGE_STATUS' || msg?.type === 'CLOUD_SET_CHANGE_STATUS') {
    (async () => {
      const status = msg.payload?.status;
      if (status !== 'todo' && status !== 'in_progress' && status !== 'resolved') {
        if (msg.requestId) sendRelayResponse(msg.requestId, { error: 'invalid status' });
        return;
      }
      const ids: string[] | undefined = Array.isArray(msg.payload?.ids) ? msg.payload.ids : undefined;
      let count = setChangesStatus(status, ids);
      try {
        const pageComments = await getPageComments();
        for (const c of pageComments) {
          if (!ids || ids.includes(c.id)) { await setCommentResolved(c.id, status === 'resolved'); count++; }
        }
      } catch { /* comment store unavailable — changes still updated */ }
      try { notifyPanel('CHANGES_UPDATE', await getChangesPayload()); } catch { /* panel closed */ }
      if (msg.requestId) sendRelayResponse(msg.requestId, { ok: true, count });
    })();
    return;
  }
  if (!msg?.requestId) return;
  switch (msg.type) {
    case 'CLOUD_GET_CHANGES':
      (async () => {
        const report: any = getChangeReport();
        try {
          const pageComments = await getPageComments();
          report.comments = pageComments.map(c => ({
            id: c.id, selector: c.selector, text: c.text,
            region: (c as any).region,
            timestamp: new Date(c.timestamp).toISOString(),
            pageUrl: (c as any).pageUrl, resolved: !!(c as any).resolved,
            screenshot: `get_screenshot({ commentId: "${c.id}" })`,
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
    // Agent-initiated clear — local (CLEAR_CHANGES) and cloud
    // (CLOUD_CLEAR_CHANGES) run the same full clear as the panel's
    // Clear All, then refresh the panel since the user didn't click it.
    case 'CLEAR_CHANGES':
    case 'CLOUD_CLEAR_CHANGES':
      (async () => {
        await performFullClear();
        try { notifyPanel('CHANGES_UPDATE', await getChangesPayload()); } catch { /* panel closed */ }
        sendRelayResponse(msg.requestId, { ok: true });
      })();
      return;
    case 'CLOUD_GET_SESSION_SUMMARY':
      sendRelayResponse(msg.requestId, {
        pageUrl: location.href,
        pageTitle: document.title,
        totalStyleChanges: getStyleChanges().length,
        totalTextChanges: getTextChanges().length,
        totalDomChanges: getDomChanges().length,
        pendingHandoff: (getChangeReport() as { handoff?: object }).handoff ?? null,
      });
      return;
    case 'CLOUD_EXPORT_CHANGES':
      sendRelayResponse(msg.requestId, { text: renderExportText(msg.payload?.format || 'css') });
      return;
    // Agent marks a comment resolved/open. Local (MARK_COMMENT_RESOLVED) and
    // cloud (CLOUD_MARK_COMMENT_RESOLVED) converge on the same UI-driven path,
    // so the pin recolours and the Changes tab updates exactly as if the user
    // had clicked Resolve. Sync the new state back so the server's view agrees.
    case 'MARK_COMMENT_RESOLVED':
    case 'CLOUD_MARK_COMMENT_RESOLVED': {
      const commentId = msg.payload?.commentId;
      const resolved = msg.payload?.resolved !== false;
      if (!commentId) { sendRelayResponse(msg.requestId, { ok: false }); return; }
      setCommentResolved(commentId, resolved).then(c => {
        if (c) { void showCommentPins(); syncCommentChange(c); notifyPanel('CHANGES_UPDATE', {}); }
        sendRelayResponse(msg.requestId, { ok: !!c });
      });
      return;
    }
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
    const mode = (conf['dm-mcp-mode'] as 'local' | 'cloud' | 'self-hosted' | undefined) || 'cloud';
    if (mode === 'local') { connectToServer({ mode: 'local' }); return; }
    const cloudToken = conf['dm-mcp-cloud-token'];
    const cloudUrl = conf['dm-mcp-cloud-url'] || (mode === 'cloud' ? 'https://mcp.designmode.app' : '');
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
  refreshSelfTabId();
  resetOverlayTeardown();
  resetMeasureTeardown();
  applyBaseCursor();
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
  teardownMeasureGuides();
  hideCommentPins();
  if (isFrozen()) unfreezeAnimations();
  disconnectFromServer();
  disableShortcuts();
  setSelectedElementId(null);
  // Final sweep — if any other module attached an overlay-like element, this
  // catches the strays so the page goes back to a pristine state the moment
  // the panel closes.
  document.querySelectorAll('#dm-hover, #dm-select, #dm-dim-label, #dm-axis-guides, #dm-distance, #dm-resize-dots, #dm-toolbar, .dm-multi-overlay, .dm-comment-pin').forEach(el => el.remove());
  clearBaseCursor();
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
  // Alt+A — fast path to add a comment on the focused element. Reuses the
  // existing comment infrastructure (pin + side-panel add field); no-op if
  // nothing is selected.
  registerShortcut('add-annotation', () => {
    const sid = getSelectedElementId();
    if (!sid) return;
    notifyPanel('OPEN_COMMENT_FOR_SELECTED', { elementId: sid });
  });
  // Alt+R — drag a freeform rectangle to comment on a region of the page
  // that isn't tied to a single element.
  registerShortcut('region-comment', () => { beginRegionDraw(); });
  // Alt+1 / Alt+2 / Alt+3 — jump to a side-panel tab without reaching
  // for the mouse. The panel owns its own `tab` state; we just emit
  // an inbound SWITCH_TAB message and the panel handler updates +
  // re-renders. The shortcut layer already suppresses while a page
  // input / textarea / contenteditable is focused (see
  // keyboard-shortcuts.ts), so users typing in a form field don't
  // accidentally tab-jump.
  registerShortcut('tab-layers', () => {
    notifyPanel('SWITCH_TAB', { tab: 'layers' });
  });
  registerShortcut('tab-design', () => {
    notifyPanel('SWITCH_TAB', { tab: 'design' });
  });
  registerShortcut('tab-changes', () => {
    notifyPanel('SWITCH_TAB', { tab: 'changes' });
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

    // Explicit on/off (vs toggle) — used to suspend inspect while a comment
    // composer is open, then restore it. Idempotent.
    case 'SET_INSPECT': {
      const want = !!(msg as any).on;
      if (want && !isInspectActive()) enableInspect((i: ElementInfo) => onElementSelected(i));
      else if (!want && isInspectActive()) disableInspect();
      sendResponse({ inspecting: isInspectActive() });
      break;
    }

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
      // Three-state derivation:
      //   - offline: transport (WS/SSE) is down
      //   - running: transport up, no agent attached recently
      //   - connected: transport up AND an agent has signalled presence
      //     (HELLO from mcp-local, or AGENT_PRESENCE from the cloud relay)
      const connected = isConnected();
      const agent = isAgentConnected();
      sendResponse({
        connected,
        serverRunning: connected,
        agentConnected: agent,
        mcpState: !connected ? 'offline' : agent ? 'connected' : 'running',
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
        const guides = getLayoutGuidesFor(info.id);
        sendResponse({ payload: { ...info, element: undefined, layoutGuides: guides } });
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
        // Note: SELECT_ELEMENT used to also toggle multi-select when
        // multi-select mode was active. That was the page's behaviour
        // when the side panel had a "Multi-select" toggle button — now
        // that the panel drives multi-select via Cmd/Shift+click on its
        // layer rows and pushes the resulting set through
        // SET_MULTI_SELECT_IDS, SELECT_ELEMENT is focus-only. Toggling
        // here would undo the panel's explicit set on every click.
        const info = selectAndNotify(el);
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        const guides = getLayoutGuidesFor(info.id);
        sendResponse({ payload: { ...info, element: undefined, layoutGuides: guides } });
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
          const guides = getLayoutGuidesFor(info.id);
          sendResponse({ payload: { ...info, element: undefined, layoutGuides: guides } });
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
          const guides = getLayoutGuidesFor(info.id);
          sendResponse({ payload: { ...info, element: undefined, layoutGuides: guides } });
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
          syncCommentChange(comment);
          sendResponse({ comment });
        });
        return true;
      }
      sendResponse({ error: 'No element selected or no text' });
      break;
    }

    // Enter region (freeform rectangle) draw mode. The user drags a box;
    // on release we stash the region and tell the panel to open its comment
    // composer. The geometry stays in the content script — the panel just
    // sends back the typed text via ADD_REGION_COMMENT.
    case 'START_REGION_COMMENT': {
      beginRegionDraw();
      sendResponse({ ok: true });
      break;
    }

    case 'CANCEL_REGION_COMMENT': {
      cancelRegionDraw();
      clearPendingRegionBox();
      pendingRegion = null;
      sendResponse({ ok: true });
      break;
    }

    case 'ADD_REGION_COMMENT': {
      if (pendingRegion && msg.text) {
        const region = pendingRegion;
        pendingRegion = null;
        const cx = region.x - window.scrollX + region.w / 2;
        const cy = region.y - window.scrollY + region.h / 2;
        const hit = document.elementFromPoint(cx, cy) as HTMLElement | null;
        const selector = hit && !isOverlayLike(hit) ? generateSelector(hit) : 'region';
        addRegionComment(region, selector, msg.text).then(comment => {
          syncCommentChange(comment);
          clearPendingRegionBox(); // committed box (showCommentPins) replaces the pending one
          void showCommentPins();
          sendResponse({ comment });
        });
        return true;
      }
      sendResponse({ error: 'No region drawn or no text' });
      break;
    }

    // Toggle / set the resolved flag on a comment.
    case 'SET_COMMENT_RESOLVED': {
      const cid = (msg as any).commentId;
      const resolved = !!(msg as any).resolved;
      if (cid) {
        setCommentResolved(cid, resolved).then((c) => {
          // After mutation, ensure pins re-render with the new ordinal /
          // colour. showCommentPins is idempotent.
          void showCommentPins();
          if (c) syncCommentChange(c);
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
        deleteComment(commentId).then(async () => { syncCommentDeleted(commentId); const p = await getChangesPayload(); sendResponse({ ok: true, ...p }); });
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
          // DOM change — actually reverse the action when possible.
          // Mirrors `revertAllPageMutations`'s per-action logic so a
          // single-row revert behaves identically to Clear All for that
          // change, including the belt-and-braces sweeps that catch
          // stale elementMap entries and React data-dm-id strips.
          const domChange = getDomChanges().find(c => c.id === msg.changeId);
          if (domChange) {
            try {
              if (domChange.action === 'duplicate' || domChange.action === 'insert') {
                // Primary: id lookup. Fallback: position-based selector.
                const el = getElementById(domChange.elementId) ||
                  (domChange.selector ? document.querySelector(domChange.selector) as HTMLElement | null : null);
                if (el) el.remove();
                // Belt-and-braces: any other element bearing this dm-id
                // (elementMap drift) and the dm-clone-<id> marker class
                // (survives a React strip of data-dm-id).
                document.querySelectorAll(`[data-dm-id="${domChange.elementId}"]`).forEach(n => n.remove());
                document.querySelectorAll(`.dm-clone-${domChange.elementId}`).forEach(n => n.remove());
                // Cascade: a duplicate/insert that's being reverted no
                // longer exists on the page, so any style/text/move/
                // delete records pointing at the same elementId are
                // orphans. Drop them so the Changes tab doesn't keep
                // showing stale rows the user can't act on.
                for (const c of getStyleChanges()) {
                  if (c.elementId === domChange.elementId) removeStyleChange(c.id);
                }
                for (const c of getTextChanges()) {
                  if (c.elementId === domChange.elementId) removeTextChange(c.id);
                }
                for (const c of getDomChanges()) {
                  if (c.id !== domChange.id && c.elementId === domChange.elementId) {
                    removeDomChange(c.id);
                  }
                }
              } else if (domChange.action === 'delete' && domChange.outerHTML) {
                // Use data-dm-id (stable) for the still-there check.
                // The saved selector is position-based and can match the
                // sibling that slid into the deleted element's slot.
                const stillThere = document.querySelector(`[data-dm-id="${domChange.elementId}"]`);
                if (!stillThere) {
                  const temp = document.createElement('div');
                  temp.innerHTML = domChange.outerHTML;
                  const restored = temp.firstElementChild as HTMLElement | null;
                  if (restored) {
                    let placed = false;
                    if (domChange.origin) {
                      let parent: HTMLElement | null = null;
                      const originParentId = (domChange.origin as any).parentId;
                      if (originParentId) {
                        parent = document.querySelector(`[data-dm-id="${originParentId}"]`) as HTMLElement | null;
                      }
                      if (!parent && domChange.origin.parentSelector) {
                        try { parent = document.querySelector(domChange.origin.parentSelector) as HTMLElement | null; } catch {}
                      }
                      if (parent) {
                        const idx = Math.min(domChange.origin.index, parent.children.length);
                        const before = parent.children[idx];
                        if (before) parent.insertBefore(restored, before);
                        else parent.appendChild(restored);
                        placed = true;
                      }
                    }
                    if (!placed) (document.body || document.documentElement).appendChild(restored);
                  }
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
        // Multi-select fan-out → one Changes-tab row that collapses every
        // per-element entry. groupId scopes a single (call, property)
        // tuple so two consecutive multi-select edits to different
        // properties land as two separate grouped rows.
        const isFanOut = targetIds.length > 1;
        const groupMeta = isFanOut
          ? {
              groupId: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              groupKind: 'multi-select' as const,
              groupLabel: `${targetIds.length} elements`,
            }
          : undefined;
        for (const id of targetIds) {
          const el = getElementById(id);
          if (!el) continue;
          const beforeValue = window.getComputedStyle(el).getPropertyValue(kebab);
          // Route through applyWithCompanions so well-known traps
          // (border-width without border-style, transition-property
          // with 0s duration, etc.) auto-emit the missing companion
          // alongside the user's edit. Companions share a groupId so
          // the Changes tab collapses them into one revertable row.
          const change = applyWithCompanions(id, msg.property, msg.value, () => {
            const el2 = getElementById(id);
            if (el2 && id === sid) onElementSelected(buildElementInfo(el2));
          }, groupMeta);
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
          repositionResizeDots();
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

    // Layout Guide overlay write. Deliberately separate from the
    // change-tracker / Changes-tab pipeline: layout guides are a
    // session-only visual aid, not a CSS edit the user wants to ship.
    // The side panel sends the full layer array for one element on
    // every mutation; we rebuild that element's `::before` rule in a
    // dedicated stylesheet. Sending `layers: 'none'` or an empty array
    // removes the overlay.
    case 'SET_LAYOUT_GUIDES': {
      const elementId = msg.elementId as string;
      if (elementId) {
        // After a page reload, the element with the original
        // data-dm-id may not exist yet (the inspector hasn't stamped
        // anything). If the panel sent a selector, resolve it and
        // re-stamp the matched element with the original dm-id so the
        // overlay's `[data-dm-id="X"]::before` selector hits.
        if (msg.selector && !getElementById(elementId)) {
          try {
            const target = document.querySelector(msg.selector) as HTMLElement | null;
            if (target) {
              target.setAttribute('data-dm-id', elementId);
              reserveIdsAtLeast([elementId]);
            }
          } catch {}
        }
        setLayoutGuidesOverlay(elementId, msg.layers, msg.sectionVisible);
      }
      sendResponse({ ok: true });
      return true;
    }

    // Batched style writes. Used by the side panel when a single user
    // gesture has to fan out to many CSS properties at once — stroke
    // position switching writes ~12 border / outline / box-shadow
    // longhands, and doing it as 12 separate APPLY_STYLE round-trips
    // produced visible flicker (intermediate renders showing partial
    // state) and a "moving through one tab at a time" feeling. One
    // message, one re-paint, one info refresh, one Changes-tab group.
    case 'APPLY_STYLES': {
      const sid = getSelectedElementId();
      if (!sid || !Array.isArray(msg.changes)) {
        sendResponse({ error: 'No element selected' });
        break;
      }
      const groupId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const groupMeta = {
        groupId,
        groupKind: 'multi-select' as const,
        groupLabel: msg.groupLabel || 'Batch',
      };
      for (const c of msg.changes) {
        if (!c?.property) continue;
        const el = getElementById(sid);
        if (!el) continue;
        const kebab = c.property.replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase());
        const beforeValue = window.getComputedStyle(el).getPropertyValue(kebab);
        const change = applyWithCompanions(sid, c.property, c.value, undefined, groupMeta);
        const afterValue = window.getComputedStyle(el).getPropertyValue(kebab);
        if (afterValue !== beforeValue) {
          undoStack.push({ kind: 'style', elementId: sid, property: c.property, oldValue: beforeValue, newValue: c.value, changeId: change?.id });
        }
      }
      if (msg.changes.length > 0) redoStack.length = 0;
      requestAnimationFrame(() => {
        const focusedEl = getElementById(sid);
        if (focusedEl) showSelect(focusedEl);
        repositionResizeDots();
      });
      const updatedEl = getElementById(sid);
      const updatedInfo = updatedEl ? buildElementInfo(updatedEl) : null;
      getChangesPayload().then(p => sendResponse({
        info: updatedInfo ? { ...updatedInfo, element: undefined } : null,
        ...p,
        undoCount: undoStack.length,
        redoCount: redoStack.length,
      }));
      return true;
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
          repositionResizeDots();
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
      performFullClear().then(() => sendResponse({ ok: true }));
      return true;
    }
    case 'REORDER_CHANGE': if (typeof msg.from === 'number' && typeof msg.to === 'number') reorderChange(msg.from, msg.to); getChangesPayload().then(p => sendResponse(p)); return true; break;

    case 'GET_DESIGN_SYSTEM': {
      // Single round-trip the panel uses to populate the Tokens view:
      // declared :root vars + the implicit scales (spacing / radius /
      // font-size / shadow) detected from viewport-visible elements.
      // Drift is computed here so the panel doesn't have to.
      const tokens = getPageTokens();
      const scales = detectScales();
      annotateDrift(scales, tokens);
      sendResponse({ tokens, scales });
      break;
    }
    case 'SET_ROOT_VAR': {
      // Edit a CSS variable at :root. Inline-set on documentElement —
      // resolves immediately for every consumer. The original value is
      // captured in root-var-store on the first edit so RESET_ROOT_VAR
      // and the markdown exporter can read it later. Changes-tab ledger
      // integration is deferred (applyStyleChange requires data-dm-id'd
      // elements; :root doesn't carry one).
      if (msg.cssVar && msg.value != null) {
        captureOriginalIfNew(msg.cssVar);
        document.documentElement.style.setProperty(msg.cssVar, msg.value);
        getChangesPayload().then(p => sendResponse({ ok: true, ...p }));
        return true;
      }
      sendResponse({ ok: false }); break;
    }
    case 'RESET_ROOT_VAR': {
      if (msg.cssVar) {
        document.documentElement.style.removeProperty(msg.cssVar);
        clearRootVarEdit(msg.cssVar);
        getChangesPayload().then(p => sendResponse({ ok: true, ...p }));
        return true;
      }
      sendResponse({ ok: false }); break;
    }
    case 'GET_TOKEN_USAGES': {
      if (msg.cssVar) {
        sendResponse({ ids: findTokenUsages(msg.cssVar) });
      } else {
        sendResponse({ ids: [] });
      }
      break;
    }
    case 'CONSOLIDATE_DETECTED': {
      // Replace every on-page occurrence of msg.rawValue (in the relevant
      // computed-style properties for the given scale) with var(--name).
      // Each replacement is a style change; all share one groupId so the
      // Changes tab shows it as a single collapsed row, revertable via
      // the existing subgroup-revert button.
      const PROPS_BY_SCALE: Record<string, string[]> = {
        spacing: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
                  'gap', 'rowGap', 'columnGap'],
        radius: ['borderTopLeftRadius', 'borderTopRightRadius',
                 'borderBottomRightRadius', 'borderBottomLeftRadius'],
        fontSize: ['fontSize'],
        shadow: ['boxShadow', 'textShadow'],
      };
      const scale: string = msg.scale || '';
      const props: string[] = PROPS_BY_SCALE[scale] || [];
      const rawValue: string = msg.rawValue || '';
      const cssVar: string = msg.cssVar || '';
      if (!props.length || !rawValue || !cssVar) {
        sendResponse({ ok: false, touched: 0 });
        break;
      }
      const groupId = `consolidate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const groupLabel = `Consolidate ${rawValue} → var(${cssVar})`;
      let touched = 0;
      const replacement = `var(${cssVar})`;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-dm-id]'))) {
        const cs = getComputedStyle(el);
        const id = el.getAttribute('data-dm-id');
        if (!id) continue;
        for (const p of props) {
          const v = (cs as any)[p] as string | undefined;
          if (v === rawValue) {
            const beforeValue = v;
            const change = applyStyleChange(id, p, replacement, undefined,
              { groupId, groupKind: 'consolidate', groupLabel });
            if (change) {
              undoStack.push({ kind: 'style', elementId: id, property: p, oldValue: beforeValue, newValue: replacement, changeId: change.id });
              touched++;
            }
          }
        }
      }
      redoStack.length = 0;
      getChangesPayload().then(p => sendResponse({
        ok: true, touched, groupId, ...p,
        undoCount: undoStack.length, redoCount: redoStack.length,
      }));
      return true;
    }
    case 'GET_PRESETS': {
      getCustomPresets().then(presets => sendResponse({ presets }));
      return true;
    }
    case 'SAVE_PRESET': {
      const sid = getSelectedElementId();
      if (!sid || !msg.name || !msg.kind) {
        sendResponse({ ok: false, error: 'Select an element first' });
        break;
      }
      const props: string[] = Array.isArray(msg.props) ? msg.props : [];
      saveCustomPreset(msg.name, sid, msg.kind as PresetKind, props).then(res => {
        sendResponse(res?.error
          ? { ok: false, error: res.error }
          : { ok: true, preset: res?.preset });
      });
      return true;
    }
    case 'DELETE_PRESET': {
      if (msg.presetId) {
        deleteCustomPreset(msg.presetId).then(() => sendResponse({ ok: true }));
        return true;
      }
      sendResponse({ ok: false });
      break;
    }
    case 'APPLY_PRESET': {
      const sid = getSelectedElementId();
      if (!sid || !msg.preset) {
        sendResponse({ error: 'No element selected' });
        break;
      }
      const el = getElementById(sid);
      if (!el) {
        sendResponse({ error: 'No element selected' });
        break;
      }
      // One groupId per preset application — every prop tagged with the
      // same id collapses into a single Changes-tab row.
      const groupId = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const groupLabel = msg.preset.name || 'Preset';
      for (const [prop, val] of Object.entries(msg.preset.styles as Record<string, string>)) {
        const kebab = prop.replace(/[A-Z]/g, (m: string) => '-' + m.toLowerCase());
        const beforeValue = window.getComputedStyle(el).getPropertyValue(kebab);
        const change = applyWithCompanions(sid, prop, val, undefined, {
          groupId, groupKind: 'preset', groupLabel,
        });
        const afterValue = window.getComputedStyle(el).getPropertyValue(kebab);
        if (afterValue !== beforeValue) {
          undoStack.push({ kind: 'style', elementId: sid, property: prop, oldValue: beforeValue, newValue: val, changeId: change?.id });
        }
      }
      redoStack.length = 0;
      const updatedInfo = buildElementInfo(el);
      getChangesPayload().then(p => sendResponse({
        info: { ...updatedInfo, element: undefined },
        ...p,
        groupId,
        undoCount: undoStack.length,
        redoCount: redoStack.length,
      }));
      return true;
    }
    case 'IMPORT_CHANGES': {
      // Replace every change on the page with the imported payload. Revert
      // current-session DOM mutations FIRST so a fresh import always
      // starts from a clean slate — otherwise residue from prior edits
      // (duplicates, moves, hidden elements) would silently layer with
      // whatever the imported JSON adds. Then clear in-memory arrays and
      // replay via the same path session-restore uses. Comments are
      // scoped to the current pageUrl.
      (async () => {
        try {
          const payload = msg.payload || {};
          const styleChanges = Array.isArray(payload.styleChanges) ? payload.styleChanges : [];
          const textChanges = Array.isArray(payload.textChanges) ? payload.textChanges : [];
          const domChanges = Array.isArray(payload.domChanges) ? payload.domChanges : [];
          const comments = Array.isArray(payload.comments) ? payload.comments : [];
          revertAllPageMutations();
          // Drop any current-page comments before we replace them with
          // the imported set; otherwise pins from a prior session would
          // remain on the page and mix with the imported pins.
          const existingComments = await getPageComments();
          for (const c of existingComments) await deleteComment(c.id);
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
        media = { kind: 'svg', src: url, markup: svgMarkup, filename: 'icon.svg', isObjectUrl: true, bytes: blob.size };
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
          media = { kind: 'svg', src: url, markup: svgMarkup, filename: 'icon.svg', isObjectUrl: true, bytes: blob.size };
        } else if (innerImg && !media) {
          media = { kind: 'image', src: innerImg.src, alt: innerImg.alt, filename: (innerImg.src.split('/').pop() || 'image').split('?')[0] };
        }
      }
      // Resolve transferred bytes if we don't already have it. Prefer
      // PerformanceResourceTiming (no network — the browser already fetched
      // the resource). data: URLs are computed from the payload length.
      // Cross-origin / opaque responses leave bytes undefined and the panel
      // falls back to showing resolution + kind only.
      if (media && media.src && media.bytes === undefined) {
        media.bytes = resolveResourceBytes(media.src);
        if (media.bytes === undefined && /^data:/.test(media.src)) {
          const comma = media.src.indexOf(',');
          if (comma > -1) {
            const payload = media.src.slice(comma + 1);
            const isB64 = /;base64/i.test(media.src.slice(0, comma));
            media.bytes = isB64
              ? Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0)
              : decodeURIComponent(payload).length;
          }
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
      else if (msg.format === 'markdown') { getPageComments().then(pc => sendResponse({ output: exportMarkdown(pc) })); return true; }
      else if (msg.format === 'enhanced-github') { sendResponse({ body: exportEnhancedGitHubIssue() }); break; }
      sendResponse({ output }); break;
    }

    // "Send to Agent" — stage the handoff marker and push it to the MCP
    // server so the agent's next get_changes sees it.
    case 'SEND_TO_AGENT': {
      if (!isConnected() || !isAgentConnected()) { sendResponse({ ok: false, error: 'No agent connected' }); break; }
      sendResponse({ ok: true, handoff: stageAgentHandoff() });
      break;
    }

    case 'SCREENSHOT_ELEMENT': { const sid = getSelectedElementId(); if (sid) { captureElementScreenshot(sid).then(dataUrl => sendResponse({ dataUrl })); return true; } sendResponse({ dataUrl: null }); break; }
    case 'SCREENSHOT_VIEWPORT': { captureViewportScreenshotClean().then(dataUrl => sendResponse({ dataUrl })); return true; }
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
    case 'FIND_SIMILAR': {
      const ids = msg.elementId ? findSimilarElements(msg.elementId, Number(msg.sensitivity) || 2) : [];
      sendResponse({ ids, count: ids.length });
      break;
    }
    // Panel-driven multi-select. The side panel computes the next set
    // from modifier-keyed layer clicks and pushes it here verbatim;
    // we enable multi-select mode if the set is non-empty, disable it
    // (which also clears overlays) otherwise. The result mirrors back
    // to the panel via MULTI_SELECT_UPDATE so any stragglers — e.g. an
    // ID we couldn't bind to a live element — get filtered in one round.
    case 'SET_MULTI_SELECT_IDS': {
      const ids: string[] = Array.isArray(msg.ids) ? msg.ids.filter((x: unknown) => typeof x === 'string') : [];
      if (ids.length === 0) {
        if (isMultiSelectActive()) disableMultiSelect();
      } else {
        if (!isMultiSelectActive()) enableMultiSelect();
        setMultiSelectIds(ids);
      }
      notifyPanel('MULTI_SELECT_UPDATE', { payload: { ids: getMultiSelectIds() } });
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

    // ── Section rearrange ──
    case 'GET_SECTIONS': {
      sendResponse({ sections: detectSections() });
      break;
    }
    case 'REORDER_SECTION': {
      const res = reorderSection(msg.sectionId, msg.targetIndex);
      if (res) notifyPanel('REARRANGE_APPLIED', { payload: { sectionId: msg.sectionId, newOrder: res.newOrder } });
      getChangesPayload().then(p => sendResponse({ ok: !!res, sections: detectSections(), ...p }));
      return true;
    }
    // A rearrange note is a pinned comment on the section element, so it
    // rides the existing comment pipeline: Changes tab, exports, MCP sync,
    // and the agent's mark_comment_resolved loop.
    case 'ADD_SECTION_NOTE': {
      const el = msg.sectionId ? getElementById(msg.sectionId) : null;
      if (!el || !msg.text) { sendResponse({ error: 'Section not found or empty note' }); break; }
      addComment(msg.sectionId, generateSelector(el), msg.text).then(comment => {
        syncCommentChange(comment);
        void showCommentPins();
        notifyPanel('CHANGES_UPDATE', {});
        sendResponse({ comment });
      });
      return true;
    }

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

    case 'GET_EFFECTIVE_BG': {
      // Walks the ancestor chain for the first opaque backgroundColor.
      // Side panel calls this when computing contrast — the element's
      // own background is transparent and we need the actual painted
      // colour behind it. Falls back to #FFFFFF at the viewport.
      const el = getElementById(msg.elementId || getSelectedElementId() || '');
      if (!el) { sendResponse({ ok: false, color: null }); break; }
      let cur: Element | null = el;
      let result: string | null = null;
      while (cur && cur !== document.documentElement) {
        const bg = getComputedStyle(cur).backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
          result = bg;
          break;
        }
        cur = cur.parentElement;
      }
      if (!result && document.documentElement) {
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        if (htmlBg && htmlBg !== 'transparent' && htmlBg !== 'rgba(0, 0, 0, 0)') {
          result = htmlBg;
        }
      }
      sendResponse({ ok: true, color: result || '#FFFFFF' });
      break;
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
          // Our own override is hiding it — pull our rule out cleanly. The
          // resulting StyleChange entry is dropped (no row), so no group
          // tag needed.
          applyStyleChange(msg.elementId, 'display', '');
        } else if (computedHidden) {
          // Now showing the element by reverting cascade. Tag the row as
          // a SHOW gesture so the Changes tab labels it sensibly.
          applyStyleChange(msg.elementId, 'display', 'revert', undefined, {
            groupKind: 'visibility', groupLabel: 'Shown',
          });
        } else {
          applyStyleChange(msg.elementId, 'display', 'none', undefined, {
            groupKind: 'visibility', groupLabel: 'Hidden',
          });
        }
      }
      getChangesPayload().then(p => sendResponse({ ok: true, ...p, undoCount: undoStack.length, redoCount: redoStack.length }));
      return true;
      break;
    }

    case 'REORDER_LAYER': {
      const source = getElementById(msg.sourceId);
      const target = getElementById(msg.targetId);
      // Three positions: 'before' / 'after' insert as siblings of target;
      // 'inside' makes source the last child of target (indent). Outdent
      // is handled naturally by dropping into an ancestor row's middle
      // band — same code path, just a higher target.
      const rawPos = msg.position;
      const position: 'before' | 'after' | 'inside' =
        rawPos === 'inside' || rawPos === 'after' ? rawPos : 'before';
      // Reject drops where target is inside the dragged subtree (would
      // detach source from the document). Walk target's ancestors up
      // looking for source. Equality is also rejected.
      const isDescendant = (() => {
        if (!source || !target) return false;
        if (source === target) return true;
        for (let p: Element | null = target; p; p = p.parentElement) {
          if (p === source) return true;
        }
        return false;
      })();
      const canDropInside = position === 'inside' ? !!source && !!target : true;
      const canDropSibling = position !== 'inside' ? !!source && !!target && !!target.parentElement : true;
      if (source && target && !isDescendant && canDropInside && canDropSibling) {
        const dmAttrParent = (p: HTMLElement | null) =>
          p && p !== document.body && p !== document.documentElement ? getOrAssignId(p) : undefined;
        let origin: { parentSelector: string; index: number; parentId?: string } | undefined;
        if (source.parentElement) {
          origin = {
            parentSelector: generateSelector(source.parentElement),
            index: Array.from(source.parentElement.children).indexOf(source),
            parentId: dmAttrParent(source.parentElement),
          };
        }
        // Compute the destination parent + the node we insert before.
        // For 'inside' the target itself is the parent and we append.
        const parent: HTMLElement = position === 'inside' ? target : target.parentElement!;
        const beforeNode: Node | null =
          position === 'inside' ? null
          : position === 'after' ? target.nextSibling
          : target;
        parent.insertBefore(source, beforeNode);
        // Bring the moved row into view so the user sees where it landed.
        try { source.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
        const sourceSelector = generateSelector(source);
        const parentSelector = generateSelector(parent);
        const index = Array.from(parent.children).indexOf(source);
        recordDomChange(
          msg.sourceId, sourceSelector, 'move', source.tagName.toLowerCase(),
          undefined,
          { parentSelector, index, parentId: dmAttrParent(parent) },
          origin,
        );
        // Keep the moved element selected so the Design tab + breadcrumb
        // follow the move; without this the panel still points at the
        // pre-move ancestor selection.
        setSelectedElementId(msg.sourceId);
        const info = buildElementInfo(source);
        onElementSelected(info);
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
