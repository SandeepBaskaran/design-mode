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

---

## Phase 0 — Activation & lifecycle

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 0.1  | Extension loads | Load unpacked → check the icon in the toolbar | Design Mode icon appears, no error in `chrome://extensions` |
| 0.2  | Side panel opens | Click the toolbar icon | Side panel slides in on the right |
| 0.3  | Auto-activate inspect | Open the side panel for the first time | Cursor becomes a crosshair on the page; Design tab shows "No element selected" empty state |
| 0.4  | Pinned-tab behaviour | Open the panel on tab A, switch to tab B | The panel keeps showing data for tab A (it pins to the tab where it was opened) |
| 0.5  | Side-panel close → inspect off | Close the side panel | Crosshair cursor disappears within ~50ms; hover overlays don't follow the mouse anymore |
| 0.6  | Re-open keeps state | Re-open the panel on the same URL | Previously-applied edits are replayed (delete / hide / styles); changes badge counts match |
| 0.7  | Page reload preserves changes | Make 3 style edits + 1 hide + 1 delete, reload | All 5 are re-applied automatically when the panel re-opens |
| 0.8  | URL navigation isolates | Navigate to a different URL in the same tab | Changes from URL A do **not** apply to URL B; Changes tab resets |
| 0.9  | Browser-session boundary | Close & reopen browser | Session storage is cleared (per `chrome.storage.session` semantics) — fresh state |
| 0.10 | Theme toggle | Click sun/moon in header | Side panel + page overlays switch theme; persists across reloads |
| 0.11 | Keyboard shortcut | Press `Alt+D` | Side panel toggles open / close |

---

## Phase 1 — Inspect & select

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 1.1  | Hover highlight | Move mouse over page elements | Blue overlay tracks the hovered element with rounded corners |
| 1.2  | Click to select | Click any element | Orange selection overlay with `W × H` dimension label |
| 1.3  | Selected state in header | After click | Design tab indicator shows **Selected** (blue badge) — never **Hovering** |
| 1.4  | Hover→Click race fix | Hover an element ~80ms then click it | Indicator goes straight to **Selected**; never flips back to **Hovering** |
| 1.5  | Breadcrumbs | Select a deeply-nested element | Breadcrumb path shown (e.g. `body › main › section.hero › h1`) |
| 1.6  | Comment pins not selectable | Hover/click a yellow pin | Pin is NOT highlighted by the inspector |
| 1.7  | DM overlays not selectable | Hover the blue or orange overlay | Overlay is transparent to the mouse (passes through) |
| 1.8  | Selection follows scroll | Select an element then scroll | Orange overlay stays anchored to the element |
| 1.9  | Escape deselects | Press `Escape` with a selection | Selection cleared, design tab returns to empty state |
| 1.10 | Parent / child traversal | Click ↑ then ↓ in the action row | Selection moves to parent, then back to first child |

---

