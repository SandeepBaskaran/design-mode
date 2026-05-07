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
  computed styles to the side panel.
- **Use**: just move the mouse. The Design tab updates with the hovered
  element's styles when nothing is selected.

### 1.2 Click to select

- **What it does**: locks the orange outline on a single element, marks it
  as the editing target, and shows its dimensions.
- **Use**: click any element. Press `Escape` to deselect.

### 1.3 Multi-select mode (toggle in Layers tab)

- **What it does**: every click ADDS the element to a selection set instead
  of replacing the single selection. Edits in the Design tab fan out to
  every selected element — one change record per element so the Changes
  tab and Copy Prompt show the full impact.
- **Use**: open the **Layers** tab → flip the **Multi-select** toggle to
  the right of the search box. Click N elements (on the page or in the
  Layers list — both work). The button shows a count badge. Edit any
  property in the Design tab and it lands on every selected element.
  Press `Escape` or click the toggle again to exit.

### 1.4 Animation freeze (toolbar)

- **What it does**: pauses every CSS animation, transition, Web Animations
  API instance, and `<video>` on the page so you can inspect a mid-flight
  state.
- **Use**: click the **circle-pause** icon in the toolbar (top of the side
  panel). Icon flips to **circle-play** when frozen — click again to resume.

### 1.5 Screenshot (camera button)

- **What it does**: captures a PNG of the page or the selected element.
- **Use**: click the **camera** icon. The behavior follows your **Capture
  Mode** setting (`clipboard` / `download` / `both`). A toast confirms.

### 1.6 Comment pins (yellow tear-drop overlay)

Comments anchor a sticky note to a specific element. Each comment renders as a draggable pin on top of the page, and as a row in the Changes tab.

