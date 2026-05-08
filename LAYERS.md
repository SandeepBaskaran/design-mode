# Layers Tab — Reference

User-facing reference for everything in the Layers tab. Each control + each visual state explained.

For the implementation status of layer-related features, see PARITY.md (where applicable). This document is for **understanding what each thing in the Layers tab does**.

Last updated: 2026-05-08.

## Design stance — what we deliberately don't do

The Layers tab **mirrors the live DOM** rather than holding parallel state on top of it. That principle decides what's in and what's out:

- **No rename / no custom label**. The page already names every node via tag, id, class, and component name. Layering a panel-only renaming map on top drifts the moment the user changes a class or swaps components — and Design Mode's job is to surface what the page actually is, not to maintain a second-order naming graph.
- **No lock / pin-from-selection**. Lock state is a UX layer that prevents selecting an element from the canvas or the panel. We dropped it because it (a) lives only in the panel — the page itself doesn't know about it — and (b) the same outcome is reachable in milliseconds by hovering away or clicking elsewhere. The cost of teaching, persisting, and policing locks across reloads outweighed the benefit.
- **No bookmarking / starring layers**. Same reason as renaming — it's panel-only state that disappears on reload. If a layer matters, it's already discoverable by class / id / tag.

What we do keep is anything that's a **direct surface** for the underlying DOM: visibility toggle, drag-to-reorder, scroll-into-view, change indicator, comment count, multi-select.

---

## What the Layers tab is

The Layers tab is a **DOM tree** of the current page — like the Elements panel in DevTools, but reorganised for design intent. Every element on the page becomes a row. The tree mirrors the DOM hierarchy so a parent's children are indented under it.

Use it to:
- **Pick a layer** to edit in the Design tab.
- **Reorder** elements via drag-and-drop.
- **Toggle visibility** without deleting.
- **Multi-select** several layers and apply edits to all of them at once.
- **Search** by tag, class, id, or smart name.
- **Navigate** large pages by collapsing branches.

When the inspector hasn't been activated yet, the tab shows an empty state — "Click the inspector icon to start selecting elements." Activate inspector mode and the tree populates.

---

## Top action row (above the tabs)

Above all three tabs sits a row of action buttons — visible regardless of which tab is open.

| Icon | Action | What it does | Disabled when |
|---|---|---|---|
| `arrow-up` | **Parent** | Selects the parent of the currently selected layer. | Nothing selected. |
| `arrow-down` | **Child** | Selects the first child of the currently selected layer. | Nothing selected, or no children. |
| `copy` | **Duplicate** | Clones the selected layer. Adds a "duplicate" entry in the Changes tab. | Nothing selected. |
| `trash` | **Remove** | Deletes the selected layer. Adds a "delete" entry in the Changes tab (revertable). | Nothing selected. |
| `message-square` | **Comment** | Attaches a yellow sticky-note comment to the selected layer. Opens the comment-edit card just above the tabs. | Nothing selected. |
| `eye` / `eye-off` | **Hide all pins** | Toggles every comment pin overlay on the page. The Changes-tab list still works — only the page overlay is muted. State persists across sessions via `chrome.storage.local`. | Always available. |
| `circle-pause` / `circle-play` | **Pause animations** | Pauses every CSS animation, transition, and `<video>` on the page. Click again to resume. Useful for catching motion mid-frame to inspect / screenshot. | Always available. |
| `camera` | **Screenshot** | Captures the current viewport as PNG. Honors the Settings → Capture mode (clipboard / download / both). | Always available. |
| `bookmark` | **Presets** | Opens the Presets panel — save / load named CSS bundles applicable to any layer. | Always available. |
| `undo` (left arrow) | **Undo** | Ctrl/Cmd-Z. Reverts the last edit. | Nothing to undo. |
| `undo` (mirrored) | **Redo** | Ctrl/Cmd-Shift-Z. Re-applies the last undone edit. | Nothing to redo. |

---

## Search bar + Multi-select toggle (Layers tab only)

Pinned at the top of the Layers tab body.

### Search input

Filters the tree by **custom name** (your double-click rename, if set), **smart name** (auto-detected component-style label like "Hero", "Card"), **tag**, **class**, or **id**. Real-time filtering — types update the tree on every keystroke.

Empty input shows the full tree.

### Multi-select toggle (`layers` icon)

