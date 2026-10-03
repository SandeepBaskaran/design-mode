# Reconciled reliability and installed acceptance corrections

## Apply only the correction commit

The exact working extension source from integration HEAD `184be9e5baa40665fe9c0e4d5ab1e630d17591ab` was copied into this isolated worktree. All 105 tracked/nonignored extension files were SHA-256 checked against the source. Seed commit: `d30565e`. **Do not apply that seed.** Its correction child includes BOTH `8a4adc8` reliability and `2f54096` acceptance changes.

`reconciliation-evidence/seed-sha256.json` records the input inventory (SHA-256 `0b0f608d1a0ed5a6d135b075f4a79d6da1155eda95fda4ee5b0a8f1f1aa3818b`). No integration, primary checkout, CLI or website files were edited. No reset, push, release, shared-hook write or recursive delegation occurred.

Reliability applied cleanly outside background/index.ts. That file was deliberately compared to the final acceptance worker source: additions provide disconnected-port guards, user-origin CSS dispatch and navigation generation/page state without removing integration's `311ef98` sender/target guards. Final production `src` is byte-identical to `2f54096`; broker-security tests remain unchanged. This is a correction-only diff against the exact seed.

## Behavior

- User-origin CSS rules and document-local queues preserve override/preview behavior. Unique nonpositional selectors safely rebind remounted edited nodes; ambiguous identities stay unbound.
- Activation generations reject stale replay, shortcut, comment and transport completion after disable. Disconnected panel ports cannot bind or schedule later activation.
- Body is a valid saved selector. Internal replay repairs legacy empty body locations; external imports remain strict.
- Bound panels reset navigation context, publish complete changes/comments and reject stale tab/frame/URL messages. Restricted Firefox pages settle to an unavailable notice and recover on return.

## Fresh execution on the reconciled source

| Command | Result |
| --- | --- |
| `npm run test:extension` | 184 passed, 0 failed |
| `TSX_TSCONFIG_PATH=packages/extension/tsconfig.json node --import tsx --test packages/extension/src/content/broker-security.test.ts` | 5 passed, 0 failed |
| `npm run build:extension` | Three production bundles built |
| `web-ext lint -s packages/extension/dist` | 0 errors, 0 notices, 33 existing merged-manifest/API/innerHTML warnings |
| `node packages/extension/tests/reliability-browser.mjs` | 20 passed: real Chromium DOM/CSSOM, actual lifecycle callbacks, mocked extension APIs |
| `node packages/extension/tests/acceptance-installed.cjs chrome` | 14 passed: Chrome for Testing151, real unpacked extension, bound extension-panel tab |
| `node packages/extension/tests/acceptance-installed.cjs firefox` | 16 passed: Firefox156.0, temporary add-on and native sidebar; geckodriver0.37.1 |
| `git diff --check` | Passed |

Installed checks exercise five mixed edits (font, opacity, radius, hide, delete), reload, legacy replay, comments across path/query/hash/reload and pushState, return navigation, child frames, and actual Markdown export. Firefox also exercises about:addons and recovery. Fresh result JSON, seed inventory and built-JS hashes are in `reconciliation-evidence/`. Logs/screenshots remain task-local under `.certification-local/`.

## Portable rerun and fixture correction

Build from repository root. Supply installed `selenium-webdriver` and `playwright` through `NODE_PATH`, plus `GECKODRIVER` and `CHROME_BINARY`. Firefox defaults to `/Applications/Firefox.app/Contents/MacOS/firefox`; override `FIREFOX_BINARY` as needed. `DM_ACCEPTANCE_OUT` chooses artifacts; `DM_EXTENSION_DIST` chooses another built dist; `DM_ACCEPTANCE_SCENARIO=navigation` restricts the scenario.

Installed runs use disposable profiles, block nonlocal HTTP/HTTPS through a dead loopback proxy and close fixture/browser in finally. The component runner uses `CHROME_BIN` or installed Google Chrome. Chrome for Testing151 produced no dump-dom fixture output on this machine; regular Google Chrome passed all20 component assertions. The independent Playwright installed Chrome acceptance run passed.

The old `reliability-installed-firefox.mjs` is intentionally omitted: it impersonates a privileged panel from a content script, violating preserved sender guards. Do not weaken production security to revive that fixture. The included component fixture now supplies a valid privileged-panel sender, imports the actual sender validator, and supplies the acceptance navigation-generation context.

## Limits

Headless native Firefox sidebar and Chrome bound-panel testing is not physical keyboard/pointer certification, signed-store installation or native docked Chrome side-panel testing. Computed style/replay evidence does not establish visual paint equivalence. Real worker suspension/restart, full multi-tab lifecycle, permission-denial handling, production MCP sends, full website/monorepo checks and release certification were not performed. Direct review only; no independent reviewer or shared CodeGraph hooks were used because all writes were restricted to this worktree.