- **Add**: select an element, click the toolbar's **message-square** icon, type the body, click Add.
- **Pin number**: pins are numbered in creation order (`1`, `2`, `3` …). The number renders inside the pin (replacing the `💬` emoji) and on the matching panel row's `#N` badge so the user can match overlay ↔ panel at a glance.
- **Drag-to-reposition**: click and drag the pin to move it relative to the element. The offset is persisted; subsequent renders honour it. Click without dragging still opens the panel card.
- **Resolve**: click the green **Resolve** button on the comment row. The pin fades to grey + 60% opacity; the body strikes through. Resolving keeps the comment (it's not a delete) — click **Reopen** to restore.
- **Hide all**: the new `eye` / `eye-off` toolbar action toggles every pin on the page. The Changes tab still shows them; only the page overlay is muted. State persists across sessions via `chrome.storage.local`.
- **Click**: opens the comment row in the panel and scrolls the page to the layer.

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
- This data ships in **Copy Prompt** so the agent edits the right file.

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

### 2.11 Effects

- **Box Shadow** — visual editor with offset X/Y, blur, spread, color, opacity,
  inset toggle. "Add shadow" / "Remove" buttons.
- **Text Shadow** — structured: offset X, offset Y, blur, color.
- **Filter** — labelled number fields per function: Blur (px), Brightness,
  Contrast, Saturate, Hue rotate (deg), Grayscale. Pre-filled from the
  element's current `filter` value.
- **Backdrop Filter** — same six functions as Filter, applies to the
  `backdrop-filter` property.
- **Transition** — Property dropdown, Duration, Timing curve, Delay + a
  ▶ Preview button that flashes a contrast value so you can see the curve.
- **Animation** — Name (12 built-in `dm-*` keyframes auto-injected into the
  page: `dm-fade-in`, `dm-slide-up/down/left/right`, `dm-pulse`, `dm-bounce`,
  `dm-shake`, `dm-spin`, `dm-wiggle`, `dm-ping`, `dm-fade-out`), Duration,
  Timing, Delay, Iterations (with ∞ toggle), Direction, Fill mode, Play state,
  + ▶ Preview button that re-triggers the animation cleanly.

### 2.12 Custom curves

- The transition / animation timing dropdown also opens a **cubic-bezier
  visualizer** with sliders for x1/y1/x2/y2 and a spring-physics mode (mass /
  damping / stiffness). Apply the result directly into the transition or
  animation timing field.

### 2.13 Media (when an `<img>`, `<video>`, `<audio>`, or SVG is selected)

- Preview thumbnail.
- For images: src input, alt text, object-fit dropdown.
- For SVG: **Copy SVG markup** button.
- **Download** button to save the asset locally.

### 2.14 Color picker — design-system tokens

- The color picker dropdown lists every `--var` declared on the page,
  grouped (Colors, Backgrounds, Buttons, Borders, etc.) and filtered by
  the kind of element you have selected.
- Picking a token writes `var(--name)` instead of a raw hex. The Copy
  Prompt output then resolves matching values back to `var(--name)`
  automatically.

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
- Shows up in the Changes tab (`MOVE <tag>`) and in Copy Prompt as
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

### 4.5 Group header

- Each group of changes for one selector has a header with `selector + N`
  changes badge + a select-element button.

### 4.6 View Original / View Changes

- Top of the tab. Toggle between the original page and your edited version
  without losing any changes.

### 4.7 Clear All

- Drops every tracked change AND clears the override stylesheet — page
  returns to its natural state.

---

## 5. Side panel — header & toolbar

### 5.1 Header

- App name + **MCP status chip** — three states: `offline` (grey), `running` (green pulse), `connected` (green glow). The whole chip is clickable; clicking it re-pings the server / agent. The hover tooltip explains the current state and includes the start command (`npm start --prefix packages/server`) when offline. State changes after the click surface as toasts (`MCP connected`, `MCP running — waiting for agent`, `MCP offline`); a click that doesn't change state still toasts the offline-with-hint message so the user gets feedback.
- **Theme toggle** (cycles system / dark / light) and **Settings** gear.

### 5.2 Action toolbar (between header and tabs)

- **Parent / Child** → walk selection up/down the DOM.
- **Duplicate** / **Delete** → DOM mutation, recorded as a change.
- **Comment** → drop a yellow pin sticky note on the selected element. Pins are numbered in creation order; resolving a comment fades its pin to grey.
- **Hide all pins** (`eye` / `eye-off`) → toggles every comment pin on the page in one click. The Changes-tab list still works — only the page overlay is muted. Persisted across sessions via `chrome.storage.local`.
- **Freeze animations** (circle-pause / circle-play) → see §1.4.
- **Screenshot** → see §1.5.
- **Presets** → opens the Presets view (see §6).
- **Undo** / **Redo** → step through every style/text/DOM/visibility action.

### 5.3 Sticky bottom

- **Copy Prompt** → copies the markdown export of every change (see §7) to
  the clipboard.
- **Send to Agent** → pushes the same markdown to the connected MCP agent.

---

## 6. Presets

Reusable, user-saved styles — modelled after Figma's styles but extended
across **all seven Design-tab sections**. Open the panel from the bookmark
icon in the action row.

> **Site-colour tokens** (CSS custom properties on the page) used to live
> in a "Built-in" tab here. They've been retired — those tokens are now
> surfaced **inline on every colour input** via a focus-driven dropdown.
> The presets panel is purely user-saved.

### 6.1 Seven kinds — one per Design-tab section

When you save, pick a **Kind** from the dropdown. The kind drives which
properties get captured from the selected element (NOT a 30-prop snapshot
of unrelated styles).

| Kind | What it captures |
|---|---|
| **Position** | `position`, `top` / `right` / `bottom` / `left`, `z-index`, `transform`, `translate`, `rotate`, `scale`, `transform-origin`, plus the 3D and logical-inset properties from Position Advanced. |
| **Layout** | `display`, `flex-*`, `grid-*`, `gap` / `row-gap` / `column-gap`, `width` / `height` / `min-*` / `max-*`, `padding-*`, `margin-*`, `box-sizing`, `overflow-*`. |
| **Appearance** | `opacity`, `mix-blend-mode`, `isolation`, all four `border-*-radius`, `filter`, `backdrop-filter`, `visibility`, `cursor`, `color-scheme`, `forced-color-adjust`, `pointer-events`, `user-select`, `appearance`, `accent-color`, `caret-color`, `clip-path`, `scrollbar-*`, `contain`, `content-visibility`, `will-change`. |
| **Typography** | Primary + the entire Typography Advanced surface (decoration, wrapping, layout-in-text, direction, font features, rendering, list). |
| **Fill** | `background-color` / `-image` / `-size` / `-repeat` / `-position` / `-attachment` / `-clip` / `-origin` / `-blend-mode`, `webkit-background-clip` / `webkit-text-fill-color`, `mask-*`, plus SVG paint properties. |
| **Stroke** | `border-*-width` / `-style` / `-color` (per side), `outline-*`, `border-image-*`. |
| **Effects** | `box-shadow`, `text-shadow`, `backdrop-filter`, `transition-*`, `animation-*`. |

The exact property list per kind is owned by the side panel
(`SECTION_PROPS` in `sidepanel.ts`) and sent to the content script with
each save — so widening a section's surface area automatically widens what
its preset captures.

### 6.2 Save

1. Select an element.
2. Open the bookmark / Presets panel.
3. Pick a Kind from the dropdown.
4. Type a name → click **Save**.

Default-valued properties (`none`, `normal`, `auto`) are skipped on
capture so the preset stays small.

### 6.3 Apply

- Click **Apply** on any preset row. The captured properties land on the
  selected element as live changes (recorded in the Changes tab, persisted
  across reload).

### 6.4 Edit

- Pencil icon → opens the editor. Rename and tweak per-property values.
  CSS values are validated via `CSS.supports`; invalid pairs are dropped
  silently with a toast. The kind is **locked** as a read-only badge — to
  change kinds, save a new preset from the source element.

### 6.5 Delete

- Trash icon → confirmation overlay → confirm.

### 6.6 Filter

- When you have presets of more than one kind, a **Filter** dropdown
  appears: `All kinds` plus one entry per kind that's actually present
  in your saved list.

### 6.7 Import / Export

- **Export** writes a JSON file with every preset.
- **Import** reads any JSON array of presets. Old presets saved under the
  legacy 3-kind set (`color` / `shadow`) are auto-migrated to the new
  7-kind set: `color → fill`, `shadow → effects`, `typography → typography`.
- Duplicate IDs / names are renamed; toast confirms `Imported X of Y presets`.

### 6.8 Sync

- Custom presets sync via `chrome.storage.sync` so they're available
  across every site you visit (and across Chrome-signed-in devices).
- If the sync bucket fills up (Chrome's 100 KB / 8 KB-per-item caps),
  saves fail with a clean "Storage full" toast — delete an old preset and
  try again.

---

## 7. Copy Prompt / Send to Agent format

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
| **MCP WebSocket port** | Port the side panel and content script connect to. Persisted to `chrome.storage.local`. The actual server port lives in `packages/server` config — this UI captures the connect intent. | `9960` |
| **Auto-connect** | Reconnect to the MCP server automatically when it comes back online. | on |
| **Inspector hover color** | Colour of the hover overlay. Edits are persisted **and** broadcast to the content script via `SP_SET_INSPECTOR_COLORS` so the live overlay updates immediately. | `#4F9EFF` |
| **Inspector selection color** | Colour of the selection overlay. Same persistence + broadcast as above. | `#FF6B35` |
| **Color format** | Display colours in the editor as `HEX` / `RGBA` / `HSL`. | `HEX` |
| **Screenshot capture** | What the camera button does. `Clipboard` copies the PNG; `Download` saves it; `Both` does both. | `Clipboard` |
| **Theme** | `System` / `Dark` / `Light`. | `System` |
| **Keyboard shortcuts** (button) | Toasts a one-line summary of the active shortcuts (`Alt+D`, `Ctrl/⌘+Z`, `Ctrl/⌘+⇧Z`, `Esc`). | — |
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
bridge on `ws://localhost:9960` and exposes 6 MCP tools over stdio.

| Tool | Inputs | What it returns |
|---|---|---|
| **`get_changes`** | none | All style / text / DOM changes + pinned comments + a ready-to-paste CSS block. Each style change carries the unique `selector` for the element. |
| **`apply_changes`** | `changes: Array<{ elementId, styles }>` | Pushes CSS back to the browser for live preview. Single-edit calls use a one-element array. The browser routes these through the same managed-stylesheet path as user edits, so they show up in the Changes tab and survive reload. |
| **`clear_changes`** | none | Reset the session. Drops every tracked change. |
| **`get_session_summary`** | none | Connection status, active sessions, counts. Use this as a health check before `apply_changes`. |
| **`export_changes`** | `format: 'css' | 'tailwind' | 'scss' | 'jsx'` | Emits the change set in the requested format. Spring / cubic-bezier values pass through inside the underlying CSS strings — no separate animation tool. |
| **`get_screenshot`** | `selector?: string` OR `elementId?: string` | A PNG of the viewport, or cropped to one element. Pass the unique selector you got from `get_changes` (e.g. `"main > section.hero > button:nth-of-type(2)"`). Generic selectors that match many elements fail with a list of candidate unique paths. Returned as an MCP image content block — vision-capable agents read it directly. |

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
```

---

## 12. Privacy

- The extension is **local-only**. No telemetry, no analytics, no remote
  logging. All data lives in `chrome.storage` on your machine.
- The optional MCP server runs on `localhost:9960`. Nothing is uploaded.
- The marketing site at `design-mode.dev` ships Google Analytics if the
  deployment sets `NEXT_PUBLIC_GA_ID`. Forks ship without analytics by
  default.
- Full disclosure: see [PRIVACY.md](./PRIVACY.md).