| State | Behavior |
|---|---|
| Off (default) | Clicking a layer in the tree (or in the page) selects only it. The Design tab edits that one layer. |
| On (icon + background turn blue) | Clicking layers **adds them to a selection set**. Edits in the Design tab fan out to every selected layer. The button shows a count badge of how many are selected. Click the button again to exit multi-select. |

When multi-select is active, every layer that's part of the set has a small blue `check-square` icon in its row plus an accent-colored left border.

## Filter chips (below search)

A row of pill chips narrows the tree to one bucket. Each chip carries a count badge so you can see at a glance which has entries.

| Chip | What it shows |
|---|---|
| **All** | Every layer in the tree (default). |
| **Visible** | Only layers whose `eye` is on. |
| **Hidden** | Only layers whose `eye` is off (own override) — handy for unhiding a stray after a long session. |
| **Modified** | Only layers that have at least one tracked change (style / text / DOM / comment). Pairs nicely with the per-row change-indicator dot. |

The active chip is accent-tinted. The filter composes with the search input, so you can type "btn" and pick *Modified* to see every modified button.

## Bulk-action toolbar (multi-select with 2+ layers)

When multi-select is active **and** at least two layers are in the set, a horizontal toolbar appears below the filter chips:

```
[ N selected: ] [ 👁 Show ] [ 🚫 Hide ] [ ⧉ Duplicate ] [ 🗑 Delete ] [ × Clear ]
```

| Action | What it does |
|---|---|
| **Show** | Toggles every selected layer to visible (no-op for already-visible ones). |
| **Hide** | Hides every selected layer (writes `display: none` overrides). |
| **Duplicate** | Clones each selected layer in place. Each clone gets its own `DUPLICATE` entry in the Changes tab. |
| **Delete** | Removes every selected layer. Each gets a `DELETE` entry in the Changes tab (revertable). |
| **Clear** | Empties the multi-select set and exits multi-select mode. |

---

## Each layer row

A layer row, left to right:

```
[ guides ] [ drag-handle ] [ chevron ] [ tag-icon ] [ swatch? ] [ multi-badge? ] [ container-badge? ] [ change-dot? ] [ comments? ] [ name ] [ <tag>? ] [ z-chip? ]    ........   [ crosshair ] [ eye ]
```

### Indentation guides

Vertical lines running down the left edge of each row, one per parent depth. Make it easy to trace a layer's ancestry visually.

### Drag handle (`grip-vertical`)

Hidden by default; appears on hover. Drag this to **reorder** the layer. Visual feedback during drag:

- A blue underline (`var(--dm-accent)`) appears at the drop position.
- Drop above another row → moves the layer to be the previous sibling.
- Drop below → next sibling.

Reordering is recorded in the Changes tab as a `MOVE` entry, fully revertable.

### Chevron (`chevron-down` / `chevron-right`)

| Icon | Meaning |
|---|---|
| `chevron-down` | Branch is expanded. Click to collapse — the row's descendants disappear from the list. |
| `chevron-right` | Branch is collapsed. Click to expand. |
| (empty space) | Layer has no children. |

Collapse state is in-memory and resets on page reload.

### Tag icon

A small icon that classifies the layer's HTML tag:

| Tag family | Icon |
|---|---|
| `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `p`, `span`, `a`, `button`, `label`, `strong`, `em`, `code`, `blockquote` (text-bearing) | `type` |
| `img`, `picture`, `video`, `audio`, `iframe`, `canvas` (media) | `image` |
| `svg`, `path`, `circle`, `rect`, `line`, `polygon`, `g` (vector) | `pen-tool` |
| `input`, `textarea`, `select`, `button[type]` (form) | `square-stack` (or similar form icon) |
| `ul`, `ol`, `li` (list) | `list` |
| `nav`, `header`, `footer`, `main`, `section`, `article`, `aside` (semantic) | `layout-grid` |
| `div`, `span`, generic | `box` |
| `br`, `hr`, `meta` (void) | `minus` (or similar) |

Selected layers tint the icon to the accent color.

**Component override**: when source detection (React fiber / Vue / etc.) finds a component name for this element, the icon swaps to `component` and the row shows the component name as the primary label, with the original `<tag>` as a smaller faded subtitle so DOM identity stays visible.

**Container override**: virtual subtree roots use distinct icons — `#shadow-root` uses `square-stack`, `::before` / `::after` use `sparkles`.

### Color swatch