## Phase 2 — Design tab: Typography

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 2.1  | Text content field — leaf text | Select a `<p>` / `<h1>` with no element children | "Text Content" textarea shows the element's text |
| 2.1a | Text content field — every "T" layer | Select **any** layer that shows the T (type) icon in Layers (h1-h6, p, span, a, label, button, li, etc.) | "Text Content" textarea appears even if the layer has child elements |
| 2.1b | Text edit warning when children exist | Select a text layer with children → look below the textarea | "Saving will replace the child elements with plain text." note appears |
| 2.2  | No text field for non-text containers | Select a generic `<div>` / `<section>` (icon is layoutGrid / layoutDashboard, not T) | No "Text Content" field |
| 2.3  | Edit text records change | Change text → press `Ctrl+Enter` | Element text updates AND a text-change row appears in the Changes tab |
| 2.4  | Font weight named dropdown | Click weight | Options shown as `Thin (100)`, `Light (300)`, `Regular (400)`, `Medium (500)`, `Semi Bold (600)`, `Bold (700)`, etc. |
| 2.5  | Strict numeric inputs | Type `abc` in font size | Characters are blocked; only digits / single minus / one decimal up to 2 places allowed |
| 2.6  | Arrow stepping | Click size, press ↑ | Increments by 1 (px appended automatically) |
| 2.7  | Shift + arrow stepping | `Shift+↑` | Increments by 10 |
| 2.8  | Bold / italic / underline / strike toggles | Click each B / I / U / S | Toggles apply visually; toggle again to remove |
| 2.9  | Color picker dropdown | Click any colour text input | Custom dropdown lists site CSS variable colours with swatch + name + hex |
| 2.10 | Color picker search | With dropdown open, type "primary" | Token list filters to only `--*primary*` rows |
| 2.11 | Custom hex via Enter | Type `#abc123` and press Enter | Dropdown closes; `#abc123` applied as the colour |
| 2.12 | Click outside closes dropdown | Click anywhere outside | Dropdown closes |
| 2.13 | HEX vs RGBA format | Settings → Color Format → HEX | All colour text inputs render `#xxxxxx`; switch to RGBA → `rgba(...)` |
| 2.14 | Text alignment / transform / decoration | Change each control | Element updates instantly |

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
| 3.7  | Display flex sub-controls | Set display to flex | Flex direction / wrap / justify / align / gap controls appear |
| 3.8  | Display grid sub-controls | Set display to grid | Grid template columns/rows + gap controls appear |
| 3.9  | Position offsets | Set position to `relative`, top `10` | Element shifts down 10px |
| 3.10 | Z-index strict numeric | Type `10.5` in z-index | Allowed (2 decimals); type letters → blocked |
| 3.11 | Opacity / transform | Set `opacity: 0.5`, transform `rotate(3deg)` | Both apply visually |
| 3.12 | Box shadow builder | Use shadow inputs | Shadow appears; values reflect in Changes tab |

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

---

## Phase 5 — Layers tab

| #   | Test | Steps | Expected |
|-----|------|-------|----------|
| 5.1 | DOM tree loads | Switch to Layers | Indented tree of every visible element |
| 5.2 | Search | Type `button` in the search field | Tree filters to layers with `button` in tag or display name; ancestors expand to show matches |
| 5.3 | Layer click | Click a layer row | Element selected on the page, Design tab populates |
| 5.4 | Layer hover | Hover a row | Blue overlay appears on the corresponding page element |
| 5.5 | Drag to reorder | Drag a row over a sibling | Source DOM updates; "move" entry appears in Changes tab |
| 5.6 | Visibility toggle | Click the eye icon on a row | Element becomes `display: none`; row dims; eye icon flips to eyeOff |
| 5.7 | Trash icon | Click the trash icon | Element removed; "delete" entry appears in Changes tab |
| 5.8 | DM elements excluded | Inspect the tree | No `dm-hover`, `dm-select`, `dm-comment-pin` rows |

---

## Phase 6 — Comments

| #   | Test | Steps | Expected |
|-----|------|-------|----------|
| 6.1 | Add a comment | Select element → comment icon → type → Add | Yellow pin appears on the element; comment row in Changes tab |
| 6.2 | Pin position | Add a comment | Pin sits at the top-right of the element |
| 6.3 | Pin click | Click the pin on the page | Side panel switches to Changes tab and opens the comment for editing |
| 6.4 | Edit / delete | Edit text and Save / Delete | Updates / removes the comment + pin |
| 6.5 | Persistence | Reload page | Comment + pin re-appear |
| 6.6 | Pin not inspectable | Hover a pin in inspect mode | Pin is transparent to the inspector |

---

