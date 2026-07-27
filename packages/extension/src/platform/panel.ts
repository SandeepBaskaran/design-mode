// Cross-browser side-panel control. Chrome uses `chrome.sidePanel`;
// Firefox uses `browser.sidebarAction` (a different API with a different
// lifecycle). Both open calls must run inside a user-gesture stack.
import { IS_FIREFOX } from './target';

type SidebarAction = {
  open: () => Promise<void>;
  close: () => Promise<void>;
  toggle: () => Promise<void>;
};

function sidebarAction(): SidebarAction | undefined {
  return (globalThis as { browser?: { sidebarAction?: SidebarAction } }).browser?.sidebarAction;
}

// Open the panel for a specific tab (Chrome) / the active window (Firefox).
export async function openPanel(target: { tabId?: number; windowId?: number }): Promise<void> {
  if (IS_FIREFOX) {
    await sidebarAction()?.open();
    return;
  }
  if (!chrome.sidePanel) return;
  if (target.tabId != null) await chrome.sidePanel.open({ tabId: target.tabId });
  else if (target.windowId != null) await chrome.sidePanel.open({ windowId: target.windowId });
}

// Make the toolbar button open the panel on click. Chrome needs an explicit
// call; Firefox's `sidebar_action` manifest key wires the button natively.
export function enableActionOpensPanel(): void {
  if (IS_FIREFOX || !chrome.sidePanel) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
