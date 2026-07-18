// ============================================================
// Design Mode — Background Service Worker
// Opens Chrome Side Panel on action click, relays messages.
// Pins to the tab that was active when side panel opened.
// Auto-activates design mode (with inspect) on open.
// ============================================================

const tabStates = new Map<number, { enabled: boolean; connected: boolean }>();
let pinnedTabId: number | null = null;
let pinnedTabUrl: string | null = null;

// Every connected panel surface (the native Chrome side panel AND any popped-out
// floating window) opens a `sidepanel` port. We bind each port to the browser
// TAB it controls, so multiple surfaces across tabs/windows route correctly.
// "Is a panel open for tab X" = any port in this map bound to X.
const panelPorts = new Map<chrome.runtime.Port, number>();
function panelsForTab(tabId: number): number {
  let n = 0;
  for (const t of panelPorts.values()) if (t === tabId) n++;
  return n;
}

// Tabs mid-swap between surfaces (side panel ⇄ floating window). While a tab
// is here, the disconnect of the OLD surface must NOT deactivate it — the new
// surface is about to (or just did) connect. Cleared when any port re-binds
// the tab, or after a safety timeout.
const transitioningTabs = new Set<number>();
// windowId → bound tabId, for floating pop-out windows we created.
const popoutWindows = new Map<number, number>();

// The target tab for the message currently being handled. Set synchronously
// at the top of the onMessage listener from `msg.targetTabId` (the panel
// stamps every SP_* with the tab it's bound to), and read synchronously at
// the top of `forwardToPinnedTab` before any await — so concurrent messages
// can't corrupt each other's routing.
let currentTargetTab: number | null = null;

// Open side panel when extension icon is clicked. setPanelBehavior is a
// Promise; in transient SW restart conditions Chrome will reject it with
// `Error: No SW` if the worker is being torn down. Catch — there's
// nothing useful to do, the new SW instance will rerun this on boot.
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// storage.session defaults to trusted (extension-page) contexts only; the
// change-tracker's session persistence runs in content scripts, which count
// as untrusted. Without this, every persist/load rejects with "Access to
// storage is not allowed from this context".
if (chrome.storage?.session?.setAccessLevel) {
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
}

// Returns false for URLs Chrome blocks extensions from scripting —
// chrome:// internal pages, the Web Store, devtools, etc. Used to skip
// inject + activate cleanly so the console stays quiet on those tabs.
function isScriptableUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.startsWith('chrome://')) return false;
  if (url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('chrome-search://')) return false;
  if (url.startsWith('chrome-untrusted://')) return false;
  if (url.startsWith('devtools://')) return false;
  if (url.startsWith('edge://')) return false;
  if (url.startsWith('about:')) return false;
  try {
    const u = new URL(url);
    if (u.hostname === 'chromewebstore.google.com') return false;
    if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return false;
  } catch {}
  return true;
}

// file:// pages are scriptable only when the user enables the per-extension
// "Allow access to file URLs" toggle — no manifest key can grant it.
async function isFileAccessBlocked(url: string | undefined | null): Promise<boolean> {
  if (!url?.startsWith('file:')) return false;
  try {
    return !(await chrome.extension.isAllowedFileSchemeAccess());
  } catch {
    // Deprecated namespace — if it ever disappears from the SW, fall
    // through to injection; the unreachable-content-script path below
    // still flags file: tabs as blocked.
    return false;
  }
}