## Phase 7 — Changes tab

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 7.1  | Empty state | No changes yet | Sparkles icon + "No changes yet" message |
| 7.2  | Style change recorded | Edit any CSS property | Row appears with `prop: old → new` and the element selector |
| 7.3  | Text change recorded | Edit text content | Text-change row appears with old → new snippets |
| 7.4  | DOM change recorded | Duplicate / delete / move / hide | Row appears with the action label |
| 7.5  | No double-record on duplicate | Click Duplicate **once** | Exactly **one** "duplicate" row appears (regression: previously logged twice) |
| 7.6  | Comment recorded | Add a comment | Yellow note row appears with selector |
| 7.7  | Single revert | Hover a row → click trash | Style/text/DOM change is **actually reversed** on the page (not just removed from the list) |
| 7.8  | Revert duplicate | Trash a duplicate row | The duplicated element is removed from the DOM |
| 7.9  | Revert delete | Trash a delete row | The deleted element is re-inserted from saved outerHTML |
| 7.10 | View Original | Click **View Original** | Page visually reverts to its initial state — styles, text, deleted elements re-appear, duplicates hide, comment pins hide. Banner: "Viewing original — click View Changes to see your edits" |
| 7.11 | View Changes | Click **View Changes** | Edits + duplicated elements + comment pins re-appear |
| 7.12 | Toggle button states | While viewing one mode | Active button is filled accent; inactive button is outline |
| 7.13 | Clear All reverts everything | Click **Clear All** | Every style / text / DOM / comment is undone on the page; Changes tab empties; persistence cleared |
| 7.14 | Batch apply (zap) — outline | Edit a property on a recurring class (e.g. `.btn`) | Zap icon next to the row is grey outline by default |
| 7.15 | Batch apply — fill | Click the zap | Icon becomes filled accent; the same change applies to every matching element on the page |
| 7.16 | Batch unflag | Click zap again | Icon returns to outline (does NOT un-apply the changes — that's the trash button's job) |
| 7.17 | Tab badge count | Make 5 changes | "Changes" tab shows badge `5` (style + text + DOM + comments combined) |
| 7.18 | Group by element | Make multiple edits to the same `.card` | Changes tab groups them under one selector header with a count |

---

## Phase 8 — Presets

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 8.1  | Open presets | Click bookmark icon in action row | Presets panel opens with two tabs: **Built-in** and **My Presets** |
| 8.2  | Built-in tab — context | Select a `<button>`, open presets, Built-in tab | Context bar: "Showing tokens for `<button>`"; only relevant token groups (Buttons, Colors, Radius, Shadows, Borders) shown |
| 8.3  | Built-in — text element | Select an `<h2>` | Filter switches to Typography, Colors, Spacing |
| 8.4  | Apply token | Click **Apply** on any token row | `var(--token)` is set on the relevant property; row appears in Changes tab |
| 8.5  | My Presets — save form gating | Open My Presets without an element selected | Save form disabled with hint "Click an element on the page to enable saving" |
| 8.6  | Save preset | Select element → My Presets → name → Save | Preset appears in the list; auto-switches to My Presets tab |
| 8.7  | Apply custom preset | Click Apply on a saved preset | All recorded styles applied to the selected element; rows in Changes tab |
| 8.8  | Edit preset | Click pencil | Edit view: editable name + each property as a text row + remove (×) per property |
| 8.9  | Save edits | Update values → Save Changes | Preset updated in storage; list returns |
| 8.10 | Delete with confirmation | Click trash | Inline overlay modal "Delete preset?" with Cancel / Delete |
| 8.11 | Cancel delete | Click Cancel | Preset stays |
| 8.12 | Confirm delete | Click Delete | Preset removed from list and storage |
| 8.13 | Export | Click **Export** (top right) | A `design-mode-presets.json` downloads with name + styles |
| 8.14 | Import | Click **Import**, choose the same JSON | Presets re-imported (deduped by ID); auto-switches to My Presets |
| 8.15 | Built-in tab disables I/O | While on Built-in tab | Import / Export buttons rendered grey, no-pointer-events |

---

## Phase 9 — Action row

