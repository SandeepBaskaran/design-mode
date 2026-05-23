# Changes Tab — Reference

User-facing reference for everything in the Changes tab. Each control + each entry type explained.

For implementation status see PARITY.md (where applicable). This document is for **understanding what each thing in the Changes tab does**.

Last updated: 2026-05-11.

---

## What the Changes tab is

The Changes tab is the **session log** of every edit you've made — style changes, text edits, DOM operations, and comments — grouped by element. It's where you:

- **Review** what you've changed before sending to an agent.
- **Revert** individual changes (or all at once).
- **Toggle** between viewing your edits vs the original page (a before/after preview).
- **Batch-apply** a single style change to every matching element on the page.
- **Copy** the changes as an LLM prompt or **Send** them to a connected coding agent.

Every change shown here is a **tracked record** — Design Mode never edits the actual source files; instead it overlays edits as a managed override stylesheet (for CSS) or DOM operations (for text / structure). Reverting a change here removes the override.

The badge on the **Changes** tab in the tab strip shows the total count: `style + text + DOM + comments`.

---

## Action header (top of tab)

Three rows pinned ("position: sticky") at the top of the Changes body whenever there's at least one change. The pinned region stays visible while the list scrolls beneath it, so the user can keep filtering / toggling-original / clearing while reading rows further down.

### Row 1 — Buttons row

Split into two clusters: primary actions on the left, file-IO on the right.

| Cluster | Button | What | When useful |
|---|---|---|---|
| Left | **Changes toggle** (`eye` / `eye-off` icon) | Single toggle replacing the old View Original / View Changes pair. Active (accent-tinted, `eye`) when your edits are visible — the default state. Click flips to previewing the original (muted, `eye-off`). Click again restores. | Comparing your design to the original; sanity-checking what actually shipped vs what you've added. |
| Left | **Clear all** (`trash` icon, danger-coloured) | Opens a confirmation dialog (overlay) before wiping every tracked change — styles, text edits, DOM operations, and comments. **Esc** dismisses the dialog. | One-shot reset to ship-state. |
| Right | **Export** (`download` icon) | Downloads every tracked change as a JSON file. | Stashing a session before clearing it, or shipping a snapshot to a teammate. |
| Right | **Import** (`upload` icon) | Replaces every change with an imported JSON file. | Picking up where you left off, or applying a teammate's saved session. |

When the Changes toggle is in **previewing-original** state:
- A banner appears: "Previewing original — click Changes to see your edits."
- The Design tab still shows tracked values (so you can keep editing while previewing).
- The **Copy Prompt** and **Send to Agent** buttons in the sticky bottom are disabled — pause-then-send is a footgun.

### Row 2 — Search row

