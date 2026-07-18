# Design Mode — Features

Every feature in the extension, the side panel, and the MCP server, with what
it does and how to use it. Grouped by where you find it.

---

## 1. The browser viewport (canvas)

The extension turns any web page into an editable surface. While Design Mode
is on, hovering an element shows a blue outline; clicking selects it (orange
outline). The side panel mirrors whatever you have selected.

### 1.1 Inspect / hover

- **What it does**: highlights the element under the cursor and pushes its
  computed styles to the side panel. Hovering also draws dashed **axis
  guide lines** through the element's four edges, spanning the page, so you
  can eyeball alignment against everything else.
- **Use**: just move the mouse. The Design tab updates with the hovered
  element's styles when nothing is selected.

### 1.2 Click to select

- **What it does**: locks the orange outline on a single element, marks it
  as the editing target, and shows its dimensions. The selection also gets
  **8 resize handles** — four corners + four edge midpoints.
- **Use**: click any element. Press `Escape` to deselect.
- **Drag to resize**: drag any handle. The element resizes live, the orange
  outline + `W × H` label track instantly, and the Design tab's width/height
  fields update as you go. On release the new `width`/`height` ship — they
  land in the **Changes** tab (as a grouped "Resize" entry) and in the CSS
  export, just like any other edit. Edge handles change a single dimension;
  corner handles change both. Resizing from the Design tab keeps the handles
  in sync.
- **Drag to move**: with an element selected, drag its body (anywhere
  outside the 8 handles) to reposition it. The cursor switches to `move`
  the moment you're over the selection; the outline + handles follow the
  cursor, and the Design tab's **X** / **Y** fields tick along. Hold
  **Shift** to lock motion to the dominant axis. On release the new
  `left`/`top` land in the **Changes** tab as a grouped "Move" entry and
  in the CSS export. Elements that were `position: static` auto-promote
  to `relative` on first drag (so `left`/`top` actually take effect) —
  the promotion is captured into the same Changes entry, so a single
  undo reverts both the position switch and the offsets. In multi-select,
  dragging any selected member moves the whole set together as one undo
  step.

### 1.3 Multi-select (Shift-click, or the Layers-tab toggle)

- **What it does**: adds the element to a selection set instead of replacing
  the single selection. Edits in the Design tab fan out to every selected
  element — one change record per element so the Changes tab and Copy as Prompt
  show the full impact. With two or more elements selected, the **pixel
  spacing between them** is drawn as distance pills.
- **Use**: **Shift-click** elements directly on the page, or open the
  **Layers** tab → flip the **Multi-select** toggle to the right of the
  search box and click N elements (page or Layers list — both work). The
  button shows a count badge. Press `Escape` or click the toggle again to
  exit. (While inspecting, native text selection is suppressed so shift-click
  never highlights page text.)
- **Matching layers** (checkbox in the Design tab's Selected row, next to
  the CSS button): builds the multi-selection for you from every layer
  *like* the selected one — same tag sharing a class (classless elements
  match classless same-tag peers under the same parent). Checking it
  selects all matches so every Design-tab edit fans out to them;
  unchecking (or selecting another element, or `Escape`) returns to
  single selection.

### 1.4 Animation freeze (Motion section)

- **What it does**: pauses every CSS animation, transition, Web Animations
  API instance, and `<video>` on the page so you can inspect a mid-flight
  state. Page-wide, not element-scoped.
- **Use**: click the **circle-pause** icon in the **Motion** section header
  (Design tab), next to the `+` add-motion menu. Icon flips to
  **circle-play** when frozen — click again to resume. Also bound to `Alt+P`.
  The Motion section is shown for the page context too, so the toggle is
  reachable even when nothing is selected (freeze is page-wide).

### 1.5 Screenshot (camera button)

- **What it does**: captures a PNG of the page or the selected element.
- **Use**: click the **camera** icon. The behavior follows your **Capture
  Mode** setting (`clipboard` / `download` / `both`). A toast confirms.

### 1.6 Comment pins (yellow tear-drop overlay)

Comments anchor a sticky note to a specific element. Each comment renders as a draggable pin on top of the page, and as a row in the Changes tab.