| #   | Test | Steps | Expected |
|-----|------|-------|----------|
| 9.1 | Parent / child / duplicate / delete / comment / screenshot | Each button | All work as labelled |
| 9.2 | Disable when no selection | Deselect | Parent, child, duplicate, delete, comment dim out; screenshot stays enabled |
| 9.3 | Screenshot — viewport | No selection (and no hover) → click camera | Full viewport PNG copied to clipboard |
| 9.4 | Screenshot — element only | **Select** an element → click camera | PNG copied to clipboard contains **only that element** (cropped from viewport, not the surrounding page) |
| 9.4a | Screenshot — element scrolled into view | Select an element below the fold → camera | Page scrolls element into view first, then captures cropped image — never returns a blank or off-screen capture |
| 9.5 | Computed CSS | Click `</>` | Slide-up overlay shows the element's computed CSS block; Copy button works |
| 9.6 | Undo / Redo | Make change → `Ctrl+Z` → `Ctrl+Shift+Z` | Reverts then re-applies (style, DOM, text, visibility all reversible) |

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
| 10.8 | Comment / annotation lines | Add a comment | Bullet reads `- note on {selector}: {text}`; annotations prefix with `[intent]` |
| 10.9 | Empty state | Copy Prompt with no changes | Output is the header line + `(no changes recorded yet)` |
| 10.10 | Send to Agent — connected | MCP connected | Button shows "Sent!" briefly |
| 10.11 | Send to Agent — running | Server running but no agent | Toast / alert: "MCP running but no agent connected" |
| 10.12 | Send to Agent — offline | No server | Alert: "MCP server is not running. Start it with: npm start" |

---

## Phase 11 — MCP server

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 11.1 | Server starts | `npm start` | ASCII banner + 19 tools listed; WebSocket bridge on `ws://localhost:9960` |
| 11.2 | Port conflict | Another process on 9960 | Clean error suggesting a different port or to kill the conflict |
| 11.3 | Extension connects | Side panel open + auto-connect on | Green dot in MCP indicator |
| 11.4 | `get_changes` | Invoke from agent | Returns full structured payload (style + text + DOM) |
| 11.5 | `get_session_summary` | Invoke | Returns counts, sessions, intent/severity breakdown |
| 11.6 | `apply_changes` | Push styles from agent | Styles apply live on the page |
| 11.7 | `clear_changes` | Invoke | All changes cleared; Changes tab empties |
| 11.8 | `get_tailwind` / `get_scss` / `get_jsx_styles` | Invoke each | Each returns the equivalent format of the current changes |
| 11.9 | `watch_annotations` | Subscribe → add a comment in the panel | Subscriber receives the new annotation |

---

## Phase 12 — Cross-feature regressions

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 12.1 | Hover doesn't override Selected | Select element X, hover element Y | Indicator stays "Selected" with X's data |
| 12.2 | Clear All revives deletions | Delete 2 elements → Clear All | Both elements re-appear |
| 12.3 | Clear All clears comments | Add 2 comments → Clear All | Pins disappear; Changes tab is empty |
| 12.4 | Persistence on URL revisit | Edit `/about`, navigate `/pricing`, navigate back | Edits on `/about` are still visible |
| 12.5 | Reload extension mid-session | `chrome://extensions` → reload Design Mode | Extension reloads cleanly; saved session changes still replay |
| 12.6 | CSP-strict site | Open a site with strict CSP (e.g. github.com) | Side panel still works; hover / select / inline edits succeed |

---

## Phase 13 — Website (docs site)

| #    | Test | Steps | Expected |
|------|------|-------|----------|
| 13.1 | Build clean | `npm run build:website` | No type errors; routes are `/`, `/icon.png`, `/apple-icon.png`, `/_not-found` only |
| 13.2 | Single page | Visit `/` | Header (icon + "Design Mode" + GitHub button + Add to Chrome), divider, hero, then sections: How you use it, Three panels, Other features, Copy Prompt, MCP, Install, Licensing |
| 13.3 | Anchor scroll | Click "Add to Chrome" | Page scrolls to `#install` |
| 13.4 | GitHub button | Click GitHub icon | Opens repo in a new tab |
| 13.5 | Favicon | Hard reload | Browser tab icon is the Design Mode logo (matches `/icon.png`) |
| 13.6 | 720px column | Inspect at desktop width | Article + footer are both 720px wide and centered |
| 13.7 | Manrope font | Inspect any text | `font-family` resolves to Manrope first |

---

## Sign-off

After every full pass, tag the run in the project notes:

```
v1.0.0 — 2026-05-04
✓ All 13 phases pass
✓ npm run build clean
✓ npm run prepublish:check ran without warnings
```

If a row fails, file a short bug note, fix it, and re-run only the affected phase before
publishing.