| Control | What |
|---|---|
| **Search input** (with magnifier icon) | Live-filters the visible list. Case-insensitive, matches against selector / property name / old + new value / comment text / DOM action / tag name. A small `×` clears the box when typed. |
| **Expand all / Collapse all** (chevron icon) | One-click toggle for every group's open / closed state. The label flips based on what's actually open right now (if any group is collapsed, button reads *Expand all*; otherwise *Collapse all*). |
| **Sort dropdown** | Three options: **Oldest first** (default), **Newest first**, **By element** (groups all of an element's edits together while preserving relative group age). |

### Row 3 — Filter chips

**All / Styles / Text / DOM / Comments** — filter the visible list to one change kind. Each chip carries a count badge so you can see at a glance which kinds have entries. The active chip is accent-tinted.

When the active filter / search produces zero matches, the list is replaced with a small "No changes match this filter / search" notice and a *Clear filter* link that resets both the chip and the search box.

> **Below the sticky band**: the comments sub-filter (open / resolved), the bulk-revert toolbar (when 2+ rows are checked), and the "previewing original" banner all sit *below* the pinned rows — they're contextual, not navigation, and including them in the pinned region would push the actual list too far down on a narrow panel.

### Clear All — confirmation dialog

Clicking **Clear All** opens a centred overlay:

```
Clear all changes?
Removes every tracked style, text, DOM, and comment change.
Resets the undo stack. This can't be undone.

[ Cancel ]   [ Clear all ]
```

The destructive **Clear all** button is danger-coloured; **Cancel** dismisses the overlay without changes. The overlay closes on either click. There's no keyboard escape (yet).

---

## Empty state

If there are no changes yet, the tab shows:

```
[ sparkles icon ]
No changes yet
Changes will appear here as you edit.
Copy as prompt or send directly to your coding agent.
```

The action row is hidden in this state.

---

## Group structure

Changes are **grouped by the element they affect** (or by the element's selector if no element id is available). Each group shows:

```
[ chevron ] [ selector text ]                         [ count badge ] [ select-element icon ]
  └─ change item 1
  └─ change item 2
  └─ ...
```

### Group header

| Element | Behavior |
|---|---|
| **Chevron** (`chevron-down` / `chevron-right`) | Collapse / expand the group. State is in-memory; resets on reload. |
| **Selector** | The CSS selector for the group's element — usually `tag.class.class` or `#id`. Truncates with ellipsis if too long; full selector is in the tooltip. |
| **Stale badge** (small pill) | Renders only when the change tracker doesn't have a stable element id for this group — e.g. the framework re-rendered the element with different classes, or the element was removed. The whole group fades to 70% opacity. |
| **Count badge** | Number of changes in this group, accent-colored chip. |
| **Crosshair icon** (`crosshair`) | Click to select the group's element (jumps focus, switches Design tab to it, scrolls into view in the page). Only renders when the group has a known elementId. |
| **Copy group** (`clipboard` icon) | Copy this group's changes to the clipboard as a Copy-Prompt payload — scoped to just this element. Useful when you want to paste edits for one component / one element into a chat without dragging in the rest of the session. |
| **Revert all in group** (`trash` icon, danger-coloured) | One click reverts every change in this group — styles, text edits, DOM ops, and comments. Each underlying revert flows through the normal change-tracker path so the page overlay updates and undo state stays consistent. |

### Group body

Renders only when the group is expanded. Lists each change as a row, sorted by the order they were created (or per the global Sort dropdown). Hovering any row shows a **time-ago tooltip** (`just now` / `42s ago` / `5m ago` / `3h ago` / `2d ago`) computed from the change's timestamp.

Each row also carries a **checkbox** at its left edge. Selecting two or more rows surfaces a bulk-action toolbar (between the filter chips and the group list) with:

- **Revert selected** — drives every checked row's change-id through the per-change revert path (so undo / overlay state stays consistent).
- **Clear** — deselects everything and dismisses the toolbar.

Selection state is in-memory and resets on tab switch.

---

## Change item types

There are four types of changes, each rendered with a distinct icon and content layout.

### 1. Style change

A single CSS-property edit. Most common entry type.

```
[ sliders icon ] property: oldValue → newValue           [ batch-apply x N? ] [ revert ]
```

| Element | Behavior |
|---|---|
| **Icon** (`sliders`, accent-colored) | Identifies this as a style change. |
| **Property** | The camelCase or kebab-case CSS property name (e.g. `color`, `fontSize`, `border-top-width`). |
| **Old value** (red, strikethrough, max 20 chars) | What the property was before. |
| **`→`** | Direction of the change. |
| **New value** (green, max 20 chars) | What it is now. |
| **Click body** | Selects the element this change targets and scrolls it into view. |
| **Batch-apply** (`zap` icon, see below) | Applies this change to *every* matching element on the page (not just the one originally edited). |
| **Revert** (`trash`, hover-revealed) | Removes this single change, restoring the original value for this property on this element. |

#### Batch-apply with match-count badge

The batch-apply button shows `×N` when `N > 1` matching elements exist on the page (matched by the same selector).

| Visual state | Meaning |
|---|---|
| Faded grey, no border, opacity 0.55 | This change is currently scoped to one element. Click to apply it to all matching elements. |
| Faded with `×N` badge (opacity 0.85) | Same — N matching elements exist; click to fan out. |
| Blue accent-bg + accent-bordered + `×N` badge | This change *is currently* batch-applied to all N matches. Click to clear the batch flag (still keeps the original change on the original element). |

This is how you escalate a one-off edit into a sitewide change. E.g., changing `font-weight: 700` on one heading, then batch-applying so all 14 headings on the page also get it.

**Resize entries**: dragging an element's resize handles on the page emits its `width` and `height` as style changes sharing a **"Resize"** group, so they collapse into a single revertable row instead of two.

### 2. Text change

An edit to a text-bearing element's `textContent`.

For short edits (combined old + new under ~30 chars):

```
[ type icon ] text: oldText → newText           [ revert ]
```

For longer edits, a **char-level diff** renders inline — red strikethrough characters mark deletions, green characters mark insertions, and untouched runs render in the muted secondary text colour. Same `type` icon. Reverting restores the original text either way.

The diff is a Myers-LCS run (cheap on short strings; the 30-char cutoff prevents quadratic work on long inputs).

### 3. DOM change

A structural operation — delete, duplicate, move, insert, or text-edit.

```
[ kind icon ] ACTION <tagName>           [ revert ]
```

Each action has its own icon and color:

| Action | Icon | Color | What |
|---|---|---|---|
| `DELETE` | `trash` | danger (red) | Element was removed. |
| `DUPLICATE` | `layers` | purple | Element was cloned. |
| `MOVE` | `move` | amber (`#f59e0b`) | Element was reordered (drag in Layers tab). |
| `INSERT` | `plus` | success (green) | Element was inserted (e.g. paste). |
| `TEXT` | `type` | accent (blue) | Text was edited. |

Reverting a DOM change reverses the operation: a deleted element comes back; a duplicated one is removed; a moved one snaps to its original position; etc.

### 4. Comment

A sticky-note attached to an element.

Comments have **two visual states** — a compact card and an expanded "viewing" card. Both carry the same metadata: a numbered pin badge, the body, a relative timestamp (and "edited" marker if `updatedAt > timestamp`), plus actions for resolve / edit / delete.

#### Compact card (default)

```
[#3] [ message-square (yellow) ] comment text body...
                                  [ ✓ Resolve ]  [ Edit ]  [ Delete ]      5m ago
```

| Element | Behavior |
|---|---|
| **Pin number badge** (`#N`) | Mirrors the number painted on the page pin so panel ↔ overlay reference is unambiguous. Yellow when open, grey when resolved. |
| **Yellow message-square icon** | Comment indicator. |
| **Text body** | The comment's content. When resolved, body fades and gets a strikethrough. |
| **Resolve / Reopen** button (green when open, neutral when resolved) | Toggles the resolved flag. Resolved comments are kept (not deleted) — body strikethrough, pin fades to grey + 60% opacity. Reopen restores. |
| **Edit** button (purple) | Opens the comment-edit card up at the top of the panel; the textarea is pre-filled with the existing comment text. |
| **Delete** button (subdued grey, becomes danger on hover) | Opens the inline delete-confirm overlay. **Esc** dismisses. |
| **Time-ago + edited** | Right-aligned mono chip — `5m ago` / `2d ago`, plus `· edited 1m ago` when `updatedAt > timestamp`. |
| **Click body** | Switches to the expanded "viewing" state for this comment; also scrolls the page to the layer the comment is on (the yellow pin). |
| **Per-row checkbox** | Same as other change kinds — selecting 2+ comments + bulk-revert deletes them in one go. |

#### Expanded "viewing" card

```
[#3] [ yellow icon ]  selector text             5m ago      [ × close ]
                       (full comment body, multi-line, readable)
                       [ ✓ Resolve ]  [ Edit ]  [ Delete ]
```

The expanded card uses a purple-tinted background (or muted grey when resolved). The `×` button closes the expansion (back to the compact card). Edit and Delete actions are larger / more prominent here. The pin badge + timestamp sit in the header alongside the selector.

---

## Sticky bottom (Copy Prompt + Send to Agent)

Same as the rest of the panel. Pinned at the bottom regardless of which tab is active.

| Button | What | Disabled when |
|---|---|---|
| **Copy Prompt** (`clipboard` icon) | Builds a markdown prompt summarising every tracked change — element selector, before/after values for styles, text diffs, DOM operations, and any comments. Includes file:line / framework hints when source detection found them. Copies to clipboard. | The Changes toggle is in preview-original state, or no changes exist. |
| **Send to Agent** (`send` icon) | Sends the same payload via the MCP `ws://localhost:9960` channel directly to a connected coding agent (Claude Code, Cursor, etc.). | The Changes toggle is in preview-original state, or no changes, or MCP is offline, or MCP is running but no agent is connected. The button's tooltip names the specific blocker. |

Send to Agent uses an accent style to distinguish it from Copy as the higher-stakes action.

---

## Sort order

Items within a group are sorted by **timestamp** (creation order — earliest first). Across groups, the group order is the insertion order of the first change in each group (so groups appear in roughly the order you started editing each element).

---

## Generic semantics worth knowing

- **Reverting one change doesn't reset the whole element** — it removes that one property override (or undoes that one DOM operation). Other changes on the same element stay.
- **Reverting a DOM change is reversible** — the change-tracker stores enough info to reverse the operation (e.g., a deleted element's full HTML + position).
- **Batch-apply is a flag, not a permanent commitment** — toggling it on adds the same change record to every matching element; toggling off removes the flag but leaves the changes (you'd need to revert each individually). Use it as "apply this everywhere" when you want a sitewide edit.
- **The override stylesheet** is the mechanism behind every style change — Design Mode injects a `<style id="dm-applied-styles">` tag and rewrites it on every edit. Your changes survive page reloads (per-URL via `chrome.storage.session`) but not extension reloads.
- **`__dm.dump()`** in the page's DevTools console prints the current in-memory `styleChanges` / `textChanges` / `domChanges` arrays, useful for debugging.
- **`__dm.applied()`** in the page's DevTools console prints the current text of the override `<style>` element, so you can see exactly what CSS is being injected.

---

## Workflows

### Reviewing before shipping
1. Make your edits via the Design tab.
2. Switch to the Changes tab — every edit is here, grouped by element.
3. Click the **Changes** toggle in the buttons row to see the original; click it again to restore your edits.
4. Click **Copy Prompt**, paste into a coding agent, ship.

### Mass-applying a style
1. Select one element, edit a property in the Design tab.
2. Switch to Changes — the change appears with `×N` if multiple elements match the same selector.
3. Click the `zap` button in the change row — the change applies to all N elements.

### Cleaning up before ship
1. Switch to Changes.
2. For each row that's not part of the design intent, hover and click the `trash` icon to revert.
3. **Clear All** if you want to start over.

### Documenting design decisions
1. Use the comment action button (`message-square` in the action row) to add yellow sticky-note comments to layers.
2. Comments persist in the Changes tab and ship with **Copy Prompt** so the agent gets context.

---

## Edge-case states

- **Mid-edit page reload**: changes survive (via `chrome.storage.session` per-URL). The change-tracker re-applies them on next load. Selectors are recomputed against the post-reload DOM, so changes on dynamically-inserted elements may detach.
- **Element removed by the framework**: a tracked change pointing at a no-longer-present element stays in the list but is greyed out. Reverting removes the record.
- **Selector mismatch after re-render**: if the framework re-renders an element with different classes, the selector recorded with the change won't find it on next reload. The change stays in the list but is inert; the group is marked **stale** with a pill badge and faded to 70% opacity.
- **Send to Agent with stale MCP state**: clicking it when MCP just disconnected pops a brief error toast; reconnect via the `wifi` icon in the panel header.
