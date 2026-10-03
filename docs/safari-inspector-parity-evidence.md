# Safari Inspector parity: bounded evidence

Target supplied by the native-test owner: Safari 27.0.1. This worker did not control Safari. Source is the exact `browser-parity-seed.zip` manifest (all seed hashes verified), not branch HEAD. No new surfaces, permissions, network calls, or file-scheme eligibility.

## Implemented

1. **Deferred text exports retain the clipboard gesture.** `inspector/clipboard.ts` supplies a promised `text/plain` Blob to `ClipboardItem` and calls `navigator.clipboard.write` synchronously. Empty/failed/stale exports reject rather than replacing the clipboard with empty text; missing APIs and denied gestures return failure. Required, separately exported `safari-required-glue.patch` wires this into Copy prompt and the Inspector-focused Export CSS shortcut. The seed awaited `SP_EXPORT` before `writeText`, which loses Safari's gesture. The glue retains `operation.wait` target-epoch validation and does not alter Chrome/Firefox's clipboard path. **Apply glue with the helper; helper alone does not fix the UI.**
2. **Oversized captures/exports fail explicitly.** The Inspector bridge formerly dropped replies beyond its existing payload limit, leaving capture/export pending until timeout. It now returns a bounded error immediately and displays the current-generation Inspector error. The limit is unchanged; this does not add large-image capture support.
3. **Local-file protection is regression-tested.** File, Safari-internal, and blank URLs cannot bind or dispatch through the Inspector bridge. No eligibility widening.

## Audit / public evidence

Retrieved during this audit:

