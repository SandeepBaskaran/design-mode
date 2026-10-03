# Extension feature/security certification inventory — NOT CERTIFIED

## Scope and verdict

Audited base commit `184be9e5baa40665fe9c0e4d5ab1e630d17591ab` in the assigned isolated worktree. Application source was read-only. Only this certification directory is committed. Local MCP compiler output was generated inside this worktree. No production services, cloud tenants, user browser profile or external records were changed.

**The existing 13-check gate is a prerequisite, not full certification.** Its previous pass is parent-provided context, not a new execution here. This audit cannot certify every feature, store package, target browser or security boundary. It found additional release risks. Fixing the already-owned cloud tenant/UTF-8, comment concurrency/save-error, rich-text href and PR69 selector work does not automatically close these findings. Those other workers' changes are not present in the audited base and are not certified here.

## Calculated coverage

`counts.json` is the machine-generated accounting authority; `build-inventory.py` reproduces the CSVs from the four requested documents and actual source.

| Evidence bucket | Count | Meaning |
|---|---:|---|
| Manual E2E checklist rows | 429 | Every row is explicitly **UNTESTED** in `manual-inventory.csv` |
| Installed-extension manual passes / failures | 0 / 0 | No complete manual row was performed; adverse component probes are separate |
| Extension/MCP manual rows | 397 | Includes Chrome lifecycle, properties, persistence and transports |
| Firefox-specific manual rows | 14 | All untested; not a substitute for rerunning shared features on Firefox |
| Website manual rows | 18 | All untested |
| Documentary catalogue entries | 1,268 | 284 FEATURES + 542 DESIGN-PANEL + 442 PARITY |
| Catalogue entry types | 229 sections, 224 bullets, 815 table claims | Traceable source claims, **not 1,268 unique features**; overlaps and intentionally skipped features retained |
| Implementation surface entries | 148 | 47 source modules + 92 uppercase switch/message cases + 9 local MCP tool registrations |
| Extension focused tests | 110 passed / 0 failed | Node logic/fake-DOM tests, not browser certification |
| Local MCP tests after build | 52 passed / 0 failed | Includes real local sockets/child processes, mocked browser peer; not extension E2E |
| Additional real Chromium component probes | 11 completed | 3 controls behaved as expected; 8 adverse observations; extension **not installed**, APIs/storage mocked |

No aggregate "percent of all features passed" is meaningful: documentary claims, test cases and API cases overlap, and the manual matrix does not exhaust permutations. The manual row coverage is exactly **0/429**. Documentary extraction includes all table data rows, section headings and bullet starts, with wrapped bullet continuations; prose remains reachable through section/file references. Implementation inventory is a source/message index, not a claim that every branch has a test.

## Evidence and execution limitations

- `extension-tests-node-import.log`: 110/110 passed with the assigned worktree source.
- `mcp-build.log`, `mcp-tests-after-build.log`: successful local MCP build followed by 52/52 passing tests.
- `browser-probes-results.json`, `browser-probes-dom.html`: actual headless Chrome 153 rendered DOM/CSS and benign event-handler marker results. `browser-probes.html` imports actual bundled modules through `probe-entry.ts`; there is no rewritten substitute implementation.
- `browser-stderr.log`: Chrome completed and emitted the full DOM including all 11 results but did not exit within 25 seconds; the runner terminated it. An earlier 60-second launch also timed out before its output was preserved. This is **component-browser evidence**, not a clean browser-process gate or installed-extension run.
- `extension-tests.log` / `mcp-tests.log`: first retained CLI attempts failed because TSX's IPC Unix-socket path exceeded macOS limits under the long worktree-local TMPDIR. `node --import tsx --test` avoided that CLI socket; no product patch was needed.
- `mcp-tests-node-import.log`: intermediate run had 41 pass, 2 fail and 9 cancelled because the dedicated worktree did not yet contain local MCP dist. This was resolved by building and rerunning; do not report the intermediate artifact failures as application defects.
- No visual screenshots, physical keyboard events, browser permission prompts, background suspension, popup/PiP docking, installed package, Firefox or production-cloud requests were exercised.

## Actionable findings

Paths below are relative to the repository root at the audited commit. Security findings are **reproduced in an isolated component-browser fixture**, not human-confirmed vulnerabilities in a deployed extension. Human review and an installed-extension repro are required before public vulnerability claims.

