# Analytics correction evidence

## Revision boundary

- Snapshot commit: `691029837965cbfe91ead3d2e1c0ccb8e6ecdee4`.
- Snapshot source: `eb32bcebc3b2d634bbd5b1abb6ce05ded836df36`.
- Both trees are exactly `9c9c072ca74ce1f908fb85866d32c743deaee4ae`.
- Apply the correction commit, not the snapshot commit, when integrating into a
  newer product tree; the snapshot deliberately includes the original worker's
  entire state and can revert unrelated later corrections.

## Corrections

- Authenticate analytics EVENT and STOP using exact runtime ID, extension
  scheme/host, panel pathname, and supplied sender origin. Tab-backed extension
  popouts are allowed; web/content-script URLs and mismatched identities are not.
- Generic command responses produce `command_acknowledged`, never feature
  completion. Empty/no-op responses are explicitly tested. The old `success`
  analytics outcome is rejected.
- Screenshot clipboard completion/failure follows the clipboard operation;
  download events describe initiation/failure to initiate only. Anchor click does
  not prove file save completion. Other clipboard/export paths remain unmeasured.
- Failed consent removal attempts a durable disabled record. A restarted sender
  rejects that record. When removal and fallback both fail, the UI warns that old
  consent can resume after restart and offers opt-out retry, even after a failed
  storage read. It does not promise a permanent stop during storage failure.
- No endpoint activation, SDK, tracking identity, or extra permission. Measurement
  remains aggregate-only, with a fresh random ID per event and no session IDs.

## Executed gates

All commands ran in the isolated correction worktree. No real telemetry receiver
was used.

- `npm run test:extension`: **169 tests passed, 0 failed, 31 suites**.
  Includes the actual loopback HTTP receiver test, sender identity cases,
  empty/no-op acknowledgement, both durable-write failure paths, restart behavior,
  unavailable-storage UI/retry, native Firefox dual consent, and six executions
  of the actual screenshot function with stubbed clipboard/download boundaries.
- Unconfigured `npm run build:extension`: passed with analytics environment values
  explicitly unset. Final `dist/` is a local directory, not a shared symlink;
  the mock project token is absent from the final default background bundle.
- Configured `DM_POSTHOG_HOST=https://analytics.invalid
  DM_POSTHOG_KEY=phc_local_test_only npm run build:extension`: passed. This was a
  build-only configuration; no request to that hostname was made. Afterwards the
  default unconfigured build was restored.
- `npm exec --no -- web-ext lint -s packages/extension/dist`: **0 errors,
  0 notices, 35 warnings** (merged-browser/API/content warnings remain).
- `HEADFUL=1 CHROME_BIN='<installed Chrome for Testing>' node
  packages/extension/tests/analytics-popout.mjs`: passed. Actual installed MV3
  fixture popup metadata contained `sender.tab`, exact chrome-extension origin
  and panel path with query. EVENT and STOP were accepted; mock capture count
  stayed at **1** after a post-STOP event. Uses production guard/transport modules,
  not the full installed Design Mode application. Only its report uses loopback.
- `node packages/extension/tests/analytics-firefox.mjs`: passed, actual Firefox
  MV3 native data-consent/storage gates, **3 checks, 0 analytics fetch calls**.
  Native-grant dialog interaction remains a manual gate.
- `git diff --check`: passed.

## Limitations and unsuccessful gates

- Headless installed Chromium popup probe timed out; switching the disposable
  fixture to headful Chrome for Testing produced the passing real metadata test.
- The existing five-mode Chromium DOM probe passed its first three modes with
  system Chrome before timeout. Chrome for Testing headless subsequently returned
  empty DOM. Do not report the entire DOM probe as passed. All consent variants
  passed the module-level tests; installed Chromium/Firefox probes passed above.
- Full extension TypeScript checking is not green: missing built shared declaration
  outputs (`TS6305`) plus errors in existing content/large-panel paths. No diagnostic
  referenced the analytics modules. Build and relevant tests passed; this is not
  a claim of a clean repository-wide typecheck.
- Review was direct, not independent; recursive delegation was prohibited.
- Existing CodeGraph 1.6.0 resolves an index from the primary checkout, not this
  worktree. It was not refreshed or treated as evidence for this correction.
- The inherited post-commit hook relinks extension dist to the primary checkout.
  The correction commit bypasses that hook for this invocation only to preserve
  build isolation; no shared/global hook configuration is changed.
