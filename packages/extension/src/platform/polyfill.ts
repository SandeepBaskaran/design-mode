// Cross-browser WebExtension API shim. Chrome exposes only `chrome.*`;
// Firefox exposes promise-based `browser.*` natively. The polyfill wraps
// Chrome's callback APIs so `browser.*` returns promises in BOTH browsers,
// letting the rest of the codebase `await browser.*` uniformly.
//
// Import this FIRST in every entry (content, background, sidepanel) so the
// global `browser` exists before any other module touches it.
import browser from 'webextension-polyfill';

if (!(globalThis as { browser?: unknown }).browser) {
  (globalThis as { browser?: unknown }).browser = browser;
}

export { browser };
