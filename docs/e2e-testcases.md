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

---

## Phase 0.5 — Settings panel

Open via the gear icon in the side-panel header. All settings persist via `chrome.storage.local`
unless noted otherwise.

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 0.5.1 | Open / close | Click gear → click gear again | Settings view replaces the tabs; clicking again returns to the previous tab |
| 0.5.2 | Theme picker (system / dark / light) | Pick each | Side panel + page overlays update; persists across reloads |
| 0.5.3 | Color format (HEX / RGBA / HSL) | Switch each option | All colour text inputs in the Design tab re-render in the chosen format on next selection; existing rules keep their stored format |
| 0.5.4 | Screenshot capture mode | Switch among Clipboard / Download / Both | Subsequent camera-button screenshots respect the mode |
| 0.5.5 | Inspector hover colour | Pick a custom colour (e.g. green) | Hover overlay on the page renders in the new colour |
| 0.5.6 | Inspector selection colour | Pick a custom colour | Selection overlay renders in the new colour |
| 0.5.7 | MCP — port | Change to e.g. `9970` | Persists; affects the WebSocket URL the extension dials on next connect |
| 0.5.8 | MCP — auto-connect | Toggle off | Side panel doesn't auto-dial on open; the indicator stays grey until manually connected |
| 0.5.9 | MCP — mode (Cloud / Local / Self-hosted) | Switch each | Cloud (default for fresh installs) uses `https://mcp.designmode.app` (or the configured URL); Local uses `ws://localhost:<port>`; Self-hosted exposes a URL field |
| 0.5.10| MCP — cloud token & tenant | Enter a registered token + tenant ID | Stored in `chrome.storage.local`; shown masked; clearing re-disconnects |
| 0.5.11| Reset to defaults | Click Reset | Theme back to system, colour format to HEX, hover/select colours to defaults, MCP port to default |

---

## Phase 0.6 — Header overlay panels (Help, Contribute)

The header icons between the MCP chip and the gear open full-page overlays.
All three overlays (Settings, Help, Contribute) are mutually exclusive — opening
any one closes the other two.

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 0.6.1 | Open / close Help | Click `?` icon → click `?` again | Help overlay replaces the tabs; second click closes |
| 0.6.2 | Help links | From Help, click Report an issue / Read the docs / Privacy / Security disclosure | Each opens the right page in a new tab via `target="_blank"` |
| 0.6.3 | Copy diagnostics | In Help, click Copy diagnostics | Clipboard contains `Design Mode: x.y.z` + Chrome + Platform + Theme; button label flashes "Copied ✓" then reverts after ~1.5s |
| 0.6.4 | Open / close Contribute | Click heart-handshake icon → click again | Contribute overlay replaces the tabs; second click closes |
| 0.6.5 | Contribute links | Click each row in Contribute (Star repo, Review on CWS, Report issue, Start a discussion, Open a pull request, Sponsor on GitHub) | Each opens the right URL in a new tab |
| 0.6.6 | Copy share text | In Contribute, click "Share with your network" | Clipboard contains the prefilled share blurb (extension pitch + CWS link); label flashes "Copied ✓ — paste anywhere" then reverts |
| 0.6.7 | Mutual exclusivity | Open any one of Settings / Help / Contribute, then click another header icon | Previous overlay closes, new one opens |
| 0.6.8 | Theme parity | Toggle theme while each overlay is open | Colours follow `--dm-*` custom properties; no flash, no broken contrast |

---

## Phase 0.10 — Keyboard shortcuts

Defaults live in `packages/shared/src/constants.ts:DEFAULT_SHORTCUTS`. Wired actions register
through `registerShortcut(action, handler)` in `packages/extension/src/content/index.ts`.
Shortcuts are suppressed while typing in `<input>` / `<textarea>` / `contenteditable` (except
`Escape`).