### F01 — P1 — Imported HTML can execute page-context event handlers

**Evidence:** `packages/extension/src/content/change-tracker.ts:574-592`; `packages/extension/src/sidepanel/sidepanel.ts:12227-12249`; `packages/extension/src/content/index.ts:1858-1873`. Browser probe P02 set the benign document marker to `executed` using imported `isHtml: true` text with an invalid data-image and `onerror`.

**Repro:** import a `kind: design-mode-changes` JSON containing a text record targeting an existing element, `isHtml:true`, and event-bearing `newText`. The file input validates only the envelope and array types; the tracker assigns raw innerHTML. No network/exfiltration was performed. Execution was in the inspected page, **not** the extension's privileged panel; extension CSP does not sanitize inserted page HTML. DOM `outerHTML` reconstruction (`:533-547`) is a sibling sink needing the same review.

**Impact:** a shared changes file is treated as data but can carry active content into the current inspected origin. Applicable page CSP/Trusted Types can affect exploitability. Safe rich-editor seed/href validation does not cover this import/replay path.

**Smallest durable fix:** validate a typed import schema before mutation and sanitize untrusted HTML/attributes with a policy appropriate for reconstructable page structures; distinguish trusted internal snapshots from external files. Regression-test both old/new text, inserted/duplicated/deleted outerHTML, preview and revert. Require an installed-extension benign repro and human security review.

### F02 — P2 — Imported style value escapes the target declaration into arbitrary rules

**Evidence:** tracker `:326-387`, especially `:350-353`; probe P03. Imported `color: red; } #b { opacity: 0.123; } /*` intended for `#a` changed unrelated `#b` opacity to `0.123`.

**Impact:** the element-scoped editing boundary is not preserved for imported/unvalidated style values; broader styling and CSS resource loads become possible. This does not establish JavaScript execution. By contrast, the token CSSOM control P09 preserved `#b` opacity=1.

**Fix/verification:** use validated property/state/id fields and CSSOM `setProperty` rather than concatenated declaration text; reject selector/state breakout. Test malicious values through import and agent apply, base and variant rules, and token scope selectors. Keep valid complex CSS/token expressions working.

### F03 — P2 — Forward DOM move replay is off by one

**Evidence:** tracker `:548-561`; probe P04 replayed source order `ABC`, moving A to saved final index 2, and got `BAC`, not `BCA`.

**Cause:** the destination siblings list still includes the source when calculating the insertion reference. The special case only handles `siblings[idx] === source`, not a source earlier than its destination.

**Fix/verification:** compute insertion references from siblings excluding the source (or adjust the index consistently). Exercise forward/backward same-parent moves, cross-parent moves, end insertion, consecutive moves, reload/import and revert.

### F04 — P2 — Author ID-specific !important defeats live override

**Evidence:** tracker `:339-353`; P05 applied opacity 0.5 to an element with `#a {opacity:0.9 !important}`; actual opacity remained 0.9. Two attribute selectors do not outrank an ID selector.

**Impact:** a tracked edit can silently not paint on real design-system pages. The canary warning is not a repair. The comment claiming that generated overrides beat page !important is too broad.

**Fix/verification:** define a reliable override policy (including author layers, inline !important and supported animation interactions), or surface a clear unsupported/no-op state rather than claiming success. Test the chosen policy in real CSSOM/browser fixtures.

### F05 — P2 — SPA replacement drops data-id-scoped styles

**Evidence:** tracker `:119-127`, `:438-439`; P06 replaced an edited node with fresh identical `id`/selector markup, then called the no-op restamp hook: opacity reset from 0.5 to 1. `FEATURES.md:845-855` still promises selector-based matching without data stamping and automatic SPA survival.

**Fix/verification:** either rebind tracked identities safely after framework replacement (uniqueness/ambiguity checks mandatory) or explicitly narrow the persistence contract. Test actual framework remount and multi-instance ambiguity; do not revert to broad selectors that style lookalikes. This is separate from the owned selector one-line fix.

### F06 — P2 — Comment-only reload cannot restore anchor from saved selector

**Evidence:** `content/comments.ts:120-126`, `:254-271` and `:296-318`; P07 loaded one saved comment on a fresh element lacking its old data id. One comment existed, zero pins rendered. Normal `restoreCommentPins` does not use the selector fallback present in import's `replacePageComments`.

