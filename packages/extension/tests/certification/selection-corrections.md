# Chrome selection corrections against 325b712

## Result

All nine assigned IDs were exercised in an installed unpacked extension, using a disposable headless Chrome 151 profile, localhost fixture, blocked outbound networking, trusted Playwright mouse/keyboard input and real extension messaging. Chrome's panel document runs in a bound extension tab, **not the native docked side-panel shell**. These are not physical macOS keyboard or Web Store package tests.

The source-built 325b712 baseline fails eight assigned rows. The correction build has zero failing assertions. `0.10.14b` is harness drift, not a reproduced source defect. The committed `selection-corrections-results.json` preserves per-row baseline/final statuses. Partial statuses deliberately preserve the unexercised surfaces below rather than overclaiming full manual certification.

| ID | Classification and verified outcome | Remaining limitation |
|---|---|---|
| 0.10.14b | Harness drift. Original suite used Meta-click + Delete key, while the documented row requires Shift range selection + action-row Delete. Both source baseline and correction pass the documented path: two targeted DOM deletions, selection clears, Changes visible, undo restores exact sibling order with no duplicates, redo removes both, second undo restores. No deletion source change. | Two sibling fixture elements; arbitrary nested/overlapping selections not covered here. Bound panel tab. |
| 1.5 | Defect: supplied ancestor data was never rendered. Escaped, labelled breadcrumb path now shows body › main#main › section#pair › article#card1 › button#button1. Screenshot inspected. | Display only; breadcrumb navigation was not required or added. |
| 1.14 | Defect: inspector mouseout cleared resize-owned guides when a moving handle crossed the pointer. Hover handlers now yield while resizing. Live 140×110 geometry, eight handles, W/H fields, dimension label, disabled transition and four orange guides verified. Live screenshot inspected. | Native docked shell not exercised; default guide colour only. |
| 1.15 | Defects: Changes renderer excluded Move/Resize metadata; history stored each dimension separately. Resize now displays as a subgroup and undoes/redoes both dimensions as one gesture. CSS response contains both dimensions; east-edge resize records width alone and also undo/redoes. | Export asserted through real SP_EXPORT response, not native Export CSS button/clipboard/download. |
| 1.21 | Same grouping/history defects. Visible Move subgroup, one shared group ID, left/top CSS response, atomic undo and redo verified. | Export button/clipboard/download not exercised. |
| 1.23 | Defect: pre-held Shift returned before arming drag. Selected members can now cross the normal drag threshold; Shift-click still falls through below threshold. Both horizontal and vertical lock verified. Trailing drag click suppression moved to window capture so the document inspector cannot toggle/collapse selection first. | Fixture geometry and trusted browser input, not physical modifier keys. |
| 1.24 | Same grouping/history defects plus offset history captured before static promotion disagreed with tracker baseline. Snapshot offsets after promotion, undo offsets before position. Relative promotion, panel X/Y, three records, visible Move label, complete undo to static/no changes and redo verified. | Static paragraph fixture; other authored positioning patterns not exhaustive. |
| 1.25 | Defect: multi-element gesture split into property-level undo entries. One history entry now restores both elements, redo moves both again, and multi-selection survives the drag's trailing click. | Two selected elements with Alt bypassing snap; group snapping not certified. |
| 1.29 | Defect: guide omitted auto-return explanation. Chrome-specific bullets, no tabs, Continue anyway and automatic-return note verified. Additional 1.31 toggles hover capability off/on/off and verifies automatic restoration without reload. Guide screenshot inspected. | Real CDP touch/media emulation, not native DevTools device-toolbar interaction. |

## Reproduce

Run from the correction worktree with available Playwright and extension build dependencies. Explicitly set **DM_EXTENSION_DIST**: an inherited value can otherwise silently load another worktree's build.

```sh
npm run build:extension
DM_EXTENSION_DIST="$PWD/packages/extension/dist" \
DM_CERTIFICATION_FIXTURE="$PWD/packages/extension/tests/certification/selection-fixture.html" \
DM_CERTIFICATION_MODULE="$PWD/packages/extension/tests/certification/selection-corrections.cjs" \
DM_ACCEPTANCE_OUT="$PWD/selection-correction/final" \
CHROME_BINARY='/Users/sandeepbaskaran/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
node packages/extension/tests/acceptance-installed.cjs chrome
npm run test:extension
```

The regression module writes per-row JSON/page/panel screenshots, continues after each failure to collect complete evidence, and then exits nonzero if any assertion failed. It uses the harness's structured evaluator-backed `send`, not string evaluation.

## Verification and retained evidence

- Extension-only build succeeds. No website build, production request or personal profile used.
- Installed final regression exits 0: all nine assigned rows plus automatic-return 1.31 execute without failed assertions.
- Full extension unit suite: **186 tests passed, zero failed**.
- `node --check` and `git diff --check` succeed.
- Typecheck remains blocked: baseline and correction each have 29 diagnostics; normalized comparison finds **zero new diagnostics**. Includes missing shared declarations and existing ElementInfo/childGap errors. Not silently fixed.
- Direct diff review only; no independent reviewer available to this leaf task.
- Graph/hook setup and skill-store edits intentionally deferred: this task permits writes only inside the isolated worktree, not shared Git hooks, global tools or the user's skill store.

Raw artifacts are retained, uncommitted, under `selection-correction/325b712/` and `selection-correction/final/`; each contains `rows.json` and per-ID JSON/PNGs. `selection-correction/unit-tests.log` and the two `typecheck*.log` files retain tool output. The baseline source archive/build is task-local under `selection-correction/base-source/`.

The first two diagnostic runs (`baseline/`, `corrected/`) inherited an older DM_EXTENSION_DIST and are **not authoritative 325b712/final evidence**. The explicit source-baseline rerun initially lacked archived icons and could not start its extension worker; including the baseline icons fixed that harness setup. Only `325b712/` and `final/` underpin the results above.