When the layer has a non-transparent `background-color`, a 10×10 px coloured square renders just after the tag icon. Hover for the colour value tooltip. Useful for finding a specific filled element quickly.

### z-index chip

Layers with a non-default `z-index` get a small mono-font chip (`z:5`, `z:9999`) at the right of the name. `auto` and `0` are skipped (no chip). Pairs with the **Modified** filter when chasing stacking issues.

### Container badges

Trees can extend past the regular DOM. Each kind gets its own coloured pill so virtual / cross-tree nodes are obvious:

| Badge | Where it appears | What it means |
|---|---|---|
| **`shadow`** (purple) | On `#shadow-root` virtual rows under elements that have an open shadow root. | Children below this row live inside the shadow tree. Closed shadow roots are opaque by spec and never appear. |
| **`iframe`** (amber) | On rows added under same-origin `<iframe>` hosts. | Children below this row live in the iframe's `contentDocument`. Cross-origin iframes don't expand (opaque by spec). |
| **`pseudo`** (teal) | On `::before` / `::after` virtual rows added when a pseudo-element has non-default `content`. | These aren't real DOM nodes — selecting them targets the host for inline-style edits. |

The host element keeps a child-count that includes these virtual children, so the host's chevron expands / collapses them along with real children.

### Multi-select badge (`check-square`)

Only renders when:
- Multi-select is active.
- This layer is part of the selection set.
- This layer is *not* the focused layer (the focused one already has its own selected styling).

### Change-indicator dot

A 6×6 accent-coloured dot just before the name, rendered when this layer has at least one tracked change of any kind (style / text / DOM / comment). Hover for an "This layer has tracked changes" tooltip. Pairs with the **Modified** filter chip — flip the chip to scope the tree to just these.

### Comment-count chip

A small `💬 N` chip (yellow-tinted background) right after the change dot, rendered when the layer has at least one comment. The number is the total count regardless of resolved state. Hover for the precise count.

### Name

The displayed identifier for the layer. Format priority:

1. **Component name** (when source detection finds one — e.g. `Hero` from a React fiber walk, or auto-derived from class names like `card-primary`).
2. **`<tag>#id.class1.class2`** — fallback: tag + first few classes / id.

The Layers tab does **not** carry custom rename state — names always reflect the live DOM. The page already names every node; layering a parallel naming map on top would drift the moment the user edits class names or swaps components. If a user wants a different label, the right place is the underlying class / id, not a separate panel-only override.

Long names truncate with ellipsis. Hover the row to see the full name in the tooltip.

### Hover action cluster (right edge, hidden until row hover)

Two icon buttons, in order:

| Icon | Action |
|---|---|
| `crosshair` | Scroll the page so this layer is in view, **without** selecting it. Same icon as the Changes-tab "select element" button so the affordance reads consistently. Sends `SP_SCROLL_TO_ELEMENT` to the content script. |
| `eye` / `eye-closed` | Toggle visibility. The icon swaps to `eye-closed` (Lucide) when the layer is hidden so the row reads at a glance. Three-state under the hood: drops the Design Mode override if we hid it; pushes `display: revert` if author CSS was hiding it (so the cascade falls back to the user-agent default and the element actually reappears); otherwise injects `display: none`. The change is recorded in the Changes tab and is revertable. |

---

## Visual states of a layer row

| State | Appearance |
|---|---|
| **Default** | Transparent background, neutral text color. |
| **Hovered** (`hoveredLayerId === n.id`) | Subtle grey background (`var(--dm-bg-secondary)`). Yellow `dm-hover-indicator` appears in the indicator chip up top. |
| **Selected** (single-select; `info.id === n.id`) | Blue accent background + blue left border + accent-colored text and icon. Indicator chip up top reads "Selected" with crosshair icon. |
| **Multi-selected** (in `multiSelectIds`) | Blue accent background + blue accent left border. `check-square` badge in the row. |
| **Drag-over** (this row is the drop target) | Blue 2px line at the top edge marking the drop position. |
| **Hidden by ancestor** | 40% opacity. The row is still clickable; you can re-enable visibility on this layer or trace up to find which ancestor is hidden. |
| **Hidden by self** (eye-off) | 40% opacity, eye icon in accent color. |

---

## Interactions

### Single click → select

Sets `info.id` to this layer. Switches focus from any other layer. The Design tab refreshes to show this layer's properties.

