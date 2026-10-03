// Cross-browser side-panel control. Chrome uses `chrome.sidePanel`;
// Firefox uses `browser.sidebarAction` (a different API with a different
// lifecycle). Both open calls must run inside a user-gesture stack.
import { IS_FIREFOX, IS_SAFARI } from './target';
export { createFirefoxDock } from './firefox-dock';

type SidebarAction = {
  open: () => Promise<void>;
  close: () => Promise<void>;
  toggle: () => Promise<void>;
  isOpen: (target: { windowId: number }) => Promise<boolean>;
};

const targetWindows = new Map<number, number>();
if (IS_FIREFOX) {
  browser.tabs.onAttached?.addListener((tabId, info) => {
    if (targetWindows.has(tabId)) targetWindows.set(tabId, info.newWindowId);
  });
  browser.tabs.onRemoved?.addListener((tabId) => targetWindows.delete(tabId));
}

export async function preparePanelTarget(tabId: number): Promise<void> {
  if (!IS_FIREFOX) return;
  const tab = await browser.tabs.get(tabId);
  targetWindows.set(tabId, tab.windowId);
}


function sidebarAction(): SidebarAction | undefined {
  return (globalThis as { browser?: { sidebarAction?: SidebarAction } }).browser?.sidebarAction;
}

// Open the panel for a specific tab (Chrome) / the active window (Firefox).
export async function openPanel(target: { tabId?: number; windowId?: number }): Promise<void> {
  if (IS_SAFARI) return;
  if (IS_FIREFOX) {
    const sidebar = sidebarAction();
    if (!sidebar) throw new Error('Sidebar is unavailable');
    const windowId = target.windowId ?? (target.tabId == null ? undefined : targetWindows.get(target.tabId));
    if (target.tabId != null && windowId == null) throw new Error('Target window is not ready; retry docking');
    // open() has no target argument. Never race asynchronous focus against it.
    // Cross-window docking uses the deliberate two-gesture handoff instead.
    if (windowId != null || target.tabId != null) {
      throw new Error('Open Design Mode from the target window to finish docking');
    }
    await sidebar.open();
    return;
  }
  if (!chrome.sidePanel) return;
  if (target.tabId != null) await chrome.sidePanel.open({ tabId: target.tabId });
  else if (target.windowId != null) await chrome.sidePanel.open({ windowId: target.windowId });
}

// Make the toolbar button open the docked panel on click. Chrome needs an
// explicit call; Firefox's `sidebar_action` manifest key wires the button
// natively. Floating / PiP launch surfaces turn this off so `action.onClicked`
// can run `windows.create` instead.
export function setActionOpensPanel(open: boolean): void {
  if (IS_FIREFOX || IS_SAFARI || !chrome.sidePanel) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: open }).catch(() => {});
}