**Fix/verification:** resolve/rebind saved anchors on normal restore using a unique selector, with explicit stale/ambiguous handling and ID reservation. Test comment-only sessions (no style/text replay to incidentally stamp the element), region comments, competing existing IDs and page reload. Coordinate with the comment worker; serialization/save-error fixes alone do not prove this closed.

### F07 — P1 — Malformed import can clear existing work before throwing

**Evidence:** content `index.ts:1860-1877` reverts the page, deletes existing comments and clears tracked changes **before** payload replay. Probe P08 supplies an invalid `elementId` and reaches an uncaught `querySelector` SyntaxError in tracker `:603-604`; array element types are also not validated. The malformed-ID rejection is browser-reproduced; prior-session loss is established by the source ordering, **not** an installed UI repro.

**Fix/verification:** fully validate/stage every record before destructive replacement, then commit atomically or restore a complete snapshot on failure. Include comments/tokens/undo state. Import null records, invalid IDs/selectors, wrong types, excessive files, unsafe HTML, invalid regions and mid-write storage failure; original edits must remain intact.

### F08 — P2 — Preview Original leaves token overrides and does not restore DOM layout

**Evidence:** P10 leaves edited token-driven text red after `setOverridesEnabled(false)`. Full handler `index.ts:2201-2254` only disables `dm-applied-styles`, not `dm-token-overrides`; there is no move rollback. Deleted elements are appended to body (`:2246`), ignoring recorded origin. Token observation is browser-reproduced; move/deletion placement are source-reviewed, not UI-exercised.

**Fix/verification:** preview/recover every tracked mutation category through shared reversible operations. Validate original token values, moved sibling order and deleted nested children while previewing; restore must be idempotent and preserve listeners where feasible.

### F09 — P2 — Import replacement leaves token and undo histories from the old session

**Evidence:** compare `index.ts:531-549` (full clear resets tokens, guides and both stacks) to import `:1850-1879` (does not). Source-reviewed only.

**Repro to perform:** edit a token and ordinary property, import another session, then Undo and Copy Prompt. Old token edits and undo entries must not coexist with the replacement session. If tokens are intentionally excluded from JSON, state that boundary and still reset obsolete undo history. Test failed import rollback as part of F07.

### F10 — P2 — Page Delete shortcut bypasses the reversible DOM action path

**Evidence:** `index.ts:833-836` directly calls `deleteElement`, clears selection, and never pushes undo or clears redo; `html-editor.ts:112-131` records/removes DOM but does not own the content undo stack. Source-reviewed only.

**Repro to perform:** select a node with page focus, Delete, then Cmd/Ctrl+Z; compare toolbar Delete. Repeat after a prior undo to expose stale redo history. Route all destructive entry points through one grouped undo-aware command and notify the panel consistently.

### F11 — P2 candidate — Asynchronous lifecycle work can outlive the final surface

**Evidence:** background `index.ts:145-192` asynchronously resolves/binds a port and schedules activation, while disconnect `:194-207` only consults the current binding; no disconnected flag cancels late bind/timer. Content enable `index.ts:747-765` schedules pin restoration, shortcut activation and replay, while disable `:768-799` cannot invalidate those promises. **Plausible, not reproduced.**

**Verification needed:** open/close before tab lookup, injection, storage and the 300ms activation finish; last-surface teardown must win and later promises must not re-enable shortcuts/pins. Suspend/restart the real MV3 worker with panel open; verify reconnection/tab maps and no cross-tab activation. Add cancellation/generation checks if reproduced.

## Catalogue reconciliation