| #      | Test | Steps | Expected |
|--------|------|-------|----------|
| 0.10.1 | Alt+I — Toggle inspect | Press | Inspect crosshair toggles on/off |
| 0.10.2 | Alt+A — Add comment for selected element | Select an element → press | Side panel switches to comment-add mode with the textarea focused; if nothing is selected, no-op |
| 0.10.3 | Alt+F — Freeze animations | Press | Toggles a global freeze: CSS animations + transitions + Web-Animations API instances + `<video>` elements pause; press again to resume |
| 0.10.4 | Alt+S — Element screenshot | Select element → press | PNG of the cropped element downloads with timestamp filename |
| 0.10.5 | Alt+E — Export CSS | Make any change → press | Generated CSS block copied to clipboard |
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
| 0.10.17 | Numeric Arrow stepping (px props) | Click any pixel input (e.g. font-size) → ↑ | Value increments by 1; Shift+↑ by 10 |
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

---

## Phase 3 — Design tab: spacing, layout, border, effects

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 3.1  | Spacing box layout | Select an element with margin and padding | Figma-style box shown: outer dashed (margin) → inner solid (padding) → centre dimension pill (`W × H`) |
| 3.2  | Edit padding via box | Click padding-top in the box, type `24`, blur | Element padding-top becomes `24px`; change recorded |
| 3.3  | Border width 4 sides | Set top / right / bottom / left widths | All 4 borders update independently |
| 3.4  | Border link button | Click the round link icon in the centre of the 2×2 grid | Icon turns blue (linked); editing one side updates all four |
| 3.5  | Border unlink | Click again | Icon reverts to grey outline; edits are independent |
| 3.6  | Radius linkable | Same flow with the radius grid | All four corners can be linked / unlinked |
| 3.7  | Stroke position (Inside / Outside / Center) | Change in Stroke section | Inside renders via inset box-shadow chain; Outside via `border-*` (single) or outer box-shadow (multi); Center via `outline-*` |
| 3.8  | Display flex sub-controls | Set display to flex | Flex direction / wrap / justify / align / gap controls appear |
| 3.9  | Display grid sub-controls | Set display to grid | Grid template columns/rows + gap controls appear |
| 3.10 | Position offsets | Set position to `relative`, top `10` | Element shifts down 10px |
| 3.11 | Z-index strict numeric | Type `10.5` in z-index | Allowed (2 decimals); type letters → blocked |
| 3.12 | Opacity / transform | Set `opacity: 0.5`, transform `rotate(3deg)` | Both apply visually |
| 3.13 | Box shadow builder | Use shadow inputs | Shadow appears; values reflect in Changes tab |
| 3.14 | Animation easing visualizer | Edit a `transition` value, click the curve preview icon | Bézier panel opens with adjustable control points; spring mode toggles to stiffness / damping / mass sliders |

---

## Phase 4 — Design tab: media

| #   | Test | Steps | Expected |
|-----|------|-------|----------|
| 4.1 | Image preview | Select an `<img>` | Media section shows preview thumbnail + dimensions + "Download {filename}" button |
| 4.2 | Image download | Click Download | Browser downloads the original image with its filename |
| 4.3 | SVG inline | Select an inline `<svg>` | Media section shows rendered SVG, "Download icon.svg" + "Copy SVG markup" |
| 4.4 | Copy SVG markup | Click "Copy SVG markup" | SVG `outerHTML` ends up in the clipboard (paste into a text file to verify) |
| 4.5 | Video element | Select a `<video>` | Embedded `<video>` controls + Download button |
| 4.6 | Background image | Select a div with `background-image: url(...)` | Media section detects the URL, offers download |
| 4.7 | Icon library detection | Select a Lucide / Heroicons / Remix icon | Icon section appears showing library + name; if multiple matches in the library, a replace-icon dropdown |

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

---

## Phase 6 — Comments

| #   | Test | Steps | Expected |
|-----|------|-------|----------|
| 6.1 | Add a comment | Select element → comment icon → type → Add | Yellow pin appears on the element; comment row in Changes tab |
| 6.2 | Add via Alt+A | Select element → press `Alt+A` | Comment textarea appears focused (same as clicking the comment icon) |
| 6.3 | Pin position | Add a comment | Pin sits at the top-right of the element |
| 6.4 | Pin click | Click the pin on the page | Side panel switches to Changes tab and opens the comment for editing |
| 6.5 | Edit / delete | Edit text and Save / Delete | Updates / removes the comment + pin |
| 6.6 | Mark as resolved | Click the resolved toggle on a comment row | `resolved: true` set; row moves under the Resolved sub-filter (Phase 7) |
| 6.7 | Persistence | Reload page | Comment + pin re-appear (resolved state preserved) |
| 6.8 | Pin not inspectable | Hover a pin in inspect mode | Pin is transparent to the inspector |

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

