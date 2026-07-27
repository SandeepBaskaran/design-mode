// Ambient globals injected at runtime.
//
// `browser` is the promise-based WebExtension API — webextension-polyfill on
// Chrome, native on Firefox. We type it as `typeof chrome` (@types/chrome):
// the API surface is identical and Chrome's MV3 types already model the
// promise return values, so existing call sites type-check unchanged. The few
// Chrome-only APIs (sidePanel, storage.session.setAccessLevel) stay on the
// `chrome` global; Firefox-only `sidebarAction` is accessed via a cast in
// platform/panel.ts.
declare global {
  const browser: typeof chrome;
}

export {};