- **Add**: select an element, click the toolbar's **message-square** icon, type the body, click Add.
- **Region comment** (Figma-style drop): click the toolbar's **dashed-square** icon (or press `Alt+R`) to enter drop mode, then **drag a box** anywhere on the page — or just **click to drop** a default-sized box — without selecting any DOM element. The yellow box **stays on the page while you compose** and only goes away when you **Add** (it becomes the committed region box + numbered pin) or **Cancel** (it's removed). A region comment flags an *area* (e.g. "this empty space needs a CTA"), stores its geometry in document coordinates so it scrolls with the page, and shows a `region` badge in the Changes tab. Region geometry rides along in `get_changes` so an agent can `get_screenshot` the area.
- **Pin number**: pins are numbered in creation order (`1`, `2`, `3` …). The number renders inside the pin (replacing the `💬` emoji) and on the matching panel row's `#N` badge so the user can match overlay ↔ panel at a glance.
- **Drag-to-reposition**: click and drag the pin to move it relative to the element. The offset is persisted; subsequent renders honour it. Click without dragging still opens the panel card.
- **Resolve**: click the green **Resolve** button on the comment row. The pin fades to grey + 60% opacity; the body strikes through. Resolving keeps the comment (it's not a delete) — click **Reopen** to restore.
- **Hide all**: the new `eye` / `eye-off` toolbar action toggles every pin on the page. The Changes tab still shows them; only the page overlay is muted. State persists across sessions via `chrome.storage.local`.
- **Click**: opens the comment row in the panel and scrolls the page to the layer.

### 1.7 Distance measurement (spacing)

- **What it does**: with one element selected, hovering another element shows
  the **edge-to-edge spacing** between them as orange pills with connector
  lines — both the gap on the open axis AND the side-edge offsets (e.g. a
  `20` px vertical gap plus the `40` / `52` px left/right offsets). When one
  element contains the other, it shows the four inset gaps (left / right /
  top / bottom) instead. With a multi-selection, the pills measure the
  spacing between the selected elements.
- **Use**: select an element, then hover its container or a neighbour. The
  pills are a session-only visual aid — they're never recorded as a change.

---

## 2. Side panel — Design tab

The Design tab is the property editor for the currently selected (or
hovered) element. Every field updates the page live.

### 2.1 Selection indicator

- Shows `Selected <tag>` or `Hovering <tag>` plus a `N selected` chip if
  multi-select is on.
- Right side: **CSS** button → opens an overlay with the element's full
  computed CSS (you can copy it). Disabled when nothing is selected.

### 2.2 Source section *(only when source detection succeeds)*

- **Component name** + framework chip (`REACT` / `VUE` / `ANGULAR` / `SVELTE`).
- **File path with `:line`** + an **Open in VS Code** button.
- **Tree** showing the component hierarchy (`<App> › <Layout> › <Card>`).
- This data ships in **Copy as Prompt** so the agent edits the right file.

### 2.3 Icon section *(only when an SVG / icon library is detected)*

- Detects Lucide, FontAwesome and similar libraries.
- Lets you swap the icon name from a dropdown of every other icon already
  used on the page.

### 2.4 Typography

- Font family (free text), Weight (named dropdown), Size, Line height,
  Letter spacing.
- Alignment (left / center / right / justify) + **Bold / Italic / Underline /
  Strikethrough** toggles using Lucide icons.
- Text color (color picker + design-token dropdown).
- Text Transform (none / uppercase / lowercase / capitalize).
- **Text Content** textarea — directly edits `textContent` for text-bearing
  tags. Min 4 lines, drag to expand.

### 2.5 Background

- Color picker + token dropdown.
- Image / gradient text input.
- Size, Position, Repeat selects.

### 2.6 Size & Spacing

- Width / Height / Min-Max with unit-aware number inputs.
- Margin and Padding rendered as a Figma-style box-model with linkable sides.

### 2.7 Layout

- Display select (block / flex / grid / inline / inline-flex / inline-grid /
  none) + Overflow.
- Flex section *(when display is flex)*: Direction, Wrap, Justify, Align,
  Gap, Grow, Shrink.
- Grid section *(when display is grid)*: Template Cols/Rows, Col/Row Gap.
- Col/Row gap fields have a **Fixed / Auto** mode (like Width/Height): Fixed
  takes a typed px value; Auto spreads the children evenly via
  `space-between` and shows the measured effective gap read-only.
- **Margin** and **Padding** rows (Figma-style): a uniform value with an
  expand button that drops a 4-side editor (top / right / bottom / left),
  mirroring the corner-radius pattern. The Chrome-DevTools computed box
  (padding nested in margin) now lives under Layout → **Advanced**.

### 2.8 Position

- Position select (static / relative / absolute / fixed / sticky), Z-Index,
  and per-side Top/Right/Bottom/Left number fields.

### 2.9 Border

- Per-side **Width** (linkable), **Style** (linkable), **Color** (linkable),
  per-corner **Radius** (linkable). Click the chain icon between the four
  fields to link/unlink.
- **Outline**: width / style / color (single linked editor).

### 2.10 Appearance

- Opacity, Rotation (degrees), Visibility, Mix-blend-mode, Cursor.
- **Transform** (raw text) — for skew, perspective, custom matrix, etc.
- **Transform components**: Translate (X / Y in px) and Scale (X / Y, unitless).
  Each pre-filled from the element's current value. Standalone CSS props,
  compose with the raw `Transform` field above.
- **Interaction**: pointer-events, user-select.

### 2.11 Effects (Figma-aligned)

Effects ships six layered-row kinds; each row reorders via drag, hides via
the eye toggle, and removes via the trash. The `+` menu seeds a new entry
of the picked kind with sensible defaults.

- **Inner shadow** — `box-shadow` with `inset`. Position X/Y, blur, spread,
  colour + opacity.
- **Drop shadow** — one row, three underlying CSS chains. The
  "Show behind transparent areas" checkbox swaps between them at write
  time:
  - Checked → `box-shadow` (rectangle, shows through transparent
    pixels in the element).
  - Unchecked + text-kind element → `text-shadow` (alpha-bound to
    glyphs only, no spread).
  - Unchecked + other element → `filter: drop-shadow(...)` (alpha-bound
    to whole-element rendered shape, no spread).
  Spread is preserved in the typed model when toggling off; toggling
  back on re-emits with the original value.
- **Layer blur** — `filter: blur(<radius>)`. Radius is inline in the
  row (single field; Progressive blur is intentionally not supported
  because CSS has no true gradient blur).
- **Background blur** — `backdrop-filter: blur(<radius>)`, same shape.
- **Noise** — Mono / Duo / Multi tabs. Renders via SVG-data-URI
  background images (`feTurbulence` + `feColorMatrix` tinting) into
  the element's `::after` pseudo-element. Mono and Duo tint to one
  or two colours at chosen opacities; Multi keeps the noise's full-
  spectrum colour and attenuates alpha.
- **Texture** — `feTurbulence` + optional `feGaussianBlur` (radius)
  for a paper / canvas grain. Size X/Y scale the pattern; the
  "Clip to shape" checkbox sets `border-radius: inherit` +
  `clip-path: inherit` on the `::after` so the texture matches the
  element's mask / rounded corners.

### 2.12 Motion section

Split from Effects so the visual-decoration and time-based-motion
controls don't compete for the same row list. Starts collapsed.

The section header carries two actions: a **pause/resume** toggle
(circle-pause / circle-play) that freezes all motion page-wide (see §1.4),
and the `+` **add-motion** menu.

- **Transition** — Property dropdown, Duration, Timing curve, Delay + a
  ▶ Preview button that flashes a contrast value so you can see the curve.
- **Animation** — Name (12 built-in `dm-*` keyframes auto-injected into the
  page: `dm-fade-in`, `dm-slide-up/down/left/right`, `dm-pulse`, `dm-bounce`,
  `dm-shake`, `dm-spin`, `dm-wiggle`, `dm-ping`, `dm-fade-out`), Duration,
  Timing, Delay, Iterations (with ∞ toggle), Direction, Fill mode, Play state,
  + ▶ Preview button that re-triggers the animation cleanly.
- **Transform** — structured X/Y/Z editor for `translate`, `rotate`,
  `scale`, with combined `transform`-function support for shear /
  perspective.
- **Motion path** — `offset-path` + `offset-distance` + `offset-rotate`
  + `offset-anchor` + `offset-position`. A "Motion path" preset in
  the `+` menu seeds an oval to start from.
- **View transition** — `view-transition-name` + `view-transition-class`,
  paired with a note that the API only fires inside
  `document.startViewTransition(...)`.
- **Scroll-driven animation** — `animation-timeline`, `animation-range`,
  `scroll-timeline`, `view-timeline` and their named variants.

### 2.13 Layout guide

Figma-style design-aid overlay. Paints Columns / Rows / Grid bars over
the selected element via a `::before` pseudo-element. Doesn't affect
layout; per-element session memory; survives page reload while the
side panel is open.

- **Kind** — Grid · Columns · Rows.
- **Primary row** — Kind dropdown + count (or cell size for Grid) +
  settings expand + eye + trash.
- **Expanded body (Columns / Rows)** — 3×2 grid of Colour + Opacity /
  Align + Width or Height / Margin + Gutter.
- **Expanded body (Grid)** — 1×2 of Colour + Opacity.
- **Section eye** — top-right of the section header toggles every
  guide on the current element without losing the row config.

### 2.14 Custom curves

- The transition / animation timing dropdown also opens a **cubic-bezier
  visualizer** with sliders for x1/y1/x2/y2 and a spring-physics mode (mass /
  damping / stiffness). Apply the result directly into the transition or
  animation timing field.

### 2.15 Media (when an `<img>`, `<video>`, `<audio>`, or SVG is selected)

- Preview thumbnail.
- Meta line shows resolution, kind, and transferred file size (e.g.
  `1200 × 630px · image · 124 KB`) — size is read from the browser's resource
  timing (no extra network) and omitted for cross-origin opaque resources.
- For images: src input, alt text, object-fit dropdown.
- For SVG: **Copy SVG markup** button.
- **Download** button to save the asset locally.

### 2.16 Color picker — design-system tokens

- The color picker dropdown lists every `--var` declared on the page,
  grouped (Colors, Backgrounds, Buttons, Borders, etc.) and filtered by
  the kind of element you have selected.
- Picking a token writes `var(--name)` instead of a raw hex. The Copy
  Prompt output then resolves matching values back to `var(--name)`
  automatically.
- **Inline WCAG contrast checker** (when picking a foreground colour): the
  contrast ratio against the effective background, an absolute rating
  (Excellent / Good / Poor / Very Poor), AA and AAA pass/fail tabs, and a
  Category override (Auto / Large / Normal / Graphics). Category and level
  persist across sessions.

---

## 3. Side panel — Layers tab

A Figma-style DOM tree of the page.

### 3.1 Search

- Filters the tree by tag, id, or class. Match-highlight + ancestor reveal.

### 3.2 Multi-select toggle

- Sits next to the search box. See §1.3 above.

### 3.3 Layer rows

- Tag-aware icon (`type` for headings, `image` for `<img>`, etc.).
- Click → selects (single) or toggles (multi-select on).
- **Eye toggle** → hides/shows the element (records as a style change).
- Members of the multi-select set show a checkmark + accent border-left.

### 3.4 Drag-to-reorder

- Drag any layer onto another. Drop on the **upper half** = insert before;
  drop on the **lower half** = insert after.
- Recorded as a **DOM `move` change** with the destination parent + index.
  Survives page reload via the override stylesheet's session replay.
- Shows up in the Changes tab (`MOVE <tag>`) and in Copy as Prompt as
  `<label> moved → <parent>[<index>]`.

### 3.5 Indentation guides + collapse

- Vertical guides show ancestry depth at a glance.
- Click a chevron to collapse a subtree (state persists across re-renders).

---

## 4. Side panel — Changes tab

Every edit you've made grouped by element.

### 4.1 Style change row

- One row per style change. Shows `<prop>: <old> → <new>` with strikethrough
  on the old value, success-green on the new.
- **Zap icon** with a `×N` count badge — click to **batch-apply** the change
  to every other DOM element matching the saved selector. Tooltip says
  "Apply to all 3 matching elements".
- **Trash icon** reverts only this change.
- Click anywhere else on the row to **scroll the page to** and **highlight**
  that element.

### 4.2 Text change row

- Shows truncated old → new text. Same click-to-scroll + revert.

### 4.3 DOM change row

- delete / duplicate / insert / move with appropriate color and icon.
- Move rows display the destination from the layer-reorder data.

### 4.4 Comment row

- **Numbered pin badge** (`#1`, `#2`, …) — matches the number painted on the page pin so panel ↔ overlay reference is unambiguous. Yellow when open, grey when resolved.
- Yellow message-square icon.
- **Body** — full text. Strikethrough + faded when the comment is resolved.
- **Resolve / Reopen** button — toggles the resolved flag (kept, not deleted). Open comments show a green Resolve; resolved show a neutral Reopen.
- **Edit** — opens the comment-edit card up at the top of the panel.
- **Delete** — opens an inline confirmation overlay (Esc cancels). Same pattern as Clear All / Reset settings.
- **Time-ago** — `5m ago` mono chip. When `updatedAt > timestamp`, appends `· edited 1m ago`.
- **Per-row checkbox** — comments participate in the bulk-revert toolbar like every other change kind.
- **Click body** — switches to expanded "viewing" state and scrolls the page to the pin.

### 4.4b Token change row

- Design-system **token edits** (made in the Design-system / Tokens panel) now
  appear here, grouped under a synthetic `:root` group. Each row shows
  `--var: <original> → <current>` with a swatch-book icon.
- **Revert** restores the token to its original value (clears the `:root`
  override). The **Tokens** filter chip narrows to just these rows. They are
  sourced from the same store the Copy as Prompt reads, so tab and prompt always
  agree; "Clear all" wipes them too.

### 4.5 Group header

- Each group of changes for one selector has a header with `selector + N`
  changes badge + a select-element button.

### 4.6 Changes toggle

- Single button at the top of the tab with an eye icon and "Changes"
  label. When your edits are visible (default state), the button reads
  active with `eye`. Click it to preview the original — the button
  switches to a muted `eye-off` and a banner appears. Click again to
  restore.

### 4.7 Clear all

- Drops every tracked change AND clears the override stylesheet — page
  returns to its natural state. Confirms via an overlay before doing it
  (no muscle-memory disasters).

### 4.8 Export / Import

- **Export** writes every tracked change to a JSON file. Useful for
  stashing a session before Clear all, or sharing a snapshot with a
  teammate.
- **Import** replaces every change with the JSON's contents. Picks up
  where the export left off.

### 4.9 Sticky header

- The buttons row, search row, and filter chips row are all pinned
  ("position: sticky") to the top of the Changes body. Stay accessible
  while scrolling the list. The same pattern is used in the Layers tab
  for its search + filter chip rows.

---

## 5. Side panel — header & toolbar

### 5.1 Header

- App name + **MCP status chip** — three states: `offline` (grey), `running` (green pulse), `connected` (green glow). The whole chip is clickable; clicking it re-pings the server / agent. The hover tooltip explains the current state and includes the start command (`npm start --prefix packages/mcp-local`) when offline. State changes after the click surface as toasts (`MCP connected`, `MCP running — waiting for agent`, `MCP offline`); a click that doesn't change state still toasts the offline-with-hint message so the user gets feedback.
- **Theme toggle** (cycles system / dark / light), **Contribute**
  (heart-handshake — opens a full-page overlay with ways to support
  the project), **Help** (`?` — opens the Help overlay with "Report
  an issue" and "Copy diagnostics"), and **Settings** (gear). All
  three full-page overlays are mutually exclusive.
- **Pop out / Pin on top / Dock back** — the panel runs in three surfaces:
  - Default: Chrome's native **side panel** (docked to the browser). Its
    header shows **Pop out** (`external-link` icon).
  - **Pop out** opens the same panel as a free-floating window bound to the
    tab it was popped from; size/position are remembered
    (`dm-popout-bounds`). Its header shows **Pin on top**
    (`picture-in-picture-2` icon) and **Dock back** (`panel-right` icon).
  - **Pin on top** (floating window only — Chrome's PiP API requires the
    gesture there) moves the panel into an always-on-top Document
    Picture-in-Picture window (Chrome 116+) that floats above the inspected
    page and every other window — no ⌘`-switching while editing. The
    floating window parks minimized as the PiP's keep-alive opener (a PiP
    window dies when its opener unloads) with a "Panel is pinned on top"
    placeholder.
  - In the PiP window the same `picture-in-picture-2` icon renders in the
    active (accent) style — clicking it (or the PiP's own ✕) toggles the pin
    off, back to the floating window. **Dock back** (`panel-right` icon)
    next to it returns straight to the docked side panel — from PiP, both
    other states are one click away.
  - PiP size is remembered (`dm-pip-size`) and floors at 320×400 (the side
    panel's own min width); Chrome has no API to stop manual resizing below
    that, so a squeezed window scrolls horizontally instead of breaking. The
    pin button hides permanently on Chrome builds without the API
    (`dm-pip-unsupported`).
  - Each panel surface is bound to a specific tab (the background routes every
    `SP_*` message by `targetTabId`), so multiple surfaces across tabs/windows
    never cross-talk. Closing the last surface for a tab deactivates design
    mode on just that tab.

### 5.2 Action toolbar (between header and tabs)

- **Parent / Child** → walk selection up/down the DOM.
- **Duplicate** / **Delete** → DOM mutation, recorded as a change.
- **Comment** → drop a yellow pin sticky note on the selected element. Pins are numbered in creation order; resolving a comment fades its pin to grey.
- **Hide all pins** (`eye` / `eye-off`) → toggles every comment pin on the page in one click. The Changes-tab list still works — only the page overlay is muted. Persisted across sessions via `chrome.storage.local`.
- **Screenshot** → see §1.5.
- **Presets** → opens the Presets view (see §6).
- **Undo** / **Redo** → step through every style/text/DOM/visibility action.

### 5.3 Sticky bottom

- **Copy as Prompt** → copies the markdown export of every change (see §7) to
  the clipboard.
- **Send to Agent** → stages a handoff marker over the MCP transport; the
  agent's next `get_changes` sees a `handoff` field flagging the edits as
  ready to implement. When MCP is offline or no agent is attached yet, the
  click opens state-specific setup instructions instead.

---

## 6. Design-system / Tokens panel

Three-tab panel for working with the page's design system. Open from the
swatch-book icon in the action row. Replaces the previous Presets surface —
existing user-saved presets surface in the **Defined** tab without
migration.

> **Site-colour tokens** (CSS custom properties on the page) also appear
> inline on every colour input via the focus-driven dropdown (see §2.16).
> The Tokens panel surfaces the underlying `:root` vars, the implicit
> scales the page actually uses, and your user-saved presets.

The three tabs:

| Tab | What |
|---|---|
| **Declared** | Every `:root` CSS variable on the page, grouped by purpose (Colour / Typography / Spacing / Radius / Shadow / Other). Each row shows the swatch / preview, current value, an inline editor that repaints the page live via `documentElement.style.setProperty`, a reset-to-original button, and a `×N uses` badge that lights up the on-page consumers via the multi-select overlay. Per-token original values live in `content/root-var-store.ts` (session-only). |
| **Detected** | Histograms of values *actually used* by viewport-visible elements for spacing / radius / font-size / shadow. Each entry shows its count, a drift warning when it's close to a declared token, and a "Replace with…" dropdown listing up to three closest declared tokens (lower / exact / upper). Picking one fans out a `CONSOLIDATE_DETECTED` scan that rewrites every matching computed value as `var(--name)` under a single grouped change in the Changes tab. |
| **Defined** | User-saved presets — empty by default. Save the selected element's styles as a named preset; the Add form's kind dropdown only lists kinds with at least one non-default value on the current selection. Applied presets gain an **↶ Applied** button that reverts every style change in that application's `groupId`. |

Across all three tabs: **filter chips** (`All` / `Colours` / `Type` /
`Spacing` / `Radius` / `Shadow` / `Other`), free-text search, and a
**"Show only tokens used on this page"** toggle. The active tab persists
to `chrome.storage.local` as `dm-tokens-tab`.

### 6.1 Defined-tab — nine kinds

When you save a preset, pick a **Kind**. The kind drives which properties
get captured from the selected element (NOT a 30-prop snapshot of
unrelated styles):

| Kind | What it captures |
|---|---|
| **Position** | `position`, `top` / `right` / `bottom` / `left`, `z-index`, `transform`, `translate`, `rotate`, `scale`, `transform-origin`, plus the 3D and logical-inset properties from Position Advanced. |
| **Layout** | `display`, `flex-*`, `grid-*`, `gap` / `row-gap` / `column-gap`, `width` / `height` / `min-*` / `max-*`, `padding-*`, `margin-*`, `box-sizing`, `overflow-*`. |
| **Appearance** | `opacity`, `mix-blend-mode`, `isolation`, all four `border-*-radius`, `filter`, `backdrop-filter`, `visibility`, `cursor`, `color-scheme`, `forced-color-adjust`, `pointer-events`, `user-select`, `appearance`, `accent-color`, `caret-color`, `clip-path`, `scrollbar-*`, `contain`, `content-visibility`, `will-change`. |
| **Typography** | Primary + the entire Typography Advanced surface (decoration, wrapping, layout-in-text, direction, font features, rendering, list). |
| **Fill** | `background-color` / `-image` / `-size` / `-repeat` / `-position` / `-attachment` / `-clip` / `-origin` / `-blend-mode`, `webkit-background-clip` / `webkit-text-fill-color`, `mask-*`, plus SVG paint properties. |
| **Stroke** | `border-*-width` / `-style` / `-color` (per side), `outline-*`, `border-image-*`. |
| **Effects** | `box-shadow`, `text-shadow`, `filter`, `backdrop-filter` — the four CSS chains that paint shadows + blurs. |
| **Motion** | `transition-*`, `animation-*`, `transform` family (`translate`/`rotate`/`scale`/etc.), motion-path (`offset-*`), `view-transition-*`, scroll-driven timeline props. |
| **Layout guide** | The synthetic `__layout_guides` prop carrying the per-element Columns / Rows / Grid JSON config. Stored for export visibility; the runtime overlay system is session-only and bypasses the change-tracker for paint. |

The exact property list per kind is owned by the side panel
(`SECTION_PROPS` in `sidepanel.ts`) and sent to the content script with
each save — so widening a section's surface area automatically widens what
its preset captures.

### 6.2 Save / Apply / Edit / Delete

- **Save**: select an element, open the Defined tab, pick a Kind, type a
  name, click **Save**. Default-valued properties (`none`, `normal`,
  `auto`) are skipped on capture so the preset stays small.
- **Apply**: click **Apply** on any preset row. Captured properties land
  on the selected element as live changes (recorded in the Changes tab,
  persisted across reload). The row gains an **↶ Applied** button that
  reverts every style in that application's `groupId`.
- **Edit**: pencil icon → editor. Rename and tweak per-property values.
  CSS values are validated via `CSS.supports`; invalid pairs are dropped
  silently with a toast. The kind is **locked** as a read-only badge — to
  change kinds, save a new preset from the source element.
- **Delete**: trash icon → confirmation overlay → confirm.

### 6.3 Import / Export

- **Export** writes a JSON file (`design-mode-design-system` kind marker)
  with every saved preset.
- **Import** reads any JSON file carrying that marker; foreign files are
  rejected with a toast. Old presets saved under the legacy 3-kind set
  (`color` / `shadow` / `typography`) are auto-migrated to the 9-kind set
  on import. Duplicate IDs / names are renamed; toast confirms
  `Imported X of Y presets`.

### 6.4 Sync + storage

- Saved presets sync via `chrome.storage.sync` so they're available
  across every site you visit (and across Chrome-signed-in devices).
- If the sync bucket fills up (Chrome's 100 KB / 8 KB-per-item caps),
  saves fail with a clean "Storage full" toast — delete an old preset and
  try again.

### 6.5 Markdown exporter integration

The Copy-Prompt markdown exporter emits a focused **`## Tokens changed`**
section listing only the `:root` CSS variables you've edited this session
(original → current values). The section is omitted entirely when no
root-var edits are present, so a Copy as Prompt without token changes stays
tight.

---

## 7. Copy as Prompt / Send to Agent format

Generated by `enhanced-export.ts`. Designed for **minimum tokens, maximum
signal** to a coding agent.

```
# Visual changes — <page title>
<page url>

## Changes
- <selector> [<file>:<line>]: <prop> <old> → <new>; <prop2> <old2> → <new2>
- <selector> [<file>:<line>] text: "<old>" → "<new>"
- <selector> [<file>:<line>] moved → <parent>[<index>]
- <selector> deleted

## Comments
- on <selector>: <comment text>

## Design tokens used
- `--accent`: #4F9EFF
```

What's special:

- **Selectors are unique** — generated with `:nth-of-type` so the agent can
  query the right element directly.
- **File pointers inline** — `[components/Button.tsx:42]` after the selector
  if source detection found the source file. No separate cross-reference
  block.
- **Token resolution** — when an edited value matches an existing `--var`,
  the prompt shows `var(--name)` instead of the raw hex/px so the agent
  preserves the design system.
- **Used-tokens summary** — only tokens actually referenced in the change
  set, not every token on the page.
- **Move destinations included** — `<parent>[<index>]` so the agent knows
  where to place the element in code.

---

## 8. Settings panel

Open via the gear icon in the header.

| Setting | What it does | Default |
|---|---|---|
| **MCP WebSocket port** | Port the side panel and content script connect to. Persisted to `chrome.storage.local`. The actual server port lives in `packages/mcp-local` config — this UI captures the connect intent. | `9960` |
| **Auto-connect** | Reconnect to the MCP server automatically when it comes back online. | on |
| **Inspector hover color** | Colour of the hover overlay. Edits are persisted **and** broadcast to the content script via `SP_SET_INSPECTOR_COLORS` so the live overlay updates immediately. | `#4F9EFF` |
| **Inspector selection color** | Colour of the selection overlay. Same persistence + broadcast as above. | `#FF6B35` |
| **Inspector margin overlay color** | Colour of the margin band drawn outside the element box on the hover/selection overlay. Persisted + broadcast; the overlay repaints live. | `#FF6363` |
| **Inspector padding overlay color** | Colour of the padding band drawn between the border and content. Persisted + broadcast; the overlay repaints live. | `#7CC886` |
| **Color format** | Display colours in the editor as `HEX` / `RGBA` / `HSL`. | `HEX` |
| **Screenshot capture** | What the camera button does. `Clipboard` copies the PNG; `Download` saves it; `Both` does both. | `Clipboard` |
| **Nudge amount** | Shift+Arrow step for numeric fields in the Design panel (Figma-style big-nudge). Plain Arrow keys still nudge by 1. Persisted to `chrome.storage.local`. | `10` |
| **Page cursor** | Show the Design Mode app icon as the mouse cursor on the inspected page while the panel is open. Turning it off falls back to the plain crosshair. Persisted to `chrome.storage.local`; the content script picks up changes live via `storage.onChanged`. | on |
| **Theme** | `System` / `Dark` / `Light`. | `System` |
| **Keyboard shortcuts** (button) | Opens a popover card listing every shortcut grouped by category (driven by `DEFAULT_SHORTCUTS`), keys shown as `<kbd>` chips. Backdrop click / ✕ / `Esc` closes it. | — |
| **Reset settings** (button) | Wipes every setting above back to its default. Toasts on success. | — |

---

## 9. Persistence model

- **Style edits** land as rules in a single `<style id="dm-applied-styles">`
  injected by the extension, keyed by the saved CSS selector. Rules apply
  via natural selector matching — no `data-*` stamping required, frameworks
  can't strip them, and SPA re-renders that recreate the element with the
  same selector keep the edit applied automatically.
- **Per-URL session** stored in `chrome.storage.session` (falls back to
  `chrome.storage.local`). Survives page reload and back/forward navigation
  within the same browser session.
- **DOM moves** (layer reorder) are replayed on page load via the saved
  parent selector + index.

---

## 10. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+D` | Toggle the side panel (open / close) |
| `Ctrl+Z` / `Cmd+Z` | Undo last change (style / text / DOM / visibility) |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `↑` / `↓` on a numeric input | Increment / decrement by 1 (or by 0.1 / 0.05 for filter components) |
| `Shift+↑` / `Shift+↓` | Step by 10 |
| `Tab` in Design tab | Cycle inputs |
| `Ctrl+Enter` in comment textarea | Submit |
| `Escape` | Exit multi-select / cancel comment / deselect |

---

## 11. MCP server — agent-facing tools

Run the server with `npm start` from the repo root. It boots a WebSocket
bridge on `ws://localhost:9960` and exposes 8 MCP tools over stdio.

| Tool | Inputs | What it returns |
|---|---|---|
| **`get_changes`** | none | All style / text / DOM changes + pinned comments + a ready-to-paste CSS block. Each style change carries the unique `selector` for the element. The flat `items` array gives every entry a stable `id` for `set_change_status`. A `handoff` field appears once the user presses **Send to Agent** — the explicit "these are ready" signal. |
| **`apply_changes`** | `changes: Array<{ elementId, styles }>` | Pushes CSS back to the browser for live preview. Single-edit calls use a one-element array. The browser routes these through the same managed-stylesheet path as user edits, so they show up in the Changes tab and survive reload. |
| **`set_change_status`** | `status: 'todo' \| 'in_progress' \| 'resolved'`, `ids?: string[]` | Marks tracked changes (and comments) as the agent works through them. Omit `ids` to apply to all. Surfaces as a per-row WIP/DONE badge + a Status sub-filter in the Changes tab; resolved comments flip their resolved flag. |
| **`clear_changes`** | none | Reset the session — server state and the live page. Edits revert, comment pins disappear, undo stacks reset (same path as the panel's Clear All). |
| **`get_session_summary`** | none | Connection status, active sessions, counts. Use this as a health check before `apply_changes`. |
| **`export_changes`** | `format: 'css' | 'tailwind' | 'scss' | 'jsx'` | Emits the change set in the requested format. Spring / cubic-bezier values pass through inside the underlying CSS strings — no separate animation tool. |
| **`get_screenshot`** | `selector?: string` OR `elementId?: string` OR `commentId?: string` | A PNG of the viewport, or cropped to one element, or cropped to a comment's flagged **region** (or its element) — pass the `commentId` from `get_changes`. Pass the unique selector you got from `get_changes` (e.g. `"main > section.hero > button:nth-of-type(2)"`). Generic selectors that match many elements fail with a list of candidate unique paths. Every capture hides Design Mode's own overlays first, so the image is clean. Returned as an MCP image content block — vision-capable agents read it directly. |
| **`mark_comment_resolved`** | `commentId: string`, `resolved?: boolean` | Marks a pinned comment resolved (done) or reopens it. Pass the comment `id` from `get_changes`. Converges on the same path as the UI's Resolve toggle, so the page pin recolours and the Changes tab updates — closing the loop after the agent implements what a comment asked for. |

### Example agent flow

```
1. agent: get_session_summary
   server: extensionConnected: true, totalStyleChanges: 4, …

2. agent: get_changes
   server: { styleChanges: [{ selector: ".btn-primary", property: "color", … }] }

3. agent: get_screenshot({ selector: ".btn-primary" })
   server: <image block of the button>

4. agent: apply_changes({ changes: [{ elementId: "dm-7",
            styles: { backgroundColor: "var(--accent-hover)" } }] })
   server: "Applied 1 style change to 1 element."

5. agent: mark_comment_resolved({ commentId: "…", resolved: true })
   server: "Comment … marked resolved."
```

### `/design-mode` agent command

Settings → **Set up your agent** copies a ready-made `/design-mode` workflow
command for Claude Code, Cursor, Codex, or Windsurf (it names the save path
for each). The command drives the live MCP tools end to end — read the changes
and comments, apply them, and `mark_comment_resolved` as it goes — with
optional step / batch / yolo processing modes. The body is tool-agnostic; only
the install path differs.

---

## 12. Privacy

- The extension is **local-only**. No telemetry, no analytics, no remote
  logging. All data lives in `chrome.storage` on your machine.
- The optional MCP server runs on `localhost:9960`. Nothing is uploaded.
- The marketing site at `designmode.app` ships Google Analytics if the
  deployment sets `NEXT_PUBLIC_GA_ID`. Forks ship without analytics by
  default.
- Full disclosure: see [PRIVACY.md](./PRIVACY.md).