## Phase 8 — Presets

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 8.1  | Open presets | Click bookmark icon in action row | Presets panel opens with two tabs: **Built-in** and **My Presets** |
| 8.2  | Built-in tab — context | Select a `<button>`, open presets, Built-in tab | Context bar: "Showing tokens for `<button>`"; only relevant token groups (Buttons, Colors, Radius, Shadows, Borders) shown |
| 8.3  | Built-in — text element | Select an `<h2>` | Filter switches to Typography, Colors, Spacing |
| 8.4  | Apply token | Click **Apply** on any token row | `var(--token)` is set on the relevant property; row appears in Changes tab |
| 8.5  | My Presets — save form gating | Open My Presets without an element selected | Save form disabled with hint "Click an element on the page to enable saving" |
| 8.6  | Save preset — kind | Select element → My Presets → name → choose a kind (position / layout / appearance / typography / fill / stroke / effects) → Save | Preset appears in the list under the right kind; auto-switches to My Presets tab |
| 8.7  | Apply custom preset | Click Apply on a saved preset | All recorded styles applied to the selected element with `groupKind: 'preset'`; rows in Changes tab collapse to a single labelled row |
| 8.8  | Edit preset | Click pencil | Edit view: editable name + each property as a text row + remove (×) per property |
| 8.9  | Save edits | Update values → Save Changes | Preset updated in storage; list returns |
| 8.10 | Delete with confirmation | Click trash | Inline overlay modal "Delete preset?" with Cancel / Delete |
| 8.11 | Cancel delete | Click Cancel | Preset stays |
| 8.12 | Confirm delete | Click Delete | Preset removed from list and storage |
| 8.13 | Export | Click **Export** (top right) | A `design-mode-presets.json` downloads with name + styles + kind |
| 8.14 | Import | Click **Import**, choose the same JSON | Presets re-imported (deduped by ID); auto-switches to My Presets |
| 8.15 | Built-in tab disables I/O | While on Built-in tab | Import / Export buttons rendered grey, no-pointer-events |

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
| 9.9  | Freeze animations | Click the freeze toggle in the toolbar (or `Alt+F`) | Active state in the toolbar; CSS animations + transitions + WAAPI instances + `<video>` pause across the page; toggle again to resume |
| 9.10 | Undo / Redo | Make change → `Ctrl/⌘+Z` → `Ctrl/⌘+⇧+Z` | Reverts then re-applies (style, DOM, text, visibility all reversible) |

---

## Phase 10 — Bottom bar (Copy Prompt / Send to Agent)

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 10.1 | Disabled with no changes | Open a fresh page | Both buttons disabled |
| 10.2 | Disabled while previewing | Click View Original | Both buttons disabled (banner explains) |
| 10.3 | Copy Prompt format — header | Make any change → Copy Prompt | Clipboard's first line is exactly `here are the changes in {{page title}} {{page url}}` (single space between title and URL, no boilerplate above) |
| 10.4 | Copy Prompt format — body | Make 3 style + 1 text + 1 DOM change → Copy Prompt | Each change is one bullet `- {label}: {detail}` ordered chronologically. No headings, no code fences, no "How to apply" prose, no framework section |
| 10.5 | Style grouping per element | Edit two properties on the same `.btn` | Single bullet groups them: `- button.btn: padding 8px → 12px; border-radius 4px → 8px` |
| 10.6 | Text change format | Edit a heading's text | Bullet reads `- {label} text: "{old}" → "{new}"` (truncated to ~60 chars per side) |
| 10.7 | DOM change format | Duplicate / delete / move an element | Bullet reads `- {label} duplicated` (or `deleted` / `moved` / `inserted`) |
| 10.8 | Comment lines | Add a comment | Bullet reads `- note on {selector}: {text}` |
| 10.9 | Empty state | Copy Prompt with no changes | Output is the header line + `(no changes recorded yet)` |
| 10.10 | Send to Agent — connected | MCP connected | Button shows "Sent!" briefly |
| 10.11 | Send to Agent — running, no agent | Server running but no agent | Toast / alert: "MCP running but no agent connected" |
| 10.12 | Send to Agent — local offline | No local server in Local mode | Alert: "MCP server is not running. Start it with: `npm start` in `packages/mcp-local`" |

