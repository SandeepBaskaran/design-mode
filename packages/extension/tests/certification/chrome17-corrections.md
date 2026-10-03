# Chrome 17 failed-expectation corrections

This is **correction evidence, not complete checklist certification**. The exact 17 historical failed IDs were read from `certification-combined/REPORT.md`, `matrix.json` and `QUEUE.md` in worker `subagent-sa-1-5dd737d0`. No checklist expectations were weakened or rewritten.

## Source and execution boundary

Base: `325b7126b1a67a3c795e1a964ef62ae85841ba73`. Fast-forwarded only the isolated correction worktree to that revision. At seeding, comparison of tracked files against the live integration found only `.gitignore` different. The 101 extension/shared source, manifest and build-input hashes in [chrome17-provenance.json](chrome17-provenance.json) match the live integration byte-for-byte; final source and all nine built dist files are also recorded there.

Built the extension locally. Every final invocation explicitly set `DM_EXTENSION_DIST` to this worktree's fresh build, overriding a stale inherited environment value. Chrome for Testing 151 loaded the real unpacked extension with service worker, content script and bound extension-panel tab. Disposable profiles, loopback fixture and denied external network only. No website build, production access, personal profile, source-checkout write, remote push or dependency installation.

The final parent reran both regression modules after combining the selection correction and panel correction. Results and baseline observations are retained by ID in [chrome17-results.json](chrome17-results.json). Selection worker's detailed causal report is [selection-corrections.md](selection-corrections.md).

## Exact outcomes

“Corrected” below means the reported failed expectation now passes its targeted installed-browser regression. It does not promote an incompletely exercised checklist row to a full pass.

| ID | Classification and current observation | Boundary |
|---|---|---|
| 0.5.3 | Corrected: HSL formatting branch was absent. HEX/RGBA/HSL now checked on heading, bordered card and solid-fill box, without creating style edits. | Other collapsed colour editors/types not exhaustive. |
| 0.10.14b | Harness drift: historical test used Meta-click + Delete key. Documented Shift-selection + action-row Delete passes baseline and final, including two targeted records, clear selection and structural undo/redo. | Two siblings; physical keyboard Delete not certified. |
| 1.5 | Corrected: ancestor breadcrumbs were omitted from rendering; nested path is visible again. | Display, not breadcrumb navigation. |
| 1.14 | Corrected: inspector mouseout cleared resize guides. Live dimensions, size fields, handles and guides remain during resize. | Default orange only. |
| 1.15 | Corrected: Resize label and atomic corner/edge undo/redo restored. | CSS response checked; export button/clipboard not tested. |
| 1.21 | Corrected: Move label and atomic offsets undo/redo restored. | Same export limitation. |
| 1.23 | Corrected: pre-held Shift no longer prevents axis-locked drag; both axes exercised. | Trusted browser input, not physical macOS keys. |
| 1.24 | Corrected: static-to-relative promotion and both offsets undo/redo together, with no residual Changes on undo. | Paragraph fixture. |
| 1.25 | Corrected: multi-element drag history is atomic and trailing click preserves selection. | Two elements; Alt bypasses snapping. |
| 1.29 | Corrected: responsive-mode explanation includes automatic restoration; actual return from touch emulation verified. | CDP emulation, not native DevTools toolbar. |
| 2.13 | Corrected: style response captured pre-paint computed styles, overwriting newer toggle state. Response now waits for the USER-origin style queue before taking the snapshot. | Baseline reproduced stale underline + strike. Final run: ten rounds of all four on/off toggles, 80 trusted clicks; not an arbitrary timing guarantee. |
| 2.17 | Corrected: typing in the focused picker hex field never reached the obsolete input-trigger search handler. Non-colour query now filters site tokens there. | `primary` remains and `brand` is excluded; fixture adds a real primary token rather than allowing an empty-list pass. |
| 3.3 | Corrected: per-side CSS border controls were no longer rendered. Restored existing 2×2 renderer in Stroke. | CSS border widths, not shadow-stroke sides. |
| 3.4 | Corrected: linked side writes now use canonical batch routing, including numeric clamp/keyboard paths, and atomic undo/redo. | Round link stays at grid's right edge, not historical “centre” wording. |
| 3.5 | Corrected: unlinking permits a right-only edit without changing other sides. | Four computed widths asserted. |
| 3.9b | Corrected: same pre-paint response race left an old alignment dot highlighted. Auto shows zero active dots; Fixed restores right-bottom alignment. | Row flex main-axis exercised; grid/cross-axis permutations not exhaustive. |
| 3.11 | Corrected: initial `auto` rendered without numeric metadata. Letters now blocked while decimal editing remains possible; integer 12 paints. | Decimal editing is not valid fractional CSS z-index rendering. |

Borders 3.3–3.5 were not dismissed as checklist drift: the existing control/handler implementation was orphaned and independent CSS border widths had no replacement UI. Restoring that capability preserves the acceptance behavior. The minor link-position wording is explicitly retained as a limitation.

## Root-cause regression detail

- `content/index.ts`: `APPLY_STYLE` / `APPLY_STYLES` used to build `updatedInfo` synchronously before background USER-origin CSS insertion. Delayed response delivery could then overwrite the correct paint notification with old computed styles. Both now await `whenUserStylesPainted()` and construct the info at response time. Batch history follows recorded intent, including reversions, and uses one existing gesture entry instead of comparing computed styles before asynchronous paint.
- `content/user-styles.test.ts`: verifies the completion barrier stays pending across coalesced/in-flight updates and resolves only after the last acknowledgement.
- `sidepanel/sidepanel.ts`: restores missing HSL display conversion and border-width rendering; routes linked sides before early numeric/variable branches; wires focused picker query; keeps numeric metadata when z-index starts at `auto`.
- Baseline panel run against an independent local archive/build of exact `325b712` reproduces all eight panel expectations. Final panel run passes all eight; linked-border undo/redo is an added stronger assertion.

## Verification

- Extension build: exit 0.
- Installed `panel-corrections.cjs`: eight targeted regressions pass; panel viewport 420×900. Border controls visually inspected at both wide and narrow widths, without clipping/overlap.
- Installed `selection-corrections.cjs`: nine assigned regressions have no failed assertion; four retain partial-row flags. Supplemental 1.31 is not included in the 17-row tally.
- Extension unit suite: **186 pass, 0 fail**.
- Safe evaluator harness suite: **4 pass, 0 fail**.
- Typecheck: baseline and final each have **29 pre-existing diagnostics**; normalized diagnostic comparison found no new diagnostic. Typecheck is not claimed clean.
- Syntax and `git diff --check`: pass.
- Direct diff/causal review performed; no independent-model review claimed. Shared Git hooks/CodeGraph setup were not changed because their Git common directory lies outside the allowed worktree.

## Re-run

From the correction worktree, with existing Playwright dependencies provided via `NODE_PATH` and `CHROME_BINARY` pointing at Chrome for Testing:

```sh
npm run build:extension
DM_EXTENSION_DIST="$PWD/packages/extension/dist" \
DM_CERTIFICATION_MODULE="$PWD/packages/extension/tests/certification/panel-corrections.cjs" \
DM_CERTIFICATION_FIXTURE="$PWD/packages/extension/tests/certification/panel-corrections-fixture.html" \
DM_ACCEPTANCE_OUT="$PWD/panel-correction/retest" \
node packages/extension/tests/acceptance-installed.cjs chrome
```

Run the selection module analogously with `selection-corrections.cjs` and `selection-fixture.html`. Raw screenshots, logs and baseline archive remain task-local under `panel-correction/`; no runtime archives or dependencies belong in the correction commit.