If multi-select is active, clicking a layer **adds** it to the set instead of replacing focus.

### Hover → highlight in page

Hovering a row in the Layers tab does two things:
1. The row gets the hover background + chevron / handle / eye icons appear.
2. The corresponding element on the page gets a **yellow dashed outline** so you can see which layer the row maps to without selecting it.

### Drag → reorder

Pick up the `grip-vertical` handle and drag. The layer becomes a "draggable" element; drop it on another row to reorder.

- Drop position is determined by the cursor's Y relative to the target row's midpoint:
  - Top half → place this layer **before** the target.
  - Bottom half → place this layer **after** the target.
- The drop creates a `MOVE` change recorded in the Changes tab.

### Cmd/Ctrl + click → toggle in multi-select

When multi-select is active:
- Click a row → adds to selection (if not already in).
- Click an already-selected row → removes from selection.
- The layer that was clicked most recently becomes the focused layer (the one whose styles render in the Design tab).

### Right-click → (browser default — no custom context menu)

We don't override the browser context menu. Right-click in the Layers list shows the standard browser menu (Inspect, Copy, etc.).

---

## Empty state

If `domTree.length === 0`, the tab shows the empty state instead of the search + tree:

```
[ crosshair icon ]
Click the inspector icon to start selecting elements
```

The inspector icon lives in the panel header (above the action row). Activate it to start selecting elements; the tree populates from there.

---

## Comment card (appears above tabs when commenting)

When you click the `message-square` action button, the **Comment card** appears between the action row and the tabs:

| Element | Behavior |
|---|---|
| Header label | "Add Comment" or "Edit Comment" depending on mode. |
| Tag indicator | Shows `<tag>` of the layer being commented on. |
| Textarea | Free-form text input; supports multi-line. Auto-focuses on open. |
| **Cancel** button | Discards changes, closes the card. |
| **Add** / **Save** button | Commits the comment. Disabled while editing if the text hasn't changed. |

Comments are anchored to the layer they were created on — they appear as **yellow sticky pins** on the page over that layer, and as entries in the Changes tab.

The card is a panel-wide overlay; the rest of the panel (action row, tabs, content) stays interactive but the focus is on the textarea.

---

## Sticky bottom (Copy Prompt + Send to Agent)

Pinned at the bottom of the side panel — visible from any tab when there are tracked changes:

| Button | What | Disabled when |
|---|---|---|
| **Copy Prompt** (`clipboard` icon) | Generates an LLM-optimised markdown prompt of all changes (CSS / text / DOM / comments) plus a description of the framework / file:line if source detection found one. Copies to clipboard. | "Preview original" is on, or no changes. |
| **Send to Agent** (`send` icon) | Sends the same payload directly to a connected coding agent via the MCP server (`ws://localhost:9960`). | Preview-original is on, or no changes, or MCP isn't running, or MCP is running but no agent is connected. The tooltip names the specific blocker. |

The Send to Agent button has a more accent-colored style when enabled to distinguish it from the lower-stakes Copy.

---

## Keyboard shortcuts (Layers-tab-related)

| Shortcut | Effect |
|---|---|
| `Alt+D` | Toggle the entire side panel open/closed. |
| `Ctrl/Cmd+Z` | Undo. |
| `Ctrl/Cmd+Shift+Z` | Redo. |
| `Esc` | Cancel comment / deselect / exit multi-select. |
| Click a layer | Select it. |
| Cmd/Ctrl + click | Multi-select toggle. |

---

## Design-Mode-specific behaviour worth knowing

- **The tree is built from a snapshot.** When you open the panel, we walk the DOM and record each element's id, tag, depth, and `parentId`. SPA re-renders mid-session don't update the tree until you trigger `refreshDomTree()` (which happens automatically on tab switch to Layers).
- **Element ids are stable across renders** because they're written as `data-dm-*` attributes on the DOM element itself. So a layer that gets re-rendered by the framework keeps the same id and stays selected.
- **Hidden-by-ancestor calculation** uses the visibility map: if any ancestor in the tree is hidden, descendants are dimmed in the layers list — even if their own visibility is on. This way it's easy to see why a layer isn't appearing on the page.
- **Drag-reorder writes `MOVE` change records** rather than just shuffling DOM. The change-tracker remembers the original position so undo / revert restores it.
- **Multi-select state persists across tab switches** — if you have 5 layers selected in Layers and switch to Design, edits there fan out to all 5.