---

## Phase 11 — MCP server (local + cloud)

The local server lives in `packages/mcp-local`; the cloud relay in `packages/mcp-cloud` (deployed
at `https://mcp.designmode.app`). Both expose the **same six MCP tools**.

### 11.A — Local mode (`npm start` in `packages/mcp-local`)

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 11.1  | Server starts | `cd packages/mcp-local && npm start` | ASCII banner; six tools listed: `get_changes`, `apply_changes`, `clear_changes`, `get_session_summary`, `export_changes`, `get_screenshot`; WebSocket bridge on `ws://localhost:9960` (or the configured port) |
| 11.2  | Port conflict | Another process on 9960 | Clean error suggesting a different port or to kill the conflict |
| 11.3  | Extension connects | Side panel open + auto-connect on (default) | Green dot in MCP indicator |
| 11.4  | `get_changes` | Invoke from agent | Returns `{ pageUrl, pageTitle, styleChanges[], textChanges[], domChanges[], cssBlock, comments[] }` |
| 11.5  | `apply_changes` | Push styles from agent: `{ changes: [{ elementId, styles: { color: 'red' } }] }` | Styles apply live on the page; row appears in Changes tab |
| 11.6  | `clear_changes` | Invoke | All changes cleared; Changes tab empties |
| 11.7  | `get_session_summary` | Invoke | Returns `{ extensionConnected, activeSessions, sessions[], totalStyleChanges, totalTextChanges, totalComments }` |
| 11.8  | `export_changes` — formats | Invoke each: `format: 'css'` / `'tailwind'` / `'scss'` / `'jsx'` | Each returns the equivalent format of the current changes |
| 11.9  | `export_changes` — empty | Invoke with no changes | `"No changes to export."` |
| 11.10 | `get_screenshot` — viewport | Invoke without selector/elementId | Returns base64 PNG of the visible viewport |
| 11.11 | `get_screenshot` — element | Pass `selector` or `elementId` (`dm-*`) | Returns base64 PNG of just that element; ambiguous selectors fail with a candidate list |

### 11.B — Cloud mode

| #     | Test | Steps | Expected |
|-------|------|-------|----------|
| 11.20 | Mode switch | Settings → MCP → mode "Cloud" | URL field defaults to `https://mcp.designmode.app`; tenant + token fields appear |
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

## Phase 14 — Website (docs site)

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 14.1 | Build clean | `npm run build:website` | No type errors |
| 14.2 | Landing page | Visit `/` | Header (icon + "Design Mode" + GitHub button + Add to Chrome), divider, hero, then sections: How you use it, Three panels, Other features, Copy Prompt, MCP, Install, Licensing |
| 14.3 | Demo route | Visit `/demo` | Interactive demo loads with left nav and step targets |
| 14.4 | MCP route | Visit `/mcp` | MCP setup / docs page |
| 14.5 | Anchor scroll | Click "Add to Chrome" | Page scrolls to `#install` |
| 14.6 | GitHub button | Click GitHub icon | Opens repo in a new tab |
| 14.7 | Favicon | Hard reload | Browser tab icon is the Design Mode logo (matches `/icon.png`) |
| 14.8 | 720px column | Inspect at desktop width | Article + footer are both 720px wide and centered |
| 14.9 | Manrope font | Inspect any text | `font-family` resolves to Manrope first |

---

## Sign-off

After every full pass, tag the run in the project notes:

```
v1.2.0 — 2026-MM-DD
✓ All 14 phases pass
✓ npm run build:extension clean
✓ npm run prepublish:check ran without warnings
```

If a row fails, file a short bug note, fix it, and re-run only the affected phase before
publishing.