// A panel surface connected. Bind it to a tab and auto-activate that tab.
// The native side panel connects as `sidepanel` (binds to the active tab in
// the current window). A popped-out floating window connects as
// `sidepanel:<tabId>` (binds to the tab it was popped out from).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel' && !port.name.startsWith('sidepanel:')) return;

  const explicitTab = port.name.startsWith('sidepanel:')
    ? parseInt(port.name.slice('sidepanel:'.length), 10)
    : NaN;

  (async () => {
    let tabId: number | null = Number.isInteger(explicitTab) ? explicitTab : null;
    let tabUrl: string | null = null;
    if (tabId != null) {
      try { tabUrl = (await chrome.tabs.get(tabId)).url || null; } catch { tabId = null; }
    }
    if (tabId == null) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id ?? null;
      tabUrl = tab?.url ?? null;
    }
    if (tabId == null) {
      try { port.postMessage({ type: 'INIT_STATE', enabled: false, connected: false }); } catch {}
      return;
    }

    panelPorts.set(port, tabId);
    transitioningTabs.delete(tabId); // a surface re-bound — swap complete
    pinnedTabId = tabId; pinnedTabUrl = tabUrl; // legacy fallback for forward routing

    if (!isScriptableUrl(tabUrl)) {
      try { port.postMessage({ type: 'INIT_STATE', enabled: false, connected: false, pinnedUrl: tabUrl, tabId }); } catch {}
      return;
    }
    if (await isFileAccessBlocked(tabUrl)) {
      try { port.postMessage({ type: 'INIT_STATE', enabled: false, connected: false, fileAccessBlocked: true, pinnedUrl: tabUrl, tabId }); } catch {}
      return;
    }
    try { await injectContentScript(tabId); } catch {}
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId!, { type: 'ACTIVATE_DESIGN_MODE' });
        const state = await chrome.tabs.sendMessage(tabId!, { type: 'GET_STATE' });
        try { port.postMessage({ type: 'INIT_STATE', ...state, pinnedUrl: tabUrl, tabId }); } catch {}
      } catch (err) {
        const m = String((err as any)?.message || err);
        if (!/Could not establish connection|Receiving end does not exist/i.test(m)) {
          console.error('[DM] Auto-activate failed:', err);
        }
        // Unreachable content script on a file: tab means Chrome denied
        // injection — the file-access toggle is off, whatever the
        // isAllowedFileSchemeAccess pre-check said.
        const blocked = !!tabUrl?.startsWith('file:');
        try { port.postMessage({ type: 'INIT_STATE', enabled: false, connected: false, fileAccessBlocked: blocked, pinnedUrl: tabUrl, tabId }); } catch {}
      }
    }, 300);
  })().catch(() => { /* tab query racing SW teardown — no point logging */ });

  port.onDisconnect.addListener(() => {
    const tabId = panelPorts.get(port);
    panelPorts.delete(port);
    // Only deactivate the tab when its LAST surface closes AND it isn't
    // mid-swap (pop-out / dock-back), so the transition never tears it down.
    if (tabId != null && panelsForTab(tabId) === 0 && !transitioningTabs.has(tabId)) {
      try { chrome.tabs.sendMessage(tabId, { type: 'DEACTIVATE_DESIGN_MODE' }).catch(() => {}); } catch {}
    }
    if (pinnedTabId === tabId) {
      const remaining = [...panelPorts.values()];
      pinnedTabId = remaining.length ? remaining[remaining.length - 1] : null;
      if (pinnedTabId == null) pinnedTabUrl = null;
    }
  });
});

// Toggle via keyboard command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-design-mode') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.windowId) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.error('[DM] Failed to open side panel:', err);
      }
    }
  }
});

// Helper: forward message to the tab the sending panel is bound to. Captures
// `currentTargetTab` synchronously (before any await) so concurrent messages
// don't cross-route; falls back to the last pinned tab, then the active tab.
async function forwardToPinnedTab(message: any, sendResponse: (response?: any) => void) {
  const tabId = currentTargetTab ?? pinnedTabId;
  if (!tabId) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, message);
        sendResponse(response);
        return;
      }
    } catch {}
    sendResponse({ error: 'No pinned tab' });
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    sendResponse(response);
  } catch (err) {
    sendResponse({ error: String(err) });
  }
}

