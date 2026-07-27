// Runtime browser detection. A single bundle serves both Chrome and Firefox
// (one shared dist/), so this is decided at runtime, not build time. `browser`
// (webextension-polyfill) is API-compatible across both; only a few surfaces
// differ (side panel vs sidebar, pop-out/PiP are Chrome-only) and gate on this.
//
// UA is the one signal available in every context (background worker/event
// page, content script, sidebar/panel); `sidebarAction` presence is a
// belt-and-suspenders confirmation where the browser namespace is reachable.
const uaFirefox =
  typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
const hasSidebarAction =
  typeof (globalThis as { browser?: { sidebarAction?: unknown } }).browser?.sidebarAction !== 'undefined';

export const IS_FIREFOX = uaFirefox || hasSidebarAction;
export const IS_CHROME = !IS_FIREFOX;
