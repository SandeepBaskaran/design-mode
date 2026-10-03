# Matching fan-out and UI certification corrections

## Root cause and scope

`sidepanel.ts:applyStyle` deliberately expands uniform padding/margin into four longhands, then sends `SP_APPLY_STYLES`. The background forwards that batch intact. The content `APPLY_STYLE` handler already snapshots the multi-selection, but `APPLY_STYLES` used only the focused `sid`. Thus selection messaging was correct (three selected); batch application was not. Linked border widths, stroke-position changes and effect transactions use the same batch boundary.

The batch handler now snapshots focused + selected IDs, writes each target, shares one history/group transaction, and refreshes multi-select overlays. Explicit serialized `__effect_hidden` metadata stays focused-target-only; other targets rebase their own hidden stash. The recent single-property hidden-effect fix is unchanged.

Review also found batch undo omitted auto-companions. The batch now records those entries. `applyWithCompanions` captures the primary edit before companions alter its computed original (border-style:none otherwise changes the apparent original width from 0px to 3px). Installed tests prove border widths AND automatic solid styles fully disappear from both CSS and the change ledger on undo, then return on redo.

Uniform spacing deliberately remains four independent longhands per target. The prior breadth harness's `property === 'padding'` / three-record expectation is stale: correct evidence is **12 longhand records, three unique targets, one shared groupId**. The Changes tab's existing Elements grouping renders the transaction under each affected element, labeled `3 elements — Padding`; it is not one global visual row.

## 0.10.18: retain the intended assertion, fix the control

Product documentation settles intent: `DESIGN-PANEL.md` line-height specifies “Unitless multiplier (1.5), length (24px), or normal. Unitless preferred for inherited consistency”; `PARITY.md` likewise promises multipliers, lengths, and normal. Therefore the old px-only input was a product mismatch, not a reason to weaken 1.5 → 1.6.

Line-height now accepts the authored CSS value, preserving tracked units through refresh and undo/redo instead of stripping them or appending px. Bare numbers step 0.1 / Shift+1; explicit lengths step 1 / Shift+configured nudge. The field identifies its supported forms in its accessible label/tooltip. CSS-invalid and negative entries are not sent; keyword/expression values are not numerically nudged. Valid dimension units are parsed case-insensitively and validated with CSS.supports, including pt/lh/PX. Existing page-authored values initially display their computed pixel value; the change ledger preserves units once edited. This does not claim recovery of authored units from arbitrary external stylesheets.

The catalogue retains its original fractional expectation and now additionally names px, em, %, normal, and refresh behavior. Regression tests assert computed 51.2px from unitless 1.6 at font-size 32px, rather than only inspecting input text.

## 0.10.0: discoverable Help entry

The existing Keyboard shortcuts button lived in Settings. Help now has a button using the same `show-shortcuts` action and Help's existing secondary-button styling. No shortcut bindings or Firefox behavior changed.

One additional stale detail was reconciled explicitly: `renderShortcutsPopover` intentionally moves non-remappable Deselect/Delete/Undo/Redo into **Fixed**, rather than Editing. The catalogue now names Fixed, and the installed test still asserts every category and those four labels, key chips, retained inside clicks, Escape, close-button and backdrop dismissal. Reading textContent avoids CSS uppercase transforming category names in innerText.

## Real verification

Run from repository root after `npm run build:extension`:

```sh
python3 packages/extension/tests/certification/matching-fanout-run.py
```

Set `DM_FANOUT_OUT` to a new evidence directory for subsequent runs. `DM_EXTENSION_DIST` can target the read-only seed build for red evidence. Dependencies are supplied through NODE_PATH and CHROME_BINARY as documented by the calling task. The reused installed harness owns disposable Chrome profiles, removes them in finally, uses an ephemeral loopback fixture port, and blocks non-loopback traffic with routing and a dead proxy. No production calls are needed.

Final task evidence in `fanout-evidence/final`: all four runs exit 0; five matching/UI scenarios plus four hidden-effect scenarios each through original UI, batch messages, and batch with explicit focused metadata. `fanout-evidence/seed-final` uses the exact same final tests on seed dist: matching fails, original hidden UI passes, both hidden batch runs fail. Dist SHA-256 maps before/after each suite are identical. Intermediate attempts remain separately named and are not credited as final results.

Additional gates: extension build, extension typecheck, and extension unit tests (201 passing). No website build, Firefox run, native Chrome side-panel delivery, packed-store install or native macOS shortcut certification is claimed. Chrome 151 is an installed unpacked extension with real background/content/panel messaging, a bound panel tab, and Playwright input. Batch-specific hidden regression tests intentionally dispatch real extension messages; they do not claim all batch UI producers were clicked individually.

Cold read-only review found the companion-undo and extra-unit issues; both received reproduced red tests and green installed checks. Task-specific changes are supplied separately from the pre-existing seed diff; parent owns integration and cleanup.
