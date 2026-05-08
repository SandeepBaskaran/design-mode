// ============================================================
// Design Mode — Background Service Worker
// Opens Chrome Side Panel on action click, relays messages.
// Pins to the tab that was active when side panel opened.
// Auto-activates design mode (with inspect) on open.
// ============================================================

const tabStates = new Map<number, { enabled: boolean; connected: boolean }>();
let pinnedTabId: number | null = null;
let pinnedTabUrl: string | null = null;
// Tracks whether a side-panel port is currently connected. Source of truth
// for content-script heartbeats (`IS_PANEL_OPEN`). Cleared the moment the
// panel disconnects, so a heartbeat racing the disconnect handler still
// sees the right state.
let sidepanelOpen = false;

// Open side panel when extension icon is clicked. setPanelBehavior is a
// Promise; in transient SW restart conditions Chrome will reject it with
// `Error: No SW` if the worker is being torn down. Catch — there's
// nothing useful to do, the new SW instance will rerun this on boot.
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// When side panel connects, pin the current tab and auto-activate
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    sidepanelOpen = true;
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (tab?.id) {
        pinnedTabId = tab.id;
        pinnedTabUrl = tab.url || null;
        try {
          await injectContentScript(tab.id);
        } catch {}
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id!, { type: 'ACTIVATE_DESIGN_MODE' });
            const state = await chrome.tabs.sendMessage(tab.id!, { type: 'GET_STATE' });
            try { port.postMessage({ type: 'INIT_STATE', ...state, pinnedUrl: pinnedTabUrl }); } catch {}
          } catch (err) {
            console.error('[DM] Auto-activate failed:', err);
            try { port.postMessage({ type: 'INIT_STATE', enabled: false, connected: false, pinnedUrl: pinnedTabUrl }); } catch {}
          }
        }, 300);
      }
    }).catch(() => { /* tab query racing SW teardown — no point logging */ });

    port.onDisconnect.addListener(() => {
      sidepanelOpen = false;
      if (pinnedTabId) {
        try {
          chrome.tabs.sendMessage(pinnedTabId, { type: 'DEACTIVATE_DESIGN_MODE' }).catch(() => {});
        } catch {}
      }
      pinnedTabId = null;
      pinnedTabUrl = null;
    });
  }
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

// Helper: forward message to pinned tab (or active tab as fallback)
async function forwardToPinnedTab(message: any, sendResponse: (response?: any) => void) {
  const tabId = pinnedTabId;
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
  // Messages FROM content script — just let them propagate to side panel
  if (msg.type === 'ELEMENT_SELECTED' || msg.type === 'STATE_UPDATE' ||
      msg.type === 'CHANGES_UPDATE' || msg.type === 'STYLE_APPLIED' ||
      msg.type === 'ANNOTATION_CREATED' || msg.type === 'TEXT_SELECTED' ||
      msg.type === 'SECTIONS_DETECTED' || msg.type === 'ANIMATION_STATE' ||
      msg.type === 'PROMPT_ANNOTATION' || msg.type === 'ELEMENT_HOVERED_INFO' ||
      msg.type === 'COMMENT_BUBBLE_CLICKED' || msg.type === 'OPEN_COMMENT_FOR_SELECTED') {
    return false;
  }

  // Side panel is closing — immediately deactivate design mode on the pinned tab
  if (msg.type === 'SP_PANEL_CLOSING') {
    sidepanelOpen = false;
    if (pinnedTabId) {
      try { chrome.tabs.sendMessage(pinnedTabId, { type: 'DEACTIVATE_DESIGN_MODE' }).catch(() => {}); } catch {}
    }
    return false;
  }

  // Heartbeat from content scripts — answers "is the panel still open?"
  // so the content side can self-disable if the panel-close → DEACTIVATE
  // chain ever drops a message (e.g. SW spinning down). Keeps the page
  // clean even on the rare race.
  if (msg.type === 'IS_PANEL_OPEN') {
    sendResponse({ open: sidepanelOpen });
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
  if (msg.type === 'SP_APPLY_PRESET') {
    forwardToPinnedTab({ type: 'APPLY_PRESET', preset: msg.preset }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SAVE_PRESET') {
    forwardToPinnedTab({ type: 'SAVE_PRESET', name: msg.name, kind: msg.kind, props: msg.props }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_DELETE_PRESET') {
    forwardToPinnedTab({ type: 'DELETE_PRESET', presetId: msg.presetId }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_GET_PRESETS') {
    forwardToPinnedTab({ type: 'GET_PRESETS', category: msg.category }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_UPDATE_PRESET') { forwardToPinnedTab({ type: 'UPDATE_PRESET', presetId: msg.presetId, name: msg.name, styles: msg.styles }, sendResponse); return true; }
  if (msg.type === 'SP_GET_PAGE_TOKENS') { forwardToPinnedTab({ type: 'GET_PAGE_TOKENS' }, sendResponse); return true; }
  if (msg.type === 'SP_GET_MEDIA') { forwardToPinnedTab({ type: 'GET_MEDIA' }, sendResponse); return true; }
  if (msg.type === 'SP_APPLY_TOKEN') { forwardToPinnedTab({ type: 'APPLY_TOKEN', cssVar: msg.cssVar, property: msg.property }, sendResponse); return true; }
  if (msg.type === 'SP_EXPORT_PRESETS') { forwardToPinnedTab({ type: 'EXPORT_PRESETS' }, sendResponse); return true; }
  if (msg.type === 'SP_IMPORT_PRESETS') { forwardToPinnedTab({ type: 'IMPORT_PRESETS', json: msg.json }, sendResponse); return true; }
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
    forwardToPinnedTab({ type: 'EXPORT', format: msg.format, level: msg.level }, sendResponse);
    return true;
  }
  if (msg.type === 'SP_SCREENSHOT') {
    if (msg.target === 'viewport') {
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => sendResponse({ dataUrl }));
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
  if (msg.type === 'SP_SEND_TO_AGENT') { forwardToPinnedTab({ type: 'EXPORT', format: 'markdown', level: 'detailed' }, sendResponse); return true; }
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
  try {
    await injectContentScript(tabId);
    setTimeout(async () => {
      try { await chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_DESIGN_MODE' }); } catch {}
    }, 200);
  } catch {}
});

console.log('[Design Mode] Background service worker loaded.');
