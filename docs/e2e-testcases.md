# Design Mode — E2E Test Cases

Run this checklist before every release. Build first:

```bash
npm run build:extension
```

Load `packages/extension/dist/` into `chrome://extensions` (Developer mode → Load unpacked).
Open any non-trivial site (a marketing landing page works well — e.g. https://stripe.com,
https://vercel.com, https://linear.app). Walk every phase below.

A row passes only if the **Expected Result** matches **exactly**. Anything ambiguous, retest
before ticking.

> **Tip — silent-fail canary.** If a style edit looks like it didn't land, open the page's
> DevTools console and run `localStorage.setItem('dm-debug', '1')`. Subsequent style edits
> whose computed value didn't move will log a `[design-mode] no-op style edit` warning so
> you can spot specificity / parsing issues. Clear with `localStorage.removeItem('dm-debug')`.

---

## Phase 0 — Activation & lifecycle

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 0.1  | Extension loads | Load unpacked → check the icon in the toolbar | Design Mode icon appears, no error in `chrome://extensions` |
| 0.2  | Side panel opens | Click the toolbar icon | Side panel slides in on the right |
| 0.3  | Auto-activate inspect | Open the side panel for the first time | Cursor becomes a crosshair on the page; Design tab shows the page-context view (`<body>` selected with a "Page" indicator chip) |
| 0.4  | Pinned-tab behaviour | Open the panel on tab A, switch to tab B | The panel keeps showing data for tab A (it pins to the tab where it was opened) |
| 0.5  | Side-panel close → inspect off | Close the side panel | Crosshair cursor disappears within ~50ms; hover overlays don't follow the mouse anymore |
| 0.6  | Re-open keeps state | Re-open the panel on the same URL | Previously-applied edits are replayed (delete / hide / styles); changes badge counts match |
| 0.7  | Page reload preserves changes | Make 3 style edits + 1 hide + 1 delete, reload | All 5 are re-applied automatically when the panel re-opens |
| 0.8  | URL navigation isolates | Navigate to a different URL in the same tab | Changes from URL A do **not** apply to URL B; Changes tab resets |
| 0.9  | Browser-session boundary | Close & reopen browser | Session storage is cleared (per `chrome.storage.session` semantics) — fresh state |
| 0.10 | Theme toggle | Click sun/moon in header | Side panel + page overlays switch theme; persists across reloads |
| 0.11 | Side-panel toggle shortcut | Press `Alt+D` (Chrome command, registered in `manifest.json`) | Side panel toggles open / close |
| 0.12 | Unscriptable page | Open the panel on a `chrome://` page, the Chrome Web Store, or a devtools page | No "cannot be scripted" / "could not establish connection" error spam in the background console; the panel shows a disabled / empty state, not a crash |

---

## Phase 0.5 — Settings panel

Open via the gear icon in the side-panel header. All settings persist via `chrome.storage.local`
unless noted otherwise. **MCP configuration (mode, port, token, agent setup) is no longer here —
it lives on its own MCP page (Phase 0.7), opened from the header MCP chip.**

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 0.5.1 | Open / close | Click gear → click gear again | Settings view replaces the tabs; clicking again returns to the previous tab |
| 0.5.2 | Theme picker (system / dark / light) | Pick each | Side panel + page overlays update; persists across reloads |
| 0.5.3 | Color format (HEX / RGBA / HSL) | Switch each option | All colour text inputs in the Design tab re-render in the chosen format on next selection; existing rules keep their stored format |
| 0.5.4 | Screenshot capture mode | Switch among Clipboard / Download / Both | Subsequent camera-button screenshots respect the mode |
| 0.5.5 | Inspector hover colour | Pick a custom colour (e.g. green) | Hover overlay repaints **live** (no reload) in the new colour; the swatch shows its hex |
| 0.5.6 | Inspector selection colour | Pick a custom colour | Selection overlay repaints **live** in the new colour; swatch shows its hex |
| 0.5.7 | No MCP section in Settings | Open Settings | The MCP Server card and "Set up your agent" card are **absent** — only editor preferences remain |
| 0.5.8 | Reset to defaults | Click Reset | Theme back to system, colour format to HEX, all four overlay colours (hover / selection / margin / padding) to defaults, MCP port to default, page cursor back to On |
| 0.5.9 | Inspector margin overlay colour | Pick a custom colour | Margin bands on the hover/selection overlay render in it and repaint live (default `#FF6363`) |
| 0.5.10| Inspector padding overlay colour | Pick a custom colour | Padding bands render in it and repaint live (default `#7CC886`); the ↺ Reset link beside the overlay colours restores all four |
| 0.5.11| Nudge amount | Change to e.g. `25` | Persists (`dm-nudge-amount`); Shift+Arrow on a px field now steps by 25 (default `10`); invalid / ≤0 reverts to the last valid value |
| 0.5.12| Page cursor | Toggle Off with the panel open, then On again | Page cursor swaps **live** (no reload): app-icon cursor (default, On) ↔ plain crosshair; `move` over a selected element stays either way; closing the panel restores the normal cursor |

---

## Phase 0.6 — Header overlay panels (Help, Contribute)

The header icons between the MCP chip and the gear open full-page overlays.
All four overlays (MCP, Settings, Help, Contribute) are mutually exclusive — opening
any one closes the other three.

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 0.6.1 | Open / close Help | Click `?` icon → click `?` again | Help overlay replaces the tabs; second click closes |
| 0.6.2 | Help links | From Help, click Report an issue / Read the docs / Privacy / Security disclosure | Each opens the right page in a new tab via `target="_blank"` |
| 0.6.3 | Copy diagnostics | In Help, click Copy diagnostics | Clipboard contains `Design Mode: x.y.z` + Chrome + Platform + Theme; button label flashes "Copied ✓" then reverts after ~1.5s |
| 0.6.4 | Open / close Contribute | Click heart-handshake icon → click again | Contribute overlay replaces the tabs; second click closes |
| 0.6.5 | Contribute links | Click each row in Contribute (Star repo, Review on CWS, Report issue, Start a discussion, Open a pull request, Sponsor on GitHub) | Each opens the right URL in a new tab |
| 0.6.6 | Copy share text | In Contribute, click "Share with your network" | Clipboard contains the prefilled share blurb (extension pitch + CWS link); label flashes "Copied ✓ — paste anywhere" then reverts |
| 0.6.7 | Mutual exclusivity | Open any one of MCP / Settings / Help / Contribute, then click another header icon | Previous overlay closes, new one opens |

---

## Phase 0.7 — MCP page

Opened by clicking the **MCP chip** in the side-panel header (top-right, the dot + "MCP" label).
Replaces the old "MCP" section inside Settings. All values persist via `chrome.storage.local`.

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 0.7.1 | Chip opens the page | Click the MCP chip | The full-panel MCP page opens (replaces the tabs); the chip's trailing icon is a chevron (not a refresh arrow) |
| 0.7.2 | Auto-refresh on open | Click the chip and watch the status card | Opening the page re-pings the server; the status card's dot + label (Offline / Running / Connected) reflect the live state |
| 0.7.3 | Refresh status button | On the MCP page, click **Refresh status** | Re-pings the content script + server; a toast appears only when the state actually changed |
| 0.7.4 | Back button | Click the ‹ back chevron | Returns to the previously active tab |
| 0.7.5 | MCP — mode (Cloud / Local / Self-hosted) | Switch each | Cloud (default for fresh installs) uses `https://mcp.designmode.app` (or the configured URL); Local uses `ws://localhost:<port>`; Self-hosted exposes a URL field |
| 0.7.6 | MCP — port (Local) | In Local mode, change to e.g. `9970` | Persists; affects the WebSocket URL the extension dials on next connect |
| 0.7.7 | MCP — auto-connect (Local) | Toggle off | Side panel doesn't auto-dial on open; the indicator stays grey until manually connected |
| 0.7.8 | MCP — cloud token & tenant | Register / enter a token + tenant ID | Stored in `chrome.storage.local`; shown masked; Copy MCP config / Copy token / Revoke work; clearing re-disconnects |
| 0.7.9 | Agent setup card | Scroll to "Set up your agent" | The `/design-mode` command rows (Claude Code, Cursor, …) each Copy the command to the clipboard |
| 0.7.10| Chip toggles closed | With the MCP page open, click the chip again | The page closes and returns to the previous tab |
| 0.6.8 | Theme parity | Toggle theme while each overlay is open | Colours follow `--dm-*` custom properties; no flash, no broken contrast |

---

## Phase 0.10 — Keyboard shortcuts

Defaults live in `packages/shared/src/constants.ts:DEFAULT_SHORTCUTS`. Wired actions register
through `registerShortcut(action, handler)` in `packages/extension/src/content/index.ts`.
Shortcuts are suppressed while typing in `<input>` / `<textarea>` / `contenteditable` (except
`Escape`).

| #      | Test | Steps | Expected |
|--------|------|-------|----------|
| 0.10.0 | Shortcuts popover | Help (`?`) → **Keyboard shortcuts** | A popover card opens listing every shortcut grouped by category (General / Annotations / Animation / Editing / Export / Navigation), keys as `<kbd>` chips. Backdrop click, ✕, and `Esc` each close it; clicking inside the card does not |
| 0.10.1 | Alt+I — Toggle inspect | Press | Inspect crosshair toggles on/off |
| 0.10.2 | Alt+C — Comment on selected element | Select an element → press | Side panel switches to comment-add mode with the textarea focused; if nothing is selected, no-op |
| 0.10.2b | Alt+R — Comment on a region | Press | Crosshair draw mode activates; drag a rectangle → side panel opens the comment composer in "region" mode; Esc mid-draw cancels |
| 0.10.3 | Alt+P — Pause motion | Press | Toggles a global freeze: CSS animations + transitions + Web-Animations API instances + `<video>` elements pause; press again to resume |
| 0.10.4 | Alt+S — Element screenshot | Select element → press | PNG of the cropped element downloads with timestamp filename |
| 0.10.5 | Alt+X — Export CSS | Make any change → press | Generated CSS block copied to clipboard |
| 0.10.6 | Esc — Deselect / cancel | While selected | Multi-select tears down first if active, then inspect, then plain selection |
| 0.10.7 | Delete — Remove selected element | Select element → press | Element removed; "delete" entry in Changes tab |
| 0.10.8 | Ctrl/⌘+Z, Ctrl/⌘+⇧+Z — Undo/Redo | Make change → undo → redo | Style/text/DOM/visibility all reversible; works from anywhere except a focused input |
| 0.10.9 | Alt+1 — Layers tab | Press Alt+1 from anywhere on the page (no input focused) | Side panel jumps to Layers tab; that tab's saved scroll position is restored |
| 0.10.10 | Alt+2 — Design tab | Press Alt+2 | Side panel jumps to Design tab; saved scroll restored |
| 0.10.11 | Alt+3 — Changes tab | Press Alt+3 | Side panel jumps to Changes tab; saved scroll restored |
| 0.10.12 | Shortcut suppression in inputs | Focus a page `<input>` / `<textarea>` / contenteditable, then press Alt+1/2/3 (or any other shortcut except Escape) | The page input receives the keystroke as normal; the side-panel action does NOT fire |
| 0.10.13 | Cmd/Ctrl+click on a Layers row | In Layers tab, Cmd-click 3 layer rows in turn | Each toggles into the multi-select set; the "N selected" chip in the action row updates; page-side overlay outlines all 3 |
| 0.10.14 | Shift+click on a Layers row (range) | Click layer A with no modifier → Shift+click layer C three rows down | All visible rows from A to C are selected; the multi-select badge reflects the count |
| 0.10.15 | Arrow Up/Down in Layers | Switch to Layers tab → press ↓ several times | Selection moves down one visible row per press, wraps at the end; the row stays in view (`scrollIntoView` keeps it visible) |
| 0.10.16 | Enter to collapse/expand a container row | In Layers tab, select a container row with children → Enter | Children collapse; press Enter again → re-expand |
| 0.10.17 | Numeric Arrow stepping (px props) | Click any pixel input (e.g. font-size) → ↑ | Value increments by 1; Shift+↑ by the Settings → Nudge amount (default 10) |
| 0.10.18 | Numeric Arrow stepping (unitless props) | Click a unitless input (e.g. line-height) → ↑ | Value increments by 0.1; Shift+↑ by 1 |
| 0.10.19 | Esc priority | With multi-select active AND inspect on AND something selected, press Esc three times | First press tears down multi-select; second turns inspect off; third clears the selection |
| 0.10.20 | Ctrl/⌘+Enter on comment textarea | Focus a comment textarea → Ctrl/⌘+Enter | Comment submits |
| 0.10.21 | Enter on colour-picker hex input | Type a hex value (e.g. `#abc123`) in the picker → Enter | Value applied; picker dropdown closes |

---

## Phase 1 — Inspect & select

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 1.1  | Hover highlight | Move mouse over page elements | Configurable hover overlay (default blue) tracks the hovered element with rounded corners |
| 1.2  | Click to select | Click any element | Configurable selection overlay (default orange) with `W × H` dimension label |
| 1.3  | Selected state in header | After click | Design tab indicator shows **Selected** (blue badge) — never **Hovering** |
| 1.4  | Hover→Click race fix | Hover an element ~80ms then click it | Indicator goes straight to **Selected**; never flips back to **Hovering** |
| 1.5  | Breadcrumbs | Select a deeply-nested element | Breadcrumb path shown (e.g. `body › main › section.hero › h1`) |
| 1.6  | Comment pins not selectable | Hover/click a yellow pin | Pin is NOT highlighted by the inspector |
| 1.7  | DM overlays not selectable | Hover the hover/select overlay | Overlay is transparent to the mouse (passes through) |
| 1.8  | Selection follows scroll | Select an element then scroll | Select overlay stays anchored to the element |
| 1.9  | Escape deselects | Press `Escape` with a selection | Selection cleared, design tab returns to page-context view |
| 1.10 | Parent / child traversal | Click ↑ then ↓ in the action row | Selection moves to parent, then back to first child |
| 1.11 | Axis guides on hover | Hover any element | Blue dashed lines run through the element's four edges, spanning the full document; clear on mouse-out |
| 1.12 | Hover distance pills | Select an element, then hover a stacked sibling | Vertical gap pill PLUS the left/right side-edge offset pills with dashed extension lines (e.g. `20` gap + `40`/`52` side offsets); containment → 4 inset gaps |
| 1.13 | Eight resize handles | Select an element | Eight orange dots — four corners + four edge midpoints — on the selection box, each with the correct resize cursor |
| 1.14 | Drag-resize is live + guided | Drag any handle | Element resizes live; the orange outline + `W × H` label track instantly (no lag); side-panel W/H fields update during the drag; orange axis guides show for alignment |
| 1.15 | Resize persists + exports | Release the drag, open Changes tab + Export CSS | Changed `width`/`height` appear as a `Resize` row in Changes and in the exported CSS; Cmd/Ctrl+Z reverts. Edge handles commit only the one dimension they changed |
| 1.16 | Resize follows scroll | Resize, then scroll | All eight handles stay anchored to the element |
| 1.17 | Shift-select pairwise distances | Select an element, then Shift+click a second | Both outline (dashed); pairwise distance pills render between them; Shift+click more to extend |
| 1.18 | Pairwise distances persist on hover/scroll | With ≥2 shift-selected, move the mouse away and scroll | Pairwise pills remain and stay anchored (not cleared by mouse-out) |
| 1.19 | Move cursor over selection | Select an element, then hover its body (not a handle) | Cursor swaps to `move`; cursor returns to crosshair when hovering any non-selected element |
| 1.20 | Drag-to-move is live + guided | Select a non-static element, drag its body | Element moves live; orange outline + handles follow the cursor; Design-tab **X** / **Y** fields tick during the drag; orange axis guides show new edges |
| 1.21 | Move persists + exports | Release the drag, open Changes tab + Export CSS | New `left`/`top` appear as a single **Move** group in Changes and in the exported CSS; Cmd/Ctrl+Z reverts both offsets together |
| 1.22 | Move under-threshold = click | Mousedown on the selected element, release without moving | No drag fires; no Changes entry; selection stays as-is |
| 1.23 | Shift-axis lock | Drag the selected element with **Shift** held | Motion locks to the dominant axis (purely horizontal or purely vertical) |
| 1.24 | Static-promote on first drag | Pick a `position: static` element (e.g. an in-flow heading), drag its body | Element moves; Design tab's Position field becomes `relative`; X/Y inputs appear with the drag delta; Changes shows the **Move** group with three entries (`position`, `left`, `top`); a single undo reverts all three |
| 1.25 | Multi-select drag in lockstep | Shift-click two elements, then drag either one | Both elements translate by the same delta; one undo reverts the whole gesture |
| 1.26 | Move follows scroll | Move an element, then scroll the page | The selection box + handles stay anchored to the element |
| 1.27 | Margin/padding overlay bands | Hover or select an element with non-zero margin **and** padding | Light-red margin band paints outside the element box; light-green padding band paints between border and content; bands hide when the spacing is all-zero; colours follow Settings → Inspector overlay |

---

## Phase 2 — Design tab: Typography & rich text

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 2.1  | Rich-text editor — leaf text | Select a `<p>` / `<h1>` with no element children | "Text Content" contenteditable shows the element's HTML; B / I / U / S / list / link toolbar above it |
| 2.1a | Rich-text editor — text layer with children | Select a layer that shows the T (type) icon in Layers (h1-h6, p, span, a, button, li, etc.) | Editor still renders, seeded with the element's `innerHTML` |
| 2.2  | No editor for non-text containers | Select a generic `<div>` / `<section>` (icon is layoutGrid / layoutDashboard, not T) | No "Text Content" field |
| 2.3  | Toolbar Bold / Italic / Underline / Strike | Select text in editor → click each | Formatting wraps the selection (`<b>`, `<i>`, `<u>`, `<s>`); applies to the live page on blur |
| 2.4  | Toolbar lists | Click bulleted / numbered list | `<ul>` / `<ol>` inserted into editor; markers visible (CSS in `index.html` keeps them shown) |
| 2.5  | Toolbar link | Select text → click link → enter URL | Wraps selection in `<a href="…">`; renders in accent colour with underline |
| 2.6  | Toolbar Strip formatting | Select text → click `⨯ fmt` | All inline formatting removed |
| 2.7  | Save on blur | Edit text → click outside the editor | Element updates; **text-change row appears in Changes tab** with `isHtml: true` so the HTML round-trips on reload |
| 2.8  | Native shortcuts | While editing, press `⌘B` / `⌘I` / `⌘U` | Browser's contenteditable shortcuts work (B/I/U toggle selection) |
| 2.9  | Font weight named dropdown | Click weight | Options shown as `Thin (100)`, `Light (300)`, `Regular (400)`, `Medium (500)`, `Semi Bold (600)`, `Bold (700)`, etc. |
| 2.10 | Strict numeric inputs | Type `abc` in font size | Characters are blocked; only digits / single minus / one decimal up to 2 places allowed |
| 2.11 | Arrow stepping | Click size, press ↑ | Increments by 1 (px appended automatically) |
| 2.12 | Shift + arrow stepping | `Shift+↑` | Increments by 10 |
| 2.13 | Bold / italic / underline / strike toggles in Typography section | Click each B / I / U / S below the rich text editor | Toggles apply visually; toggle again to remove |
| 2.14 | Color picker — inline HSV + hue slider | Click any colour swatch | Inline picker drops down with HSV gradient, hue slider, hex/RGB or hex/HSL inputs (depending on Settings → Color Format) |
| 2.15 | Color picker — eyedropper | Click "Pick" with a Chrome 95+ browser | EyeDropper API engages; pick a colour from anywhere on screen → applied |
| 2.16 | Color token dropdown | Click the swatch button → click any token row | `var(--token)` is set on the property; row appears in Changes tab |
| 2.17 | Color token search | With dropdown open, type "primary" | Token list filters to only `--*primary*` rows |
| 2.18 | Custom hex via Enter | Type `#abc123` and press Enter in the hex input | `#abc123` applied as the colour |
| 2.19 | Click outside closes dropdown | Click anywhere outside | Dropdown closes |
| 2.20 | Format cycle button | With colour dropdown open, click the format button | Cycles HEX → RGB → HSL; Settings → Color Format also reflects |
| 2.21 | HEX vs RGBA format | Settings → Color Format → HEX | All colour text inputs render `#xxxxxx`; switch to RGBA → `rgba(...)` |
| 2.22 | Text alignment / transform / decoration | Change each control | Element updates instantly |
| 2.23 | Contrast checker — ratio | Open the colour picker on a text colour over a known background | A contrast row above the HSV gradient shows the ratio vs the effective background (e.g. `4.5:1`) with a diagonal-split chip |
| 2.24 | Contrast checker — rating + AA/AAA | Read the contrast row | Absolute rating pill (Excellent / Good / Poor / Very Poor) plus AA and AAA tabs showing both pass/fail verdicts at once |
| 2.25 | Contrast checker — category override | Open the Category popover, switch Auto → Large → Normal → Graphics | The pass/fail verdict updates to the chosen threshold; the choice + AA/AAA level persist across reloads |

---

## Phase 3 — Design tab: spacing, layout, border, effects

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 3.1  | Computed box layout | Select an element with margin and padding → expand Layout → Advanced | Chrome-DevTools box shown: outer dashed (margin) → inner solid (padding) → centre dimension pill (`W × H`) |
| 3.2  | Edit padding via computed box | In Layout → Advanced, click padding-top in the box, type `24`, blur | Element padding-top becomes `24px`; change recorded |
| 3.2a | Figma margin/padding expand | In Layout, type a uniform Margin value; click the expand (scan) button on the Margin row | Uniform writes the `margin` shorthand; expand reveals 4 side inputs (↑→↓←) writing `margin-top/right/bottom/left`; per-side edits land in Changes. Same for Padding |
| 3.3  | Border width 4 sides | Set top / right / bottom / left widths | All 4 borders update independently |
| 3.4  | Border link button | Click the round link icon in the centre of the 2×2 grid | Icon turns blue (linked); editing one side updates all four |
| 3.5  | Border unlink | Click again | Icon reverts to grey outline; edits are independent |
| 3.6  | Radius linkable | Same flow with the radius grid | All four corners can be linked / unlinked |
| 3.7  | Stroke position (Inside / Outside / Center) | Change in Stroke section | Inside renders via inset box-shadow chain; Outside via `border-*` (single) or outer box-shadow (multi); Center via `outline-*` |
| 3.8  | Display flex sub-controls | Set display to flex | Flex direction / wrap / justify / align / gap controls appear |
| 3.9  | Display grid sub-controls | Set display to grid | Grid template columns/rows + gap controls appear |
| 3.9a | Gap Fixed / Auto mode | On a flex/grid container, Col/Row gap shows a Fixed/Auto dropdown. Type a px value in Fixed; switch to Auto | Fixed writes `column-gap`/`row-gap`; Auto spreads children via `space-between` (justify-content, or align-content for grid rows), field goes read-only showing the measured gap; switching back to Fixed restores an editable px value. Container whose CSS already has `space-between` opens in Auto |
| 3.9b | Gap Auto preserves 9-pad alignment | Set a Children-align 9-pad position (e.g. center), switch gap to Auto, then back to Fixed | While Auto is active no 9-pad dot is falsely highlighted; switching back to Fixed restores the previously chosen alignment instead of resetting it |
| 3.10 | Position offsets | Set position to `relative`, top `10` | Element shifts down 10px |
| 3.11 | Z-index strict numeric | Type `10.5` in z-index | Allowed (2 decimals); type letters → blocked |
| 3.12 | Opacity / transform | Set `opacity: 0.5`, transform `rotate(3deg)` | Both apply visually |
| 3.13 | Box shadow builder | Use shadow inputs | Shadow appears; values reflect in Changes tab |
| 3.14 | Animation easing visualizer | In Motion → Advanced, edit a `transition` value, click the curve preview icon | Bézier panel opens with adjustable control points; spring mode toggles to stiffness / damping / mass sliders |
| 3.15 | Motion: add Hover interaction | Motion section → **When:** → **Hover** | A Hover card appears seeded with a Fade change + shared Curve; hovering the element on the page fades it |
| 3.16 | Motion: real preview | On the Hover card, click ▶ Preview | Element plays the transition (forced `.dm-force-hover`); button toggles to pause; click again to stop |
| 3.17 | Motion: add change preset | On a Hover card, click the **Lift** chip | A `translate` change row is added; hovering lifts the element |
| 3.18 | Motion: Appear (@starting-style) | **When:** → **Appear**, then click ▶ | Element re-mounts and animates in from the seeded start state |
| 3.19 | Motion: Loop | **When:** → **Loop**, pick `dm-pulse` | Element pulses continuously; ▶ restarts the animation |
| 3.20 | Motion: Scroll | **When:** → **Scroll** | `animation-timeline: view()` seeded; scrolling the element through the viewport drives the animation |
| 3.21 | Motion: variant export | Add a Hover interaction, open Copy CSS | Output has a base rule + a real `.selector:hover { … }` rule (SCSS same; Tailwind uses `hover:`) |
| 3.22 | Motion: Advanced disclosure | Toggle the Motion **sliders** icon | Raw Transition / Animation / Transform / Motion-path / View-transition / Scroll-driven editors appear below the cards |
| 3.23 | Appearance: icon-first fields | Select an element → expand Appearance | Opacity field is led by a blend icon (no visible "Opacity" label — name shows on hover); Corner radius field is led by a maximize icon (no visible "Corner radius" label). Blend mode and Isolation are not in the main row — open Appearance → Advanced to find them |
| 3.24 | Corner radius: Mixed → forced uniform | Click the corner-expand (`scan`) toggle, set each of the 4 corners to a different value, collapse back to the primary row, then type a number into the primary field (showing `Mixed`) | Collapsed primary field shows a `Mixed` placeholder before the edit; typing over it writes the `border-radius` shorthand and all four corners snap to the typed value — re-expanding shows all 4 corners equal |
| 3.25 | Layout guide: section eye visibility gating | Add one layout guide to an element, then add a second | With one guide, no section-level eye appears next to the Layout guide header — only the row's own eye. Once 2+ guides exist, a section eye appears top-right of the section header |
| 3.26 | Layout guide: parent/child hide | With 2+ guides on an element, click the section eye to hide all guides, then click one dimmed row's own eye | Every guide disappears from the page; each row's own eye dims (~40% opacity) but still reflects and can toggle its individual on/off state; re-enabling the section eye reveals only the rows currently marked visible |
| 3.27 | Layout guide: compact color panel | On a layout guide's expanded row, click the Colour swatch | The color panel opens with the HSV picker + hex/RGB inputs only — no WCAG contrast row and no Site Colors token list |

---

## Phase 4 — Design tab: media

| #   | Test | Steps | Expected |
|-----|------|-------|----------|
| 4.1 | Image preview | Select an `<img>` | Media section shows preview thumbnail + dimensions + transferred file size (e.g. `124 KB`) + "Download {filename}" button |
| 4.2 | Image download | Click Download | Browser downloads the original image with its filename |
| 4.3 | SVG inline | Select an inline `<svg>` | Media section shows rendered SVG, "Download icon.svg" + "Copy SVG markup" |
| 4.4 | Copy SVG markup | Click "Copy SVG markup" | SVG `outerHTML` ends up in the clipboard (paste into a text file to verify) |
| 4.5 | Video element | Select a `<video>` | Embedded `<video>` controls + Download button |
| 4.6 | Background image | Select a div with `background-image: url(...)` | Media section detects the URL, offers download |
| 4.7 | Icon library detection | Select a Lucide / Heroicons / Remix icon | Icon section appears showing library + name; if multiple matches in the library, a replace-icon dropdown |
| 4.8 | Media file size — cross-origin | Select a cross-origin image whose response is opaque | Meta line shows resolution + kind but omits the size (no error) |

---

## Phase 5 — Layers tab

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 5.1  | DOM tree loads | Switch to Layers | Indented tree of every visible element |
| 5.2  | Search | Type `button` in the search field | Tree filters to layers with `button` in tag or display name; ancestors expand to show matches |
| 5.3  | Filter — All / Visible / Hidden / Modified | Click each chip | All shows everything; Visible hides deleted/hidden; Hidden shows only `display: none` elements; Modified shows only elements with tracked changes |
| 5.4  | Layer click | Click a layer row | Element selected on the page, Design tab populates |
| 5.5  | Layer hover | Hover a row | Hover overlay appears on the corresponding page element |
| 5.6  | Drag to reorder | Drag a row over a sibling | Source DOM updates; "move" entry appears in Changes tab |
| 5.7  | Visibility toggle | Click the eye icon on a row | Element becomes `display: none`; row dims; eye icon flips to eyeOff |
| 5.8  | Trash icon | Click the trash icon | Element removed; "delete" entry appears in Changes tab |
| 5.9  | Duplicate marker | Duplicate an element | Layers row of the duplicate carries the `dm-clone` marker class and shows a "(copy)" suffix label |
| 5.10 | DM elements excluded | Inspect the tree | No `dm-hover`, `dm-select`, `dm-comment-pin`, or `dm-applied-styles` rows |
| 5.11 | Horizontal pan on deep trees | On a deeply nested page (10+ levels), scroll the tree horizontally | Full layer names become visible while panning; search/filter header stays pinned top-left; the crosshair/eye hover actions stay pinned at the right edge of every hovered row; panned position survives re-renders (e.g. hovering rows) |

---

## Phase 6 — Comments

| #   | Test | Steps | Expected |
|-----|------|-------|----------|
| 6.1 | Add a comment | Select element → comment icon → type → Add | Yellow pin appears on the element; comment row in Changes tab |
| 6.2 | Add via Alt+C | Select element → press `Alt+C` | Comment textarea appears focused (same as clicking the comment icon) |
| 6.3 | Pin position | Add a comment | Pin sits at the top-right of the element |
| 6.4 | Pin click | Click the pin on the page | Side panel switches to Changes tab and opens the comment for editing |
| 6.5 | Edit / delete | Edit text and Save / Delete | Updates / removes the comment + pin |
| 6.6 | Mark as resolved | Click the resolved toggle on a comment row | `resolved: true` set; row moves under the Resolved sub-filter (Phase 7) |
| 6.7 | Persistence | Reload page | Comment + pin re-appear (resolved state preserved) |
| 6.8 | Pin not inspectable | Hover a pin in inspect mode | Pin is transparent to the inspector |
| 6.9 | Region comment — drop (drag) | Click the dashed-square button (or `Alt+R`) → drag a box over empty page space | Dashed yellow box stays on the page; composer opens in "region" mode. The box persists while you type |
| 6.9b | Region comment — drop (click) | Region mode → single click on the canvas (no drag) | A default-sized (~180×110) yellow box drops at the click point and stays; composer opens — no DOM element needs selecting |
| 6.9c | Region comment — box persists then commits | With the pending box showing, type → Add | The pending box is replaced by the committed region box + numbered pin; comment row shows a region badge |
| 6.10 | Region comment — scroll/persist | Drop a box, scroll the page (while composing and after Add), then reload | The box (pending and committed) stays anchored to the document position; committed box + pin survive reload |
| 6.11 | Region comment — cancel removes box | Drop a box → click Cancel in the composer | The pending yellow box disappears; no comment created. (Pressing `Esc` mid-drag, before release, also exits with no box) |
| 6.12 | Inspect suspended while composing | Turn Inspect on → select an element → open the comment composer (add), then hover/click other elements on the page | Inspect is off while the composer is open (no hover outlines, clicks don't reselect); on Add/Cancel inspect returns to its prior on state. Same for **editing** a comment and for **region** compose |
| 6.13 | Inspect stays off if it was off | With Inspect off, open a composer then close it | Inspect remains off throughout (prior state restored, not force-enabled) |

---

## Phase 7 — Changes tab

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 7.1   | Empty state | No changes yet | Sparkles icon + "No changes yet" message |
| 7.2   | Filter chips | Click All / Style / Text / DOM / Comment | Each chip filters the list to just that category; counts appear next to each chip |
| 7.3   | Comment sub-filter | While Comment chip active | Open / Resolved / All sub-chips appear, with their own counts |
| 7.4   | Search | Type a property name (e.g. `padding`) in the search bar | List filters by free-text match across selector, property, value, and comment text |
| 7.5   | Sort | Click the sort icon → pick Oldest / Newest / By element | Order updates accordingly |
| 7.6   | Bulk select | Tick the checkboxes on 3 rows → click "Delete selected" | All 3 changes reverted on the page; counts drop |
| 7.7   | Style change recorded | Edit any CSS property | Row appears with `prop: old → new` and the element selector |
| 7.8   | Text change recorded | Edit text content (rich-text) | Text-change row appears; storing as HTML so reload round-trips formatting |
| 7.9   | DOM change recorded | Duplicate / delete / move / hide | Row appears with the action label |
| 7.10  | No double-record on duplicate | Click Duplicate **once** | Exactly **one** "duplicate" row appears (regression: previously logged twice) |
| 7.11  | Comment recorded | Add a comment | Yellow note row appears with selector |
| 7.12  | Group by element | Make multiple edits to the same `.card` | Changes tab groups them under one selector header with a count |
| 7.13  | Preset group label | Apply a preset to an element | Multiple property changes collapse into one row labelled with the preset name (`groupKind: 'preset'`) |
| 7.14  | Multi-select group label | With multi-select on N elements, edit a property | Single row labelled `multi-select` with count `N elements` |
| 7.15  | Visibility group label | Hide → Show toggling | Single row labelled per-element with `groupKind: 'visibility'` |
| 7.16  | Single revert | Hover a row → click trash | Style/text/DOM change is **actually reversed** on the page (not just removed from the list) |
| 7.17  | Revert duplicate | Trash a duplicate row | The duplicated element is removed from the DOM |
| 7.18  | Revert delete | Trash a delete row | The deleted element is re-inserted from saved outerHTML |
| 7.19  | View Original | Click **View Original** | Page visually reverts to its initial state — styles, text, deleted elements re-appear, duplicates hide, comment pins hide. Banner: "Viewing original — click View Changes to see your edits" |
| 7.20  | View Changes | Click **View Changes** | Edits + duplicated elements + comment pins re-appear |
| 7.21  | Toggle button states | While viewing one mode | Active button is filled accent; inactive button is outline |
| 7.22  | Clear All confirmation | Click **Clear All** | Inline overlay modal "Clear all changes?" with Cancel / Clear; Cancel keeps state |
| 7.23  | Clear All reverts everything | Confirm Clear All | Every style / text / DOM / comment is undone on the page; Changes tab empties; persistence cleared; deleted elements re-inserted; `dm-clone` markers stripped |
| 7.24  | Batch apply (zap) — outline | Edit a property on a recurring class (e.g. `.btn`) | Zap icon next to the row is grey outline by default |
| 7.25  | Batch apply — fill | Click the zap | Icon becomes filled accent; the same change applies to every matching element on the page |
| 7.26  | Batch unflag | Click zap again | Icon returns to outline (does NOT un-apply the changes — that's the trash button's job) |
| 7.27  | Tab badge count | Make 5 changes | "Changes" tab shows badge `5` (style + text + DOM + comments combined) |

---

## Phase 8 — Design-system / Tokens panel

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 8.1  | Open Tokens panel | Click the swatch-book icon in the action row | Panel opens with three tabs: **Declared**, **Detected**, **Defined**; last-active tab is restored from `dm-tokens-tab` |
| 8.2  | Declared — grouping | Switch to Declared | Every CSS variable the page declares is listed — not just `:root` — grouped by purpose (Colour / Typography / Spacing / Radius / Shadow / Other), each row with swatch/preview + current value + inline editor |
| 8.3  | Declared — live repaint | Type a new value (e.g. change a colour token's hex) | The page repaints live via the `dm-token-overrides` stylesheet without a reload |
| 8.4  | Declared — reset | Click the reset button on an edited row | Value restores to the original captured on the first edit |
| 8.5  | `×N uses` preview | Click the `×N uses` badge on a token | On-page consumers light up via the multi-select overlay system |
| 8.6  | Detected — histograms | Switch to Detected | Histograms of computed values used by viewport-visible elements for spacing / radius / font-size / shadow, each with a count |
| 8.7  | Detected — drift warning | Find a detected value close to a declared token | Drift warning surfaces on that row |
| 8.8  | Detected — Replace with… | Open the "Replace with…" dropdown → pick a closest token (lower / exact / upper) | `CONSOLIDATE_DETECTED` scan rewrites every matching computed value as `var(--name)`; appears as a **single grouped change** in the Changes tab |
| 8.9  | Defined — empty by default | Open Defined on a fresh install | List is empty; no built-in seeds |
| 8.10 | Defined — save | Select an element, choose a Kind (only kinds with non-default values on this element are listed), name, **Save** | Preset appears in the list under the chosen kind |
| 8.11 | Defined — apply | Click **Apply** on a preset | Styles applied with `groupKind: 'preset'`; rows in Changes tab collapse to a single labelled row; an **↶ Applied** button appears on the preset row |
| 8.12 | Defined — ↶ Applied revert | Click the **↶ Applied** button | Every change in that application's `groupId` reverts |
| 8.13 | Defined — edit | Pencil → editor; rename + tweak values (kind is a locked badge) → save | Updates; invalid CSS dropped silently with a toast |
| 8.14 | Defined — delete | Trash → confirmation overlay → confirm | Removed from list and storage |
| 8.15 | Export / Import | **Export** → file downloads with kind marker `design-mode-design-system`; **Import** the same file | Re-imports cleanly; a foreign JSON (missing the marker) is rejected with a toast |
| 8.16 | Cross-tab filters + search | Click filter chips (All / Colours / Type / Spacing / Radius / Shadow / Other) and type in the search box | Filters and search filter the active tab's rows; semantics adapt per tab |
| 8.17 | "Used on this page" toggle | Toggle on | Active tab filters to entries actually consumed by viewport-visible elements |
| 8.18 | Markdown exporter — Tokens changed | Edit a `:root` var → Copy as Prompt | Output contains a focused **`## Tokens changed`** section listing only edited tokens (original → current). With no root-var edits, the section is omitted |
| 8.18a | Token edits show in Changes tab | Edit a `:root` var → open the Changes tab | A row appears under a `:root` / Design-tokens group showing `--var: original → current`; the **Tokens** filter chip counts it; the row's Revert restores the original; "Clear all" removes it. Parity with the Copy as Prompt's Tokens-changed section |
| 8.19 | Pre-rework presets read back | If you had presets from before this rework | They load into the Defined tab without migration; `groupId` continues to work |

### Phase 8b — Scopes, design systems, token badges

Run on a Carbon site (carbondesignsystem.com) and a shadcn site (ui.shadcn.com).

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 8.20 | Theme-scoped detection | Open the Tokens panel on carbondesignsystem.com | Hundreds of `--cds-*` tokens listed (they're declared on theme classes, not `:root` — the old `:root`-only scan found none) |
| 8.21 | Design-system banner | Same page | An **IBM Carbon** chip shows with a token count; clicking it filters to `--cds-*` tokens. On ui.shadcn.com the chip reads **shadcn/ui** |
| 8.22 | Scope switching | Open the scope dropdown → pick a non-primary theme (e.g. `.cds--g100`) | Rows show *that* scope's values; scopes that match nothing on the page are marked `inactive` |
| 8.23 | Component tokens section | Scroll the Declared tab | Component-scoped tokens (e.g. `.cds--btn { --cds-btn-* }`) sit in their own collapsed **Component tokens** section, not mixed into the semantic groups |
| 8.24 | Scoped edit is contained | Edit a token on a theme scope that applies to only part of the page | Only elements inside that scope repaint; elements themed by a sibling scope are untouched; Reset restores |
| 8.25 | Token badge appears | Select a Carbon button → Design tab | Fields authored from tokens show a ◆ badge (Fill shows the token name); hovering a numeric field's diamond shows the full var name |
| 8.26 | Badge is cascade-accurate | Select an element whose colour comes from a *literal* rule that shadows a `var()` rule with the same value | **No badge** on that field — the literal wins the cascade, so the property isn't token-driven |
| 8.27 | Swap token (non-colour) | Badge → **Swap token…** on a spacing / radius / type field | A group-matched token picker opens; picking one applies `var(--token)`, the page repaints, and the Changes row reads `→ var(--token)` |
| 8.28 | Edit token globally | Badge → **Edit token globally** | Tokens panel opens with that token focused/highlighted **and its scope pre-selected**; editing the value changes the element you started from |
| 8.29 | Detach from token | Badge → **Detach from token** | The resolved literal is written; the badge disappears |
| 8.30 | `var()` in numeric fields | Type `var(--cds-spacing-05)` into a radius or stroke-weight field → Enter | The value is applied verbatim (previously clamped to `0`); Changes shows the `var()` |
| 8.31 | Token change → MCP | Edit a token → call `get_changes` (local and cloud) | Response contains `tokenChanges` with `cssVar`, `scopeSelector`, `oldValue`, `newValue`, `system`, `cssRule`, plus a `tokenGuidance` string |
| 8.32 | Token change → prompt | Edit a theme-scoped token → Copy as Prompt | `## Tokens changed` names the token, its design system, and its scope, followed by the "edit the definition at its source" guidance |
| 8.33 | Refresh picks up a theme switch | Toggle the site's theme → click the panel's refresh (⟳) | Token values re-scan to the now-active theme |

---

## Phase 9 — Action row & advanced selection

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 9.1  | Parent / child / duplicate / delete / comment / screenshot / multi-select | Each button in the action row | All work as labelled |
| 9.2  | Disable when no selection | Deselect | Parent, child, duplicate, delete, comment, multi-select dim out; screenshot stays enabled |
| 9.3  | Screenshot — viewport | No selection (and no hover) → click camera | Full viewport PNG copied to clipboard (or downloaded, depending on Settings → Screenshot mode) |
| 9.4  | Screenshot — element only | **Select** an element → click camera | PNG copied to clipboard contains **only that element** (cropped from viewport, not the surrounding page) |
| 9.4a | Screenshot — element scrolled into view | Select an element below the fold → camera | Page scrolls element into view first, then captures cropped image — never returns a blank or off-screen capture |
| 9.5  | Computed CSS overlay | Click `</>` | Slide-up overlay shows the element's computed CSS block; **Copy** copies the full block to clipboard (paste into a text file → 10+ properties) |
| 9.6  | Multi-select toggle | Click multi-select icon → click 3 elements on the page | Each selected element gets a dashed outline; header shows `3 selected` chip |
| 9.7  | Multi-select fan-out | With 3 selected, edit a property | Property applied to all 3 elements; Changes tab shows ONE row labelled `multi-select` with count `3 elements` |
| 9.8  | Multi-select Esc | Press Esc with multi-select active | Multi-select tears down first; second Esc deselects |
| 9.9  | Freeze animations | Select an element → Design tab → **Motion** section header → click the circle-pause toggle (or `Alt+P` from anywhere) | The Motion-section toggle shows active state; CSS animations + transitions + WAAPI instances + `<video>` pause across the page; toggle again to resume |
| 9.10 | Undo / Redo | Make change → `Ctrl/⌘+Z` → `Ctrl/⌘+⇧+Z` | Reverts then re-applies (style, DOM, text, visibility all reversible) |

---

## Phase 10 — Bottom bar (Copy as Prompt / Send to Agent)

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 10.1 | Disabled with no changes | Open a fresh page | Both buttons disabled |
| 10.2 | Disabled while previewing | Click View Original | Both buttons disabled (banner explains) |
| 10.3 | Copy as Prompt format — header | Make any change → Copy as Prompt | Clipboard opens with `# Visual changes — {{page title}}` then `<{{page url}}>` on the next line (title falls back to `untitled` when the page has none). No boilerplate above the heading |
| 10.4 | Copy as Prompt format — body | Make 3 style + 1 text + 1 DOM change → Copy as Prompt | Changes sit under a `## Changes` heading, one bullet `- {label}: {detail}` each, ordered chronologically. Only the documented sections appear (`## Tokens changed`, `## Comments`, `## Design tokens used` — each omitted when empty); no code fences, no "How to apply" prose, no framework section |
| 10.5 | Style grouping per element | Edit two properties on the same `.btn` | Single bullet groups them: `- button.btn: padding 8px → 12px; border-radius 4px → 8px` |
| 10.6 | Text change format | Edit a heading's text | Bullet reads `- {label} text: "{old}" → "{new}"` (truncated to ~60 chars per side) |
| 10.7 | DOM change format | Duplicate / delete / move an element | Bullet reads `- {label} duplicated` (or `deleted` / `moved` / `inserted`) |
| 10.7a | Move conveys origin → destination + chronology | Edit a style on `.card` → drag it to another parent in Layers → edit another style → Copy as Prompt | Move bullet reads `- {label} moved: {oldParent}[i] → {newParent}[j]`; the pre-move style bullet appears BEFORE the move line and the post-move one AFTER it; ambiguous labels (e.g. `div.card` matching several nodes) carry the full post-move selector in parens; MCP `get_changes` shows the same `origin`/`destination` on the move record and live (post-move) selectors on every change |
| 10.8 | Comment lines | Add a comment | Bullet reads `- note on {selector}: {text}` |
| 10.9 | Empty state | Copy as Prompt with no changes | Both the button gate (10.1) and this fallback key off the same empty ledger, so the fallback isn't reachable from the UI — verify by reading `exportMarkdown`, not by clicking. When hit, output is the two header lines from 10.3, a blank line, then `(no changes recorded yet)` |
| 10.10 | Send to Agent — connected | MCP connected → click Send to Agent | Button shows "Sent!" + success toast; agent's next `get_changes` includes a `handoff` field with `requestedAt` / `pageUrl` |
| 10.11 | Send to Agent — running, no agent | Server running but no agent → click | Instructions overlay: "no coding agent has attached yet", points to the MCP page + `/design-mode`; "Open MCP settings" button lands on the MCP page |
| 10.12 | Send to Agent — local offline | No local server in Local mode → click | Instructions overlay with `claude mcp add design-mode …` registration hint; button styled enabled (accent), not greyed out |
| 10.13 | Send to Agent — cloud, no token | Cloud mode without token → click | Instructions overlay pointing to the MCP page's "Connect to Cloud" |
| 10.14 | Handoff cleared | Send to Agent → Clear All → agent calls `get_changes` | No `handoff` field in the response |

---

## Phase 11 — MCP server (local + cloud)

The local server lives in `packages/mcp-local`; the cloud relay in `packages/mcp-cloud` (deployed
at `https://mcp.designmode.app`). Both expose the **same seven MCP tools**.

### 11.A — Local mode (`npm start` in `packages/mcp-local`)

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 11.1  | Server starts | `cd packages/mcp-local && npm start` | ASCII banner; eight tools listed: `get_changes`, `apply_changes`, `set_change_status`, `mark_comment_resolved`, `clear_changes`, `get_session_summary`, `export_changes`, `get_screenshot`; WebSocket bridge on `ws://localhost:9960` (or the configured port) |
| 11.2  | Port conflict | Another process on 9960 | Clean error suggesting a different port or to kill the conflict |
| 11.3  | Extension connects | Side panel open + auto-connect on (default) | Green dot in MCP indicator |
| 11.4  | `get_changes` | Invoke from agent | Returns `{ pageUrl, pageTitle, styleChanges[], textChanges[], domChanges[], cssBlock, comments[] }` |
| 11.5  | `apply_changes` | Push styles from agent: `{ changes: [{ elementId, styles: { color: 'red' } }] }` | Styles apply live on the page; row appears in Changes tab |
| 11.5a | `get_changes` exposes ids | After an edit, invoke `get_changes` | `items[]` lists each change with a stable `id` + `status: "todo"` |
| 11.5b | `set_change_status` | `{ status: 'in_progress' }` then `{ status: 'resolved', ids: ['<id>'] }` | Changes tab shows a WIP/DONE badge per row; resolved rows dim; Status sub-filter (To-do / In progress / Resolved) narrows the list; resolving a comment id flips it to resolved |
| 11.6  | `clear_changes` | Invoke | All changes cleared; Changes tab empties |
| 11.7  | `get_session_summary` | Invoke (side panel open on a page) | Returns `{ extensionConnected, activeSessions ≥ 1, sessions[] (non-empty), totalStyleChanges, totalTextChanges, totalComments }` |
| 11.8  | `export_changes` — formats | Invoke each: `format: 'css'` / `'tailwind'` / `'scss'` / `'jsx'` | Each returns the equivalent format of the current changes |
| 11.9  | `export_changes` — empty | Invoke with no changes | `"No changes to export."` |
| 11.10 | `get_screenshot` — viewport | Invoke without selector/elementId | Returns base64 PNG of the visible viewport |
| 11.11 | `get_screenshot` — element | Pass `selector` or `elementId` (`dm-*`) | Returns base64 PNG of just that element; ambiguous selectors fail with a candidate list |
| 11.11b | `get_screenshot` — comment region | Draw a region comment → from `get_changes` take its `id` → `get_screenshot({ commentId })` | Returns a PNG cropped to the region rectangle (or the element for element comments), as an image block, with **no DM overlays/bands/pins**. Off-screen region → friendly "scroll into view" error |
| 11.11c | `get_screenshot` — clean capture | Select an element with margin/padding (bands showing) → `get_screenshot` | The PNG contains no red/green bands, selection outline, guides, or pins |
| 11.12 | `get_changes` — comments carry id/region | Add an element comment + a region comment, then invoke | `comments[]` entries include `id`; the region comment has a `region: {x,y,w,h}` and `selector: "region"` |
| 11.13 | `mark_comment_resolved` | Pass a comment `id` from `get_changes` with `resolved: true` | Returns success; the page pin turns grey + struck-through, the Changes-tab row shows Resolved, with no panel reload |
| 11.14 | `mark_comment_resolved` — unknown id | Pass a non-existent id | `isError` with "No comment found with id …" |

### 11.B — Cloud mode

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 11.20 | Mode switch | MCP page → mode "Cloud" | URL field defaults to `https://mcp.designmode.app`; tenant + token fields appear |
| 11.21 | Register token | Open the cloud landing page → register → copy token + tenant ID | Token + tenant ID stored locally; indicator turns green when both present |
| 11.22 | Send to Agent | With agent connected to the cloud relay → click Send to Agent | Agent receives changes via the cloud bridge |
| 11.23 | Self-hosted | Mode "Self-hosted" → enter your Vercel URL | Same protocol as Cloud; works against any deployment of the `mcp-cloud` package |

---

## Phase 12 — data-dm-id system regression suite

This phase covers the load-bearing element-identity work added late in the v1.x cycle
(`packages/extension/src/content/change-tracker.ts` rule scoping; `html-editor.ts` clone
markers). Scoping rules to a stable per-element id is what stops edits to the original from
bleeding to duplicates and back.

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 12.1  | Override stylesheet exists | Make any style edit → DevTools → `<head>` | A `<style id="dm-applied-styles">` element appears with rules of the form `[data-dm-id="X"][data-dm-id] { prop: val !important; }` |
| 12.2  | Override beats page CSS | On a Tailwind / heavily-styled site (Stripe, Linear), edit `color`, `background-color`, `padding`, `font-size` on a styled element | Each change paints immediately. (Pre-fix `(0,1,0)` selector would silently lose to chained-class page rules.) |
| 12.3  | Token round-trip | Pick a CSS-variable colour token | `var(--token)` lands on the element; Changes tab row shows the literal `var(--token)` value |
| 12.4  | Duplicate doesn't inherit edits | Duplicate an element → edit `color` on the original | Original repaints; duplicate stays at the original colour (rules are id-scoped) |
| 12.5  | Edit duplicate doesn't bleed back | Same setup → edit `padding` on the duplicate | Duplicate updates; original stays unchanged |
| 12.6  | Reload survives both | After 12.4 + 12.5, reload | Both elements re-appear with their respective edits intact |
| 12.7  | Clear All revives & cleans markers | Clear All | Both revert; `dm-clone` and `dm-clone-<id>` marker classes are stripped |
| 12.8  | Import a JSON export | Export changes from a tab → switch tab → Import | DOM mutations replay first (duplicates + inserts before moves before deletes), then text changes, then style rules. No "missing parent" warnings |
| 12.9  | Move-dedup | Drag a layer 3 times in Layers tab | Only ONE move record exists in Changes tab — the most recent destination — and the original `origin` is preserved so Clear All puts it back at the very first parent |

---

## Phase 13 — Cross-feature regressions

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 13.1 | Hover doesn't override Selected | Select element X, hover element Y | Indicator stays "Selected" with X's data |
| 13.2 | Persistence on URL revisit | Edit `/about`, navigate `/pricing`, navigate back | Edits on `/about` are still visible |
| 13.3 | Reload extension mid-session | `chrome://extensions` → reload Design Mode | Extension reloads cleanly; saved session changes still replay |
| 13.4 | CSP-strict site | Open a site with strict CSP (e.g. github.com) | Side panel still works; hover / select / inline edits succeed |
| 13.5 | Color picker preserves cursor | Type partial hex in the inline picker | Cursor stays in the input; morphdom doesn't blur it on render |

---

## Phase 15 — Floating panel window (pop-out / pin on top / dock-back)

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 15.1 | Pop out | In the side panel header click the **external-link** icon | A chrome-less floating window opens with the full panel UI, bound to the originating tab; the side panel closes (best-effort). Design mode stays active on the tab — no overlay flicker |
| 15.2 | Floating edits target the bound tab | In the floating window, select an element / apply a style / add a comment | Changes apply to the bound tab's page and show in its Changes tab |
| 15.3 | Survives browser-tab switch | With the floating window open, switch to a different browser tab, then act in the floating window | It still controls the original bound tab (not the now-active tab) |
| 15.4 | Bounds remembered | Resize/move the floating window, close it, pop out again | The new window restores the last size/position (`dm-popout-bounds`) |
| 15.5 | Dock back | In the floating window click the **panel-right** icon | The native side panel reopens for the bound tab and the floating window closes; design mode stays active (no flicker) |
| 15.6 | Close floating window | Close the floating window via its OS close button (no dock-back) | Design mode deactivates on the bound tab only (other tabs/surfaces unaffected) |
| 15.7 | Bound tab closed | Pop out for tab A, then close tab A | The orphaned floating window closes automatically |
| 15.8 | No cross-talk (multi-surface) | Side panel controlling tab A in window 1 + a floating window for tab B | Selecting in tab A updates only tab A's panel; the tab-B window is unaffected (per-tab `targetTabId` routing + `_dmTab` broadcast filter) |
| 15.9 | MCP in floating mode | With an agent connected, run `get_changes`/`apply_changes` while popped out | They target the bound tab exactly as in the docked side panel |
| 15.10 | Pin on top | In the floating window header click the **picture-in-picture** icon | An always-on-top PiP window opens with the full panel UI; the floating window minimizes and shows a "Panel is pinned on top" placeholder. The PiP window stays above the inspected page and other apps |
| 15.11 | Pinned edits target the bound tab | In the PiP window, select an element / apply a style / add a comment | Changes apply to the bound tab's page exactly as in the floating window |
| 15.12 | Unpin to floating | Click the accent-styled **picture-in-picture** icon in the PiP header (or close the PiP via its own ✕) | The PiP window closes; the floating window un-minimizes with the full panel UI; design mode stays active (no flicker) |
| 15.13 | Dock back from PiP | Click the **panel-right** icon in the PiP header | The native side panel reopens for the bound tab; the PiP window AND the floating window close; design mode stays active (no flicker) |
| 15.14 | Back to side panel from placeholder | Restore the minimized floating window while pinned and click **Back to side panel** | Same as 15.13 |
| 15.15 | Size remembered + floor | Resize the PiP window, unpin, pin again | The new PiP window restores the last size (`dm-pip-size`), never smaller than 320×400; squeezing it narrower scrolls horizontally instead of breaking layout |
| 15.16 | Opener killed while pinned | Close the minimized floating window from the Dock/taskbar while pinned | The PiP window dies with it (its opener unloaded); design mode deactivates on the bound tab only |
| 15.17 | Minimize doesn't clobber bounds | Pin (floating window minimizes), unpin, dock back, pop out again | The floating window restores its pre-pin size/position — the minimize never overwrote `dm-popout-bounds` |
| 15.18 | Unsupported Chrome | On a Chrome build without Document PiP | The Pin on top button is absent from the floating header; if `requestWindow` throws, a toast explains and the button disappears permanently (`dm-pip-unsupported`) |

---

## Phase 16 — Local files (file://)

Precondition: "Allow access to file URLs" toggle OFF for Design Mode in `chrome://extensions` (the default).

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 16.1 | Blocked guidance card | Open a local `.html` file (`file://`) and open the side panel | A "Local file" card with numbered steps replaces the editing UI (no Layers/Design/Changes tabs); Settings/Help still open from the header |
| 16.2 | Settings shortcut button | Click **Open extension settings** on the card | A new tab opens at `chrome://extensions/?id=<extension id>` |
| 16.3 | Editing after enabling | Turn the toggle ON (extension reloads), reopen the panel on the file tab | Full editing UI; inspect/select/edit/undo work; header shows the file name (e.g. `test.html`) |
| 16.4 | Navigate pinned tab to file:// | Toggle OFF again. Open the panel on an http(s) tab, then navigate that tab to the file URL | The guidance card appears; navigating back to the http(s) page restores the editing UI |
| 16.5 | Pop-out parity | Repeat 16.1 in the floating pop-out window | Same guidance card behaviour |

---

## Phase 17 — Matching layers

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 17.1 | Check | Select a repeated element (card title, button); tick **Matching layers** in the Selected row (left of the CSS button) | Dashed overlays on all matches; "N selected" badge appears; success toast names the count |
| 17.2 | Fan-out | With the box ticked, change a style (e.g. color) | Every match updates; Changes tab shows one row per element (grouped) |
| 17.3 | Uncheck | Untick the box | Overlays clear; back to single selection |
| 17.4 | Reset on reselect | Tick the box, then select a different element | Checkbox resets to unticked for the new element |
| 17.5 | No matches | Select a unique element (e.g. the only `h1`) and tick | Error toast "No other matching layers"; checkbox stays unticked |

---

## Phase 14 — Website (docs site)

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 14.1 | Build clean | `npm run build:website` | No type errors |
| 14.2 | Landing page | Visit `/` | Header (icon + "Design Mode" + GitHub button + Add to Chrome), divider, hero, then sections: How you use it, Three panels, Other features, Copy as Prompt, MCP, Install, Licensing |
| 14.3 | Demo route | Visit `/demo` | Interactive demo loads with left nav and step targets |
| 14.4 | MCP route | Visit `/mcp` | MCP setup / docs page |
| 14.5 | Anchor scroll | Click "Add to Chrome" | Page scrolls to `#install` |
| 14.6 | GitHub button | Click GitHub icon | Opens repo in a new tab |
| 14.7 | Favicon | Hard reload | Browser tab icon is the Design Mode logo (matches `/icon.png`) |
| 14.8 | 720px column | Inspect at desktop width | Article + footer are both 720px wide and centered |
| 14.9 | Manrope font | Inspect any text | `font-family` resolves to Manrope first |
| 14.10 | Static OG image | View `/`'s `<head>` (or unfurl the URL in Slack/iMessage) | `og:image` and `twitter:image` resolve to the static `/og-image.png` (not the old dynamic `opengraph-image` route) |
| 14.11 | New content routes | Visit `/about`, `/faq`, `/contact`, `/use-cases`, `/compare`, `/docs`, `/blog` | Each returns 200 and renders (hero + related-links / persona blocks); no console errors |
| 14.12 | Dynamic detail routes | Open one `/use-cases/<slug>`, `/compare/<slug>`, `/docs/<slug>`, `/blog/<slug>` (slugs listed in `sitemap.ts`) | Renders the entry sourced from `content/*.ts`; an unknown slug 404s |
| 14.13 | sitemap.xml | Visit `/sitemap.xml` | Lists the 12 root routes + every use-cases / compare / docs / blog slug, all under `https://designmode.app` |
| 14.14 | robots.txt | Visit `/robots.txt` | `Allow: /` for `*`; LLM crawlers explicitly allowed (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, …); `Sitemap:` points to `/sitemap.xml` |
| 14.15 | llms.txt | Visit `/llms.txt` and `/llms-full.txt` | Both serve plain-text site / product summaries |
| 14.16 | Web app manifest | Visit `/manifest.webmanifest` | Serves valid JSON (name, icons, theme) |
| 14.17 | JSON-LD structured data | View source on `/`, a `/compare/<slug>`, and `/faq` | `<script type="application/ld+json">` present (e.g. SoftwareApplication / FAQPage / Article) and valid JSON |
| 14.18 | New nav + footer links | Open any page | Navbar / footer expose the new sections (FAQ, Use cases, Compare, Docs, Blog) and navigate correctly |

---

## Sign-off

After every full pass, tag the run in the project notes:

```
v1.6.0 — 2026-MM-DD
✓ All 14 phases pass
✓ npm run build:extension clean
✓ npm run prepublish:check ran without warnings
```

If a row fails, file a short bug note, fix it, and re-run only the affected phase before
publishing.