1. FEATURES §9 promises selector-only persistence; actual tracker uses data IDs and the restamp hook is empty (F05).
2. FEATURES §2.2 describes a visible Source section, but PARITY:61 says no Component section is rendered. The actual side-panel inspector render must be the authority; do not count both descriptions as separate shipped features.
3. FEATURES:879 says eight MCP tools, but its own live-feedback subsection adds `wait_for_handoff`, and source registers nine. The implementation inventory records all nine.
4. PARITY:784 marks JSON change export skipped while PARITY:731 and FEATURES §4.8 describe implemented import/export; comment-export wording at PARITY:715 is similarly misleading because the exported change envelope includes comments.
5. PARITY:833-834 calls anchor positioning and view-transition metadata out of scope despite controls at PARITY:104-110 / :559-561. Distinguish metadata editing from full behavioural/API authoring.
6. PARITY's recommended next-pass list (:845 onward) repeats already-shipped features. Its "At parity means it works" preamble is implementation documentation, **not current execution evidence**.
7. DESIGN-PANEL claims last updated release 2.2.0; other documents and package source cover later features. Keep the catalogue rows traceable rather than silently discarding older claims.
8. The checklist labels row `0.6.8` inside Phase 0.7 and puts Phase 14 after Phase 17. IDs were preserved literally. Phase 18 uses a different three-column format; all 12 rows are included, not dropped by the usual four-column parser.
9. There is one Firefox parity phase, not a complete shared-feature Firefox repetition. Physical shortcuts/permissions/native PiP and installed packages remain uncovered even when a Node test has a similar name.
10. Privacy documentation omits persisted `dm-comments` from its storage table; its session lifetime says until tab/browser close although keys are URL-scoped extension storage, not tab keys, and local fallback lifetime differs. Do not infer tab isolation/expiry from the label. Two tabs at the same origin/path/query share one session key; fragment routes share one key too. Decide intended semantics and test them.

## Security and failure-boundary completion matrix

See `security-boundaries.csv`. Its rows are **additional certification obligations**, not newly passed features. Key boundaries: untrusted inspected DOM → privileged panel; imported files → page HTML/CSS; content scripts ↔ privileged background; extension ↔ localhost owner/attacher; extension ↔ bearer-token cloud relay; persisted data ↔ reopened page; screenshot capture → clipboard/download/agent; and teardown ↔ outstanding async work.

Protected assets include privileged extension APIs, inspected-origin data, user changes/comments, other tabs/tenants, local project config and credentials, and non-inspected browser content. Threat models must distinguish malicious website/file/remote caller from an already-authorized local process; the latter can read the local MCP health token by design. Manifest inspection found broad host access, self-only extension script CSP and only icon48 as a web-accessible resource, but no runtime permission/CSP certification was performed.

## Reproduction commands

Run from the assigned repository worktree root. These generate only local artifacts; Chrome gets a fresh isolated development profile, never the user's profile.

```sh
python3 docs/certification/2026-09-21/build-inventory.py
node -e "require('esbuild').buildSync({entryPoints:['docs/certification/2026-09-21/probe-entry.ts'],bundle:true,format:'iife',globalName:'Probe',outfile:'docs/certification/2026-09-21/probe-bundle.js',tsconfig:'packages/extension/tsconfig.json'})"
```

Open `browser-probes.html` in an isolated browser, or run installed Chrome with `--headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-background-networking --user-data-dir=<owned-isolated-profile> --dump-dom --virtual-time-budget=1000 file://<absolute-fixture-path>`. Preserve the `<pre id="results">` output even if macOS headless shutdown times out. The generated bundle/profile are deliberately not committed.

## Follow-up full-build verification

A subsequent required `npm run build` attempt built the extension successfully, then failed in the website Turbopack step: `Could not find the Next.js package (next/package.json)`. Dependencies are inherited from an ancestor checkout, but Turbopack's worktree-root boundary excludes them. This is an environment/build-resolution blocker, not a passing full build; application source was not changed to work around it.

**Build side effect:** the repository's extension build script automatically created a `dist` symlink to `/Users/sandeepbaskaran/Documents/design-mode/packages/extension/dist` and wrote the audited base bundle there. This was not expected from a worktree-local build. The parent must rebuild its intended final tree before relying on that shared unpacked-extension artifact. No tracked application source was modified. The earlier statement about worktree-contained compiler output refers to the earlier local MCP build, not this follow-up extension build.

## Release acceptance remaining

1. Human-triage F01/F02/F07 and reproduce with the installed extension using benign local fixtures; fix import validation/atomicity before claiming safe session sharing.
2. Re-run the component probes and focused regressions after every fix; do not promote them to manual-row passes.
3. Execute all 429 manual rows against an exact built artifact, recording browser/OS/build, expected result, status and evidence individually; repeat shared behaviours on each supported browser. Unsupported/out-of-scope results must be explicit, not passes.
4. Add adversarial tests from `security-boundaries.csv` and the replay/preview/lifecycle cases above. Independently verify the sibling workers' fixes on the final merged tree.
5. Verify actual packaged installs, permissions, browser-worker restart, multi-tab/multi-surface isolation, storage quota errors, offline reconnect and screen capture privacy. Until then the honest release state is **automated logic/integration evidence available; full feature/security certification incomplete**.