// Message handling — relay between content script and side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Resolve which tab this panel message targets (panel stamps every SP_*).
  // Read synchronously here and again at the top of forwardToPinnedTab.
  currentTargetTab = (typeof msg?.targetTabId === 'number') ? msg.targetTabId : null;

  // Messages FROM content script — just let them propagate to side panel
  if (msg.type === 'ELEMENT_SELECTED' || msg.type === 'STATE_UPDATE' ||
      msg.type === 'CHANGES_UPDATE' || msg.type === 'STYLE_APPLIED' ||
      msg.type === 'ANIMATION_STATE' ||
      msg.type === 'PROMPT_ANNOTATION' || msg.type === 'ELEMENT_HOVERED_INFO' ||
      msg.type === 'COMMENT_BUBBLE_CLICKED' || msg.type === 'OPEN_COMMENT_FOR_SELECTED' ||
      msg.type === 'AGENT_PRESENCE_UPDATE') {
    return false;
  }

  // Panel surface unloading. The authoritative cleanup is the port's
  // onDisconnect (it knows which tab the port was bound to and only
  // deactivates on the LAST surface for that tab). This is just a hint —
  // we let onDisconnect do the work to avoid tearing down a tab that still
  // has another surface open.
  if (msg.type === 'SP_PANEL_CLOSING') {
    return false;
  }

  // Heartbeat from content scripts — answers "is a panel open for THIS tab?"
  // (per-tab now). `sender.tab.id` is the content script's own tab. Lets the
  // content side self-disable if the close → DEACTIVATE chain drops a message.
  if (msg.type === 'IS_PANEL_OPEN') {
    const tabId = sender.tab?.id;
    sendResponse({ open: tabId != null && panelsForTab(tabId) > 0 });
    return true;
  }

  // A content script asking which tab it lives in, so it can stamp its
  // broadcasts and let each panel surface filter to its own bound tab.
  if (msg.type === 'GET_MY_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id ?? null });
    return true;
  }

  // Pop the panel out into a floating window bound to the sender's tab.
  // windows.create needs no user gesture (unlike sidePanel.open), so it runs
  // here in the background. The side panel closes itself after we ack.
  if (msg.type === 'SP_POP_OUT') {
    const tabId = currentTargetTab;
    if (tabId == null) { sendResponse({ ok: false }); return true; }
    (async () => {
      transitioningTabs.add(tabId);
      setTimeout(() => transitioningTabs.delete(tabId), 6000); // safety net
      let b: any = {};
      try {
        const saved: any = (await chrome.storage.local.get('dm-popout-bounds'))['dm-popout-bounds'];
        if (saved && typeof saved.width === 'number') b = saved;
      } catch {}
      try {
        const win = await chrome.windows.create({
          url: chrome.runtime.getURL('sidepanel/index.html') + '?tab=' + tabId,
          type: 'popup',
          focused: true,
          width: b.width || 420,
          height: b.height || 760,
          ...(typeof b.left === 'number' ? { left: b.left } : {}),
          ...(typeof b.top === 'number' ? { top: b.top } : {}),
        });
        if (win?.id != null) popoutWindows.set(win.id, tabId);
        sendResponse({ ok: true, windowId: win?.id });
      } catch (e) {
        transitioningTabs.delete(tabId);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // The dock-back flow (sidePanel.open) must run in the popup to keep the user
  // gesture; it pings this first so the popup's imminent close doesn't
  // deactivate the tab before the side panel re-binds it.
  if (msg.type === 'SP_TRANSITION_BEGIN') {
    const tabId = currentTargetTab;
    if (tabId != null) {
      transitioningTabs.add(tabId);
      setTimeout(() => transitioningTabs.delete(tabId), 6000);
    }
    sendResponse({ ok: true });
    return true;
  }

  // Side panel → content script forwards
  const forwardTypes: Record<string, any> = {
    'SP_ACTIVATE': { type: 'ACTIVATE_DESIGN_MODE' },
    'SP_DEACTIVATE': { type: 'DEACTIVATE_DESIGN_MODE' },
    'SP_TOGGLE_INSPECT': { type: 'TOGGLE_INSPECT' },
    'SP_GET_STATE': { type: 'GET_STATE' },
    'SP_GET_CHANGES': { type: 'GET_CHANGES' },
    'SP_CLEAR_CHANGES': { type: 'CLEAR_CHANGES' },
    'SP_GET_DOM_TREE': { type: 'GET_DOM_TREE' },
    'SP_GET_PAGE_URL': { type: 'GET_PAGE_URL' },
  };

  if (forwardTypes[msg.type]) {
    forwardToPinnedTab(forwardTypes[msg.type], sendResponse);
    return true;
  }

  if (msg.type === 'SP_APPLY_STYLE') {
    forwardToPinnedTab({ type: 'APPLY_STYLE', property: msg.property, value: msg.value }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SET_LAYOUT_GUIDES') {
    forwardToPinnedTab({
      type: 'SET_LAYOUT_GUIDES',
      elementId: msg.elementId,
      selector: msg.selector,
      layers: msg.layers,
      sectionVisible: msg.sectionVisible,
    }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SCROLL_TO_ELEMENT') {
    forwardToPinnedTab({ type: 'SCROLL_TO_ELEMENT', elementId: msg.elementId }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_APPLY_PARENT_STYLE') {
    forwardToPinnedTab({ type: 'APPLY_PARENT_STYLE', property: msg.property, value: msg.value }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_DOM_ACTION') {
    forwardToPinnedTab({ type: 'DOM_ACTION', action: msg.action, elementId: msg.elementId }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SELECT_ELEMENT') {
    forwardToPinnedTab({ type: 'SELECT_ELEMENT', elementId: msg.elementId }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SELECT_PARENT') {
    forwardToPinnedTab({ type: 'SELECT_PARENT' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SELECT_CHILD') {
    forwardToPinnedTab({ type: 'SELECT_CHILD' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_UNDO') {
    forwardToPinnedTab({ type: 'UNDO' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_REDO') {
    forwardToPinnedTab({ type: 'REDO' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SET_TEXT') { forwardToPinnedTab({ type: 'SET_TEXT', text: msg.text }, sendResponse); return true; }
  if (msg.type === 'SP_ADD_COMMENT') {
    forwardToPinnedTab({ type: 'ADD_COMMENT', text: msg.text }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SET_INSPECT') {
    forwardToPinnedTab({ type: 'SET_INSPECT', on: msg.on }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_START_REGION_COMMENT') {
    forwardToPinnedTab({ type: 'START_REGION_COMMENT' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_CANCEL_REGION_COMMENT') {
    forwardToPinnedTab({ type: 'CANCEL_REGION_COMMENT' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_ADD_REGION_COMMENT') {
    forwardToPinnedTab({ type: 'ADD_REGION_COMMENT', text: msg.text }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SET_COMMENT_RESOLVED') {
    forwardToPinnedTab({ type: 'SET_COMMENT_RESOLVED', commentId: msg.commentId, resolved: msg.resolved }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SET_COMMENT_PIN_OFFSET') {
    forwardToPinnedTab({ type: 'SET_COMMENT_PIN_OFFSET', commentId: msg.commentId, offset: msg.offset }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_REMOVE_CHANGE') {
    forwardToPinnedTab({ type: 'REMOVE_CHANGE', changeId: msg.changeId }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_HOVER_ELEMENT') {
    forwardToPinnedTab({ type: 'HOVER_ELEMENT', elementId: msg.elementId }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_UNHOVER_ELEMENT') {
    forwardToPinnedTab({ type: 'UNHOVER_ELEMENT' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_REORDER_CHANGE') {
    forwardToPinnedTab({ type: 'REORDER_CHANGE', from: msg.from, to: msg.to }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_GET_MEDIA') { forwardToPinnedTab({ type: 'GET_MEDIA' }, sendResponse); return true; }
  if (msg.type === 'SP_IMPORT_CHANGES') { forwardToPinnedTab({ type: 'IMPORT_CHANGES', payload: msg.payload }, sendResponse); return true; }
  // Cloud-mode auth + transport reload. Register/revoke fire from the
  // background service worker (no content-script round-trip needed) so a
  // page navigation won't kill an in-flight auth request. Reconfigure
  // tells the content script to drop the old transport and open a new one
  // based on the just-changed mode/token.
  if (msg.type === 'SP_MCP_REGISTER_TOKEN') {
    const url = (msg.cloudUrl || '').replace(/\/$/, '');
    if (!url) { sendResponse({ ok: false, error: 'No cloud URL configured.' }); return true; }
    fetch(url + '/api/auth/register', { method: 'POST' })
      .then(async r => {
        if (!r.ok) { sendResponse({ ok: false, error: `Register failed (${r.status})` }); return; }
        const json = await r.json();
        sendResponse({ ok: true, token: json.token, tenantId: json.tenantId });
      })
      .catch((err: any) => sendResponse({ ok: false, error: err?.message || 'Network error' }));
    return true;
  }
  if (msg.type === 'SP_MCP_REVOKE_TOKEN') {
    const url = (msg.cloudUrl || '').replace(/\/$/, '');
    const token = msg.token;
    if (!url || !token) { sendResponse({ ok: false, error: 'Missing url or token.' }); return true; }
    fetch(url + '/api/auth/revoke', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
    })
      .then(r => sendResponse({ ok: r.ok }))
      .catch((err: any) => sendResponse({ ok: false, error: err?.message || 'Network error' }));
    return true;
  }
  if (msg.type === 'SP_RECONFIGURE_TRANSPORT') {
    forwardToPinnedTab({ type: 'RECONFIGURE_TRANSPORT' }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_EXPORT') {
    forwardToPinnedTab({ type: 'EXPORT', format: msg.format }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SCREENSHOT') {
    if (msg.target === 'viewport') {
      // Route through the content script so it can hide Design Mode overlays
      // (selection outline, margin/padding bands, guides, pins) before the
      // capture, then restore them — same clean shot as the element path.
      forwardToPinnedTab({ type: 'SCREENSHOT_VIEWPORT' }, sendResponse);
      return true;
    } else {
      forwardToPinnedTab({ type: 'SCREENSHOT_ELEMENT' }, sendResponse);
      return true;
    }
  }
  if (msg.type === 'SP_GITHUB_EXPORT') {
    forwardToPinnedTab({ type: 'GITHUB_EXPORT', repoUrl: msg.repoUrl }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_UPLOAD_IMAGE') {
    forwardToPinnedTab({ type: 'UPLOAD_IMAGE', dataUrl: msg.dataUrl }, sendResponse);
    return true;
  }

  // Surviving feature relays
  if (msg.type === 'SP_TOGGLE_FREEZE') { forwardToPinnedTab({ type: 'TOGGLE_FREEZE' }, sendResponse); return true; }
  if (msg.type === 'SP_DETECT_FRAMEWORK') { forwardToPinnedTab({ type: 'GET_SOURCE_LOCATION' }, sendResponse); return true; }
  // SP_OPEN_VSCODE falls through the dynamic SP_-prefix fallback so the
  // `source` field on the message is forwarded with the rest.
  if (msg.type === 'SP_TOGGLE_VISIBILITY') { forwardToPinnedTab({ type: 'TOGGLE_VISIBILITY', elementId: msg.elementId }, sendResponse); return true; }
  // SP_REORDER_LAYER falls through to the SP_ fallback below so all fields
  // (sourceId, targetId, position) forward without hand-maintained mapping.
  // SP_SEND_TO_AGENT falls through the SP_ fallback → content's SEND_TO_AGENT
  // handler, which stages the handoff and pushes it over the MCP transport.
  if (msg.type === 'SP_GET_MCP_STATUS') { forwardToPinnedTab({ type: 'GET_MCP_STATUS' }, sendResponse); return true; }
  if (msg.type === 'SP_GET_DESIGN_TOKENS') { forwardToPinnedTab({ type: 'GET_DESIGN_TOKENS' }, sendResponse); return true; }
  if (msg.type === 'SP_GET_COMPUTED_CSS') { forwardToPinnedTab({ type: 'GET_COMPUTED_CSS', elementId: msg.elementId }, sendResponse); return true; }
  if (msg.type === 'SP_PREVIEW_ORIGINAL') { forwardToPinnedTab({ type: 'PREVIEW_ORIGINAL' }, sendResponse); return true; }
  if (msg.type === 'SP_RESTORE_CHANGES') { forwardToPinnedTab({ type: 'RESTORE_CHANGES' }, sendResponse); return true; }
  if (msg.type === 'SP_BATCH_APPLY_CHANGE') { forwardToPinnedTab({ type: 'BATCH_APPLY_CHANGE', changeId: msg.changeId }, sendResponse); return true; }

  // Generic SP_ fallback: any message with a SP_ prefix not handled above gets
  // its prefix stripped and the rest of its fields forwarded as-is to the
  // pinned tab. New panel→content messages don't need a relay registration.
  if (typeof msg.type === 'string' && msg.type.startsWith('SP_')) {
    const { type, ...rest } = msg;
    forwardToPinnedTab({ type: type.slice(3), ...rest }, sendResponse);
    return true;
  }

  // Legacy
  if (msg.type === 'TOGGLE_DESIGN_MODE') {
    const targetTabId = msg.tabId || sender.tab?.id;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, { type: 'TOGGLE_DESIGN_MODE' }).then(sendResponse).catch(() => sendResponse({ enabled: false }));
    }
    return true;
  }
  if (msg.type === 'GET_STATE') {
    const tabId = msg.tabId || sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' }).then(sendResponse).catch(() => sendResponse({ enabled: false, connected: false }));
    } else {
      sendResponse({ enabled: false, connected: false });
    }
    return true;
  }
  if (msg.type === 'CAPTURE_VIEWPORT') {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => sendResponse({ dataUrl }));
    return true;
  }

  return false;
});

// Remember a floating window's size/position so the next pop-out restores it.
chrome.windows.onBoundsChanged?.addListener((win) => {
  // Skip non-normal states so a minimize (e.g. while pinned to PiP) doesn't
  // clobber the remembered floating-window bounds.
  if (win.id != null && win.state === 'normal' && popoutWindows.has(win.id)) {
    const { left, top, width, height } = win;
    chrome.storage.local.set({ 'dm-popout-bounds': { left, top, width, height } }).catch(() => {});
  }
});
chrome.windows.onRemoved.addListener((windowId) => {
  popoutWindows.delete(windowId);
});
// If a tab that a floating window is bound to closes, the window can no longer
// control anything — close it.
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [winId, boundTab] of popoutWindows) {
    if (boundTab === tabId) { try { void chrome.windows.remove(winId).catch(() => {}); } catch {} }
  }
});

function updateBadge(tabId: number, enabled: boolean) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : '', tabId });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#4F9EFF' : '#52525b', tabId });
}

async function injectContentScript(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (err) {
      // Quiet the expected failures: chrome://, chrome-extension://,
      // chromewebstore.google.com, etc. Chrome blocks scripting these by
      // design — logging looks like a real error to users.
      const msg = String((err as any)?.message || err);
      if (/cannot be scripted|Cannot access|chrome:\/\/|chrome-extension:\/\/|chrome-untrusted:\/\/|chromewebstore|extensions gallery/i.test(msg)) {
        return;
      }
      console.error('[DM] Failed to inject content script:', err);
    }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  if (tabId === pinnedTabId) {
    pinnedTabId = null;
    pinnedTabUrl = null;
  }
});

// Re-activate design mode when the pinned tab navigates / reloads —
// the content script is reinjected on each navigation, so we need to
// turn inspect back on (replay of session changes happens inside the content script).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== pinnedTabId) return;
  if (changeInfo.status !== 'complete') return;
  pinnedTabUrl = tab.url || pinnedTabUrl;
  if (!isScriptableUrl(tab.url)) return;
  if (await isFileAccessBlocked(tab.url)) {
    for (const [port, boundTab] of panelPorts) {
      if (boundTab !== tabId) continue;
      try { port.postMessage({ type: 'INIT_STATE', enabled: false, connected: false, fileAccessBlocked: true, pinnedUrl: tab.url, tabId }); } catch {}
    }
    return;
  }
  try {
    await injectContentScript(tabId);
    setTimeout(async () => {
      try { await chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_DESIGN_MODE' }); } catch {}
    }, 200);
  } catch {}
});

console.log('[Design Mode] Background service worker loaded.');