- [Apple: Adding a web development tool to Safari Web Inspector](https://developer.apple.com/documentation/safariservices/adding-a-web-development-tool-to-safari-web-inspector): Safari 16+, `devtools_page`, `devtools` permission, unconditional panel creation, per-target website permission. Read the documentation's public JSON representation because its HTML extraction included substantial navigation.
- [Apple WWDC22: Create Safari Web Inspector Extensions](https://developer.apple.com/videos/play/wwdc2022/10100/): Inspector contexts have DevTools and only limited content-script APIs; each Inspector has a separate instance. Ordinary API compatibility is not proof of Inspector namespace availability. Existing runtime-only facade retained; no `inspectedWindow.eval` workaround.
- [Apple: Managing Safari web extension permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions): least-privilege website permission model. No demonstrated local-file injection permission in this audit.
- [WebKit: Async Clipboard API](https://webkit.org/blog/10855/async-clipboard-api/): `text/plain` and `image/png`, promised Blob representations, secure contexts, write during user gesture, and later writes rejecting earlier pending writes. The seed's promised PNG implementation already follows this guidance. New helper applies it to the two deferred text-export paths; direct text-copy buttons already call `writeText` in the event stack.
- [MDN captureVisibleTab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureVisibleTab): capture targets the active tab in the specified window. Existing background capture explicitly requests PNG and checks the active target before/after capture; existing content code hides overlays and restores them.
- Current public [MDN BCD tabs.json](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/tabs.json): Safari `captureVisibleTab` since 14; default JPEG. Existing explicit PNG choice is necessary.
- Current public [MDN BCD downloads.json](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/downloads.json): Safari `downloads.download` is `version_added: false`. Do not add a downloads namespace or permission to the Inspector facade. Existing anchor download is a request, not proof that Safari saved a file.
- Current public [MDN BCD commands.json](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/commands.json): Safari `commands.onCommand` since 14. This says nothing about a physical shortcut reaching the Inspector or preserving a gesture across runtime messaging.
- Current public [MDN BCD extension.json](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/extension.json): Safari `isAllowedFileSchemeAccess` partial support, always false. This is not evidence to enable file injection.

## Supported / unsupported / unverified

| Area | Classification and boundary |
| --- | --- |
| Automatic HTTP(S) active-page targeting, same-page repick, focus invalidation, close/reopen | Existing architecture preserved; bridge regressions pass. Actual Safari acceptance remains native-owner evidence. |
| Screenshot viewport/element pipeline | Implemented in seed via background capture, not Inspector `tabs`; PNG helper already synchronous. Real pixels, crop, overlay restoration and permissions unverified here. |
| Copy prompt / Inspector-focused CSS export | New gesture-preserving helper plus required glue; unit tests, typechecks and integrated Safari build pass. Native clipboard read-back unverified. |
| Direct text-copy buttons | Already synchronous; no independently evidenced code change needed. Native read-back unverified. |
| Screenshot clipboard from Inspector click | Existing promised PNG path retained; native clipboard acceptance unverified. |
| Screenshot command / page-focused shortcuts | Command and content handlers exist. Messaging does not establish clipboard user activation. Do not claim clipboard parity for page/background-triggered actions; use Inspector click to test direct gesture. |
| Screenshot/image/JSON download | Existing anchor request retained; actual saved file unverified. `downloads.download` is unsupported by current BCD, not a safe fallback. |
| Shortcut preferences | Existing local-storage facade and scoped live shortcut notification retained. Focused physical-key delivery, IME/Option conflicts, and browser-command duplication need native testing. |
| file:// | Intentionally unsupported by product eligibility; actual Safari permission/injection capability unverified. Test fails closed. Serve a synthetic fixture over HTTP for supported testing. |
| Floating / PiP / native sidebar / native Elements selection | Outside this Inspector surface; no new implementation or parity claim. |

## Verification

All install/test/build commands used `DM_ISOLATED_BUILD=1` and asserted non-symlink dependency/output directories. Dependencies installed locally with `npm ci --ignore-scripts --no-audit --no-fund`.

- RED: oversized reply regression failed because the request was still pending until fixture disconnect; no bounded error had arrived.
- GREEN: `npm run test:extension`: **447 passed, 0 failed** (seed 442 plus five new tests).
- `npm run typecheck:extension`: pass.
- Required glue: `git apply --check safari-required-glue.patch`: pass.
- Isolated integration fixture `.safari-glue-validation`: copied source + required glue; shared declarations and extension TypeScript checks pass; `node .safari-glue-validation/packages/extension/build.mjs --safari`: pass. This is not installed Safari evidence. Fixture is not a distributable installation package (it intentionally omits root icon assets).
- Direct self-review only (children prohibited): no broadened message/storage allowlists, no target selection changes, no permissions or evaluated-code path. New text-copy promises are epoch-checked before resolving clipboard data. Existing PNG helper unchanged.

## Native owner protocol (not executed here)

1. Apply `safari-owned.patch` and `safari-required-glue.patch` against the seeded parent source; rebuild isolated Safari output and load/reload using the parent's established workflow. Verify the loaded build identity before testing. Use a synthetic HTTP(S) fixture only.
2. Open docked Web Inspector → Design Mode. Verify automatic page binding. Pick twice on the same page; edits and Copy prompt should not cancel. Focus out/in without changing pages; state must remain. Switch pages/windows and ensure stale operations cannot mutate or copy the prior page. Close Inspector while active and while binding; reopen and verify overlays deactivate/rebind as before.
3. Make one synthetic style edit. Click Copy prompt; paste into a disposable text field and compare the actual text to the site-wide export. Repeat with a deliberately delayed export; success requires actual pasted content, not the button label. Switch targets during export: no stale clipboard replacement or success flash.
4. Focus a non-editable area of the Inspector; press the configured Export CSS shortcut, then paste and compare CSS. Repeat with a text input focused (must not hijack typing). Separately test Option glyphs, IME composition, and page focus; record these separately from browser-command delivery.
5. Screenshot Capture = Clipboard: click the Inspector screenshot button for viewport and element; paste into a disposable image-capable target and inspect pixels/crop/absence of overlays. Repeat after tab switch and close/reopen. Try Download and Both; verify an actual PNG file and contents, not just “Download requested.” Test denied clipboard access without treating a download request as successful clipboard copy.
6. Press capture shortcut with page focus, then Inspector focus. Record capture count and clipboard/download results separately. A runtime command has no guaranteed Inspector user gesture; failure here does not invalidate the direct-click path. Do not invent gestures or add new UI surfaces.
7. Try a sufficiently large synthetic image response in a fixture to exceed the existing bridge limit: expect an immediate clear size error, not a 15-second silence. Smaller viewport/selection should still work.
8. Open a disposable local HTML file: Inspector must reject it with HTTP(S) guidance. If considering future file support, separately document actual Safari extension permission availability and successful isolated content-script injection first; merely loading an HTML file in Safari is not evidence.
