# Design Mode — Parity

This document audits Design Mode's Design tab against the web CSS specification and Figma's properties panel, by section and by property.

Each entry is bucketed:

- **At parity** — implemented and behaving the way you'd expect from CSS or Figma. Tables in this bucket list `feature → notes`. Status is implicit; if it's in this table, it works.
- **Planned** — known gap, scoped, has a path forward, not built yet.
- **Skipped** — feature considered and intentionally left out, with reason.

When CSS and Figma diverge, the section calls it out.

Last updated: 2026-05-14 (release 1.1.0).

Release 1.1.0 highlights: **In-panel Help view** added (Report an
issue + Copy diagnostics), **Alt+1/2/3 tab shortcuts** wired,
package versions synced across the monorepo.

Release 1.0.2 highlights: **Layout guide** section added (Columns /
Rows / Grid overlay via `::before`), **Motion** split out of Effects
into its own section, **Effects** refactored to the Figma-aligned
six-kind shape (Inner shadow · Drop shadow with chain-switching
checkbox · Layer blur · Background blur · Noise · Texture). See
CHANGELOG.md for the full list.

---

## Reading guide

The Design tab is organised in Figma's section order:

```
Indicator (selection chip)
  ↓
Icon / Media (when applicable)
  ↓
Position
  ↓
Layout
  ↓
Appearance
  ↓
Typography (text layers only)
  ↓
Fill
  ↓
Stroke
  ↓
Effects
```

Section visibility is gated by `LayerKind` (`text`, `container`, `media`, `svg`, `form`, `void`, `page`) — irrelevant sections are hidden per element type.

**Component / framework metadata**: source detection (component name, file path, framework) still runs in the background and rides along on the `ELEMENT_SELECTED` payload so Copy Prompt can hint the agent at a file:line. The Design tab itself is framework-neutral — no Component section is rendered, because that section was inherently React-specific.

---

## 1. Position

The Position section places a layer **inside its parent / on the page**, plus rotation, mirror, anchor, and 3D depth.

**Visibility (`LayerKind`)**: shown for `text`, `container`, `media`, `svg`, `form`, `void`. Hidden for `page` (the body / html element doesn't get positioned by the user — it *is* the viewport).

### At parity — main row controls

| Control | What it writes | Each value's meaning |
|---|---|---|
| **Position type** (select) | `position` | `static` (default flow; X/Y/Z and offsets are inert), `relative` (in flow but offsetable; creates a positioning context for absolute children), `absolute` (out of flow, anchored to nearest positioned ancestor), `fixed` (anchored to the viewport, ignores scroll), `sticky` (relative until you scroll past a threshold, then fixed-like at that edge). |
| **Object alignment grid** (6 buttons) | dispatches per parent context | The 3 horizontal buttons align the layer to its parent's left / center / right. The 3 vertical buttons align top / middle / bottom. **Block parent**: writes `margin-left/right: auto` (horizontal centering only — block flow doesn't natively vertical-center children). **Flex / grid parent**: writes `align-self` (vertical) and `justify-self` (horizontal). **Absolute / fixed**: writes `top`/`left`/`right`/`bottom: 0` plus `translate(-50%, -50%)` for centering. |
| **Distribute** (2 buttons, multi-select only) | parent's `justify-content` / `align-content` | Appears only when 2 or more siblings are selected. Writes `space-between` on the common parent (which is auto-flexed if not already) so all selected siblings space evenly. Horizontal button → main-axis distribution; vertical → cross-axis. |
| **X** | `left` | Distance from the parent's left edge (when `position ≠ static`). Accepts any CSS length: `0`, `10px`, `2rem`, `25%`, `auto`. Negative pulls the layer left of the parent. |
| **Y** | `top` | Same as X but for vertical positioning. |
| **Z** | `z-index` | Stacking order inside the same positioning context. Higher = in front. Only effective when `position ≠ static`. Accepts integer or `auto`. |
| **Z↑ (Bring forward)** | `z-index += 1` | Reads the current z-index (defaulting to 0 when `auto`), increments by 1, and writes back. |
| **Z↓ (Send backward)** | `z-index -= 1` | Same idea, decrement. |
| **Rotation** (input, deg) | `rotate` longhand | Rotates around `transform-origin` (default: center). Accepts any angle: `45deg`, `-90deg`, `0.5turn`. Negative spins counter-clockwise. |
| **CCW (90°)** | `rotate -= 90deg` | Reads current rotation, subtracts 90, wraps within (-360, 360). |
| **CW (90°)** | `rotate += 90deg` | Same idea, adds 90. |
| **Flip H** | toggles sign of `scale` X axis | Scales by `-1, 1` for horizontal mirror. Click again to un-flip. |
| **Flip V** | toggles sign of `scale` Y axis | Scales by `1, -1` for vertical mirror. |

### At parity — Advanced disclosure

| Control | What it writes | Each value's meaning |
|---|---|---|
| **Pivot 9-cell pad** (transform-origin) | `transform-origin` keyword pair | Sets the point that `rotate` and `scale` pivot around. Cells (top-left through bottom-right) write the matching keyword (`top left`, `top center`, …). Browsers normalise computed values to pixels (`296px 129px`), so the pad reads back by computing fractional position against the element's rect with a 15% tolerance — clicking a corner sticks reliably. |
| **Pivot raw input** | `transform-origin` | Free-form value: `25% 75%`, `100px 50px`, `top 30%`, etc. |
| **Skew X** (deg) | `transform: ...skewX(N)` | Slants the layer horizontally — top-right and bottom-left get pushed in the same direction. Composed surgically into the existing `transform` shorthand (your rotate/translate/scale stay intact). |
| **Skew Y** (deg) | `transform: ...skewY(N)` | Same idea, vertical slant. |
| **Right** (input) | `right` | Anchor from the parent's right edge instead of (or in addition to) left. Setting both `left` and `right` stretches the box horizontally between the two edges. Only meaningful when `position ≠ static`. |
| **Bottom** (input) | `bottom` | Anchor from the parent's bottom edge. Setting both `top` and `bottom` stretches the box vertically. |
| **Perspective** | `perspective` | Distance (in px) of the viewer from this element's 3D-transformed children. Smaller value = stronger 3D foreshortening. `none` disables. Lives on the *parent* of the 3D-transformed children (so set it on the container, not on the rotating element itself). |
| **Persp. origin** | `perspective-origin` | Where the "viewer's eye" is positioned. Default `50% 50%` (centered). `top right` looks down at children from upper-right. Only effective when `perspective` is set. |
| **Transform style** (select) | `transform-style` | `flat` (default — children render in 2D even if this element has a 3D transform) or `preserve-3d` (children's 3D transforms compound with this element's). Required for nested 3D rotations to look right. |
| **Backface visibility** (select) | `backface-visibility` | `visible` (default — back of an element is visible when rotated past 90°) or `hidden` (back is invisible — useful for card-flip effects where you don't want to see the mirrored content). |
| **Inset block-start / block-end / inline-start / inline-end** | `inset-block-start`, `inset-block-end`, `inset-inline-start`, `inset-inline-end` | Logical aliases for the physical edges. They auto-flip with `writing-mode` / `direction`: in `direction: rtl`, `inset-inline-start` is the right edge, not the left. In `writing-mode: vertical-rl`, the block axis becomes horizontal. Use these when authoring CSS for codebases that target multiple writing systems — they keep the design intent ("from the start of the block axis") instead of hard-coding "from the top". Visual outcome in default LTR horizontal mode is identical to the physical longhands. |
| **Anchor name** | `anchor-name` | Names this element as an anchor that another element (popover, tooltip, dropdown) can attach to. Accepts a custom-property-style identifier like `--menu-button` or `none`. The CSS Anchor Positioning system (now in all stable browsers as of 2025) lets you build dropdown menus, tooltips, and floating popovers without JavaScript by binding their position to a named anchor. |
| **Position anchor** | `position-anchor` | On a positioned element, names which anchor (`anchor-name`) to attach to. Pair with `position-area` to pick a region around the anchor. Replaces the JS-driven `getBoundingClientRect()` + manual offset computation pattern. |
| **Position area** | `position-area` | On a positioned element using anchor positioning, picks a region around the anchor for placement. Accepts 1 or 2 keywords from a small set: `top`, `bottom`, `left`, `right`, `center`, `start`, `end`, plus `span-*` variants. E.g., `top` (place above the anchor), `bottom right` (anchor's lower-right corner), `block-end inline-start` (logical version). |
| **Position try-order** (select) | `position-try-order` | Strategy for picking among `position-try-fallbacks` when the primary `position-area` doesn't fit. Values: `normal` (first that fits), `most-width`, `most-height`, `most-block-size`, `most-inline-size` (pick the fallback that gives the largest amount of the named axis). |
| **Position visibility** (select) | `position-visibility` | Whether the anchor-positioned element shows when the anchor isn't on-screen. `always` (default — always visible), `anchors-visible` (hide when anchor is off-screen), `no-overflow` (hide when the popover would overflow the viewport). |
| **Position try-fallbacks** (text) | `position-try-fallbacks` | Lists fallback positions to try if the primary `position-area` doesn't fit. The browser walks the list with the `position-try-order` strategy until one fits. Accepts a comma-separated list of `position-area` keywords or named `@position-try` rules. E.g., `top, bottom, left, right`. |
| **View transition name** | `view-transition-name` | Tags this element with a name so the browser's View Transitions API can identify it across navigations / DOM updates and animate its size, position, and content change. Set the same name on the "before" element and the "after" element, kick off `document.startViewTransition(...)`, and the browser interpolates between them. Real designer's choice — naming a hero image `hero-cover` so it morphs smoothly when the user navigates from list view to detail view. Accepts an identifier or `none`. |
| **Transform reference box** (select) | `transform-box` | Picks the reference box that `transform-origin` and `transform` are computed against. Values: `view-box` (default for SVG — the SVG viewBox), `fill-box` (object bounding box of the SVG element), `stroke-box` (stroke bounding box), `border-box` (CSS border box), `content-box` (CSS content box). Most often relevant for SVG layers — change from `view-box` to `fill-box` so a transform-origin of `50% 50%` actually means "center of the path", not "center of the SVG canvas". |
| **Raw transform** | `transform` | Free-form CSS shorthand for everything: `rotate(15deg) translate(10px, 5px) scale(1.2) skew(5deg) rotateX(30deg)`. Ideal when you need 3D rotations or function-call ordering that the longhands don't expose. |
| **Align self** | `align-self` | Cross-axis self-alignment override on a flex/grid item. Values: `auto`, `start`, `center`, `end`, `flex-start`, `flex-end`, `stretch`, `baseline`, plus modifier keywords like `safe center`. Overrides parent's `align-items`. |
| **Justify self** | `justify-self` | Main-axis self-alignment override on a grid item (and some flex contexts). Same value set as `align-self`. |

### Layer-kind specifics

| Layer kind | Position behaviour |
|---|---|
| `text` (h1-h6, p, span, a, button, label, …) | Full Position section. Useful for floating labels, animated text, badge positioning. |
| `container` (div, section, main, ul, ol, nav, header, footer, article) | Full Position section. The most common use — frame positioning. |
| `media` (img, picture, video, canvas, iframe, audio) | Full Position section. Pin floating videos, anchor images on a hero. |
| `svg` | Full Position section. SVG roots position like any other replaced element. |
| `form` (input, textarea, select, button[type]) | Full Position section. |
| `void` (br, hr, meta) | Full Position section but mostly inert — `<br>` and `<hr>` rarely use positioning. |
| `page` (html, body) | **Hidden.** The page is the viewport; positioning the body itself is rare and surfaces problems more often than it helps. |

### Skipped

None. Position is at full CSS coverage — every property the spec defines for placing a single element on the page is exposed somewhere in the section.

---

## 2. Layout

### At parity

| CSS property | Notes |
|---|---|
| `display` (`block` / `flex` / `inline-flex` / `grid` / `inline-grid` / `inline` / `inline-block` / `none`) | 4-mode segmented (`free` → `block`, `hstack` → `flex` row, `vstack` → `flex` column, `grid` → `grid`). Other `display` values writable via the raw select in advanced. |
| `width`, `height` | Length inputs accepting any CSS length / keyword (`auto`, `min-content`, `max-content`, `fit-content`, `100%`, etc.). |
| `min-width`, `max-width`, `min-height`, `max-height` | Always visible row of 4 (3-col span each). |
| `aspect-ratio` | Lock toggle next to W (turns blue when set). Click to lock to current W÷H ratio; click again to unlock (`auto`). Raw value editable in Advanced. |
| `box-sizing` (`content-box` / `border-box`) | Select in the overflow row. |
| `overflow`, `overflow-x`, `overflow-y` | Three selects in one row + the "Clip content" toggle (writes `overflow: hidden`). |
| `clip-path` | Preset select with `none`, `inset(10px)`, `circle(50%)`, `ellipse(50% 50%)`, polygon, rounded inset. |
| `padding-*` (per-side) | Chrome DevTools-style nested box (`spacingBox`). |
| `margin-*` (per-side) | Same `spacingBox` (also writable via Position alignment). |
| `flex-direction` | Inferred from layout-mode segmented (`hstack`/`vstack`); editable raw in advanced via `flex-wrap`. |
| `flex-wrap` | Advanced. |
| `justify-content` / `align-items` | 9-cell children-align pad. |
| `gap`, `row-gap`, `column-gap` | Context-gated — vertical-stack shows row-gap only, horizontal-stack shows column-gap only, grid shows both. |
| `flex-grow`, `flex-shrink`, `flex-basis` | Advanced disclosure — flex-item context. |
| `order` | Advanced disclosure — flex-item context. |
| `align-content` | Advanced — render when flex container or grid container. |
| `place-items`, `place-content` | Advanced — shorthand inputs for flex/grid containers. |
| `place-self` | Advanced — when this element is a grid item. |
| `grid-template-columns`, `grid-template-rows` | Advanced — text inputs accepting full CSS grid track syntax. |
| `grid-template-areas` | Advanced — `<textarea>` for multi-line areas like `"a a b" "c c b"`. |
| `grid-auto-columns`, `grid-auto-rows` | Advanced — text inputs alongside `grid-auto-flow`. |
| `grid-auto-flow` | Advanced select. |
| `grid-column`, `grid-row`, `grid-area` | Advanced — render when this element's parent is `display: grid`. |

### Planned

_Nothing planned for Layout._ Logical margin shipped to Layout → Advanced; the rest of the previously-planned items moved to Skipped below with explicit rationale.

### Skipped

| Feature | Reason |
|---|---|
| **Logical sizing** (`block-size`, `inline-size`, `min/max-block-size`, `min/max-inline-size`) | Logical aliases for `width` / `height` / `min-*` / `max-*`. The physical longhands we already expose cover the same visual. Power-user CSS for international layouts. We re-evaluate if a real RTL / vertical-writing use case shows up. |
| **Logical padding** (`padding-block`, `padding-inline`, `padding-block-start`, etc.) | Logical aliases for `padding-*`. Physical longhands in `spacingBox` cover the same visual. Could move to Planned if logical margin alone proves insufficient. |
| **`contain` / `contain-intrinsic-size`** | Performance / containment hints. The `contain` property is already exposed in **Appearance → Performance**; `contain-intrinsic-size` belongs there too if surfaced. Permanently skipped here. |
| **`scroll-snap-*`** suite | Snap points for scrollable containers. Whole subsection of its own; reconsider if user demand surfaces. |
| **`float`** (`none` / `left` / `right`) | Legacy float-based layout primitive. Modern flex / grid / position cover all design intents float was used for. Surfacing `float` invites confusion (text-wrap is its only remaining legitimate use, and it has its own quirks). Permanently skipped. |
| **`clear`** (`none` / `left` / `right` / `both`) | Float partner — clears past previously-floated siblings. Same reason as `float`. Permanently skipped. |
| **`clip`** (deprecated rectangular clip) | Replaced by `clip-path` (which we expose). The CSS spec marks `clip` as deprecated and discourages its use. Permanently skipped. |
| **`writing-mode` / `direction`** | Affects text flow, not box layout. Belongs in Typography → advanced if anywhere. |
| **`overflow-anchor`** | Browser-default scroll-anchor behaviour. Behavioural, rarely set in design tools. |
| **`will-change`** | Performance hint, not a visual property. Belongs in dev tooling. |
| **`overflow-clip-margin`** | Niche extension of `overflow: clip`. Reconsider only if user demand surfaces. |
| **`text-box-trim` / `text-box-edge`** | New CSS for tighter typographic rhythm. Belongs in Typography. Hold. |

### Figma vs CSS divergence

| Figma concept | CSS equivalent | Notes |
|---|---|---|
| Auto Layout | `display: flex` + `flex-direction` + `gap` + `padding` + `align-items` + `justify-content` | "Auto-layout = on" maps to picking horizontal-stack / vertical-stack in our mode segmented. |
| Constraints (Hug / Fixed / Fill) | `width: max-content` (hug), fixed length (fixed), `width: 100%` or `flex: 1` (fill) | Exposed via the W input keywords and the resize-to-fit shortcut. |
| Position: Absolute | `position: absolute` + `top`/`left`/`right`/`bottom` | Alignment buttons dispatch absolute-style writes when the layer is positioned. |
| Boolean ops (union / subtract / intersect / exclude) | SVG `<path>` operations or `clip-path` | CSS has no live boolean-op compositor for `<div>`s. Out of scope. |
| Vector network | SVG `<path>` | Out of scope; we ship Icon detection for SVGs but don't author paths. |
| Stack constraints (Wrap behaviour) | `flex-wrap` | Already covered. |

---

## 3. Appearance

### At parity

Primary (always visible):

| CSS property | Notes |
|---|---|
| `opacity` | Numeric `0`–`1`. |
| `mix-blend-mode` | Full Figma list — `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`, `plus-lighter`. |
| `isolation` | Toggle button next to Opacity / Blend. Forces a new stacking context so blend modes don't bleed across siblings. |
| `border-radius` (uniform) | Primary numeric input — fans to all four corners. Accepts elliptical `X Y` pairs (e.g. `12px 24px`). |
| `border-top-left-radius` / `border-top-right-radius` / `border-bottom-right-radius` / `border-bottom-left-radius` | Per-corner via the scan-toggle 2×2. Each cell now has dedicated **X** and **Y** inputs separated by `/` — typing in X alone keeps Y at its current value, so circular and elliptical edits are both first-class. |
| `filter` color-adjust functions | Icon button row toggles each function (**brightness**, **contrast**, **saturate**, **hue-rotate**, **grayscale**, **invert**, **sepia**, **drop-shadow**). Composes with the existing string — re-clicking removes only the named function. |
| `filter` (raw) | Free-text input below the icon row for fine control. |

Advanced disclosure (chevron):

| Sub-section | CSS property | Notes |
|---|---|---|
| Visibility & cursor | `visibility` | `visible` / `hidden` / `collapse`. |
| Visibility & cursor | `cursor` | Full cursor keyword list including 8-direction resize variants. |
| Visibility & cursor | `color-scheme` | `normal` / `light` / `dark` / `light dark` / `only light` / `only dark`. Hints the browser for native scrollbar / form-control colours. |
| Visibility & cursor | `forced-color-adjust` | `auto` / `none` / `preserve-parent-color`. Windows High Contrast / forced-colors mode. |
| Interaction | `pointer-events` | `auto` / `none` (clicks pass through) / `all`. |
| Interaction | `user-select` | `auto` / `none` / `text` / `all` / `contain`. |
| Interaction | `appearance` | `auto` / `none` / native form-control keywords (`textfield`, `menulist-button`, etc.). |
| Form colours (kind=form) | `accent-color` | Form-control accent (checkbox / radio / range). |
| Form colours (kind=form) | `caret-color` | Text-input caret colour. |
| Backdrop adjust | `backdrop-filter` color-adjust functions | Same icon row as `filter` but writes to `backdrop-filter`. Composes — re-clicking a function removes just it. |
| Backdrop adjust | `backdrop-filter` (raw) | Free-text input. |
| Clip path | `clip-path` | Visual shape editor: pick a shape (`none` / `inset` / `circle` / `ellipse` / `polygon` / `path` / `url` / `custom`), then edit the relevant fields (insets per edge, radius + centre, vertex list, SVG path string, fragment id). Raw input alongside for power users. |
| Scrollbars | `scrollbar-width` | `auto` / `thin` / `none`. |
| Scrollbars | `scrollbar-color` | Two-colour pair (thumb track) or `auto`. |
| Scrollbars | `scrollbar-gutter` | `auto` / `stable` / `stable both-edges`. |
| Performance | `contain` | CSS containment. `none` / `strict` / `content` / sub-keyword combos. |
| Performance | `content-visibility` | `visible` / `auto` (skip rendering offscreen) / `hidden`. |
| Performance | `will-change` | Hint for compositor. |

### Planned

_Nothing planned for Appearance._ The clip-path polygon now uses per-vertex X / Y inputs (with Add / Remove); a small live SVG preview renders next to the editor for inset / circle / ellipse / polygon shapes.

### Skipped

| Feature | Reason |
|---|---|
| **Corner smoothing** (Figma squircle) | Figma proprietary `SuperEllipse` math; CSS has no equivalent. Permanently skipped. |
| **`-webkit-line-clamp`** + companions | Multi-line ellipsis. Lives in Typography → Advanced. |
| **`overscroll-behavior`** | Behavioural (scroll chaining), not visual. |
| **`touch-action`** | Behavioural (gestures), not visual. |

---

## 4. Typography

### At parity

Primary controls (always visible on text layers):

| CSS property | Notes |
|---|---|
| `font-family` | Picker showing fonts actually used on the page + curated fallbacks. |
| `font-size` | Length input. |
| `font-weight` | Select with named keywords (Thin → Black mapped to 100–900). |
| `font-style` (`italic`) | Italic toggle button. |
| `line-height` | `move-vertical` icon-labelled input. Accepts unitless multipliers, lengths, or `normal`. |
| `letter-spacing` | `move-horizontal` icon-labelled input. |
| `text-align` (`left` / `center` / `right` / `justify`) | 4-button toggle. |
| `text-decoration-line` (`underline`, `line-through`) | Underline + strikethrough toggle buttons. |
| `text-transform` (`none` / `uppercase` / `lowercase` / `capitalize`) | 4-button toggle. |
| `color` | Color picker. |
| `font-weight: bold` toggle | Bold toggle (writes weight 700 when on, 400 when off). |
| `list-style-type` (`none` / `disc` / `decimal`) | 3-button toggle. |

Advanced disclosure (chevron in the Typography section header):

| Sub-section | CSS property | Notes |
|---|---|---|
| Decoration | `text-decoration-style` | `solid` / `double` / `dotted` / `dashed` / `wavy`. |
| Decoration | `text-decoration-color` | Decoration colour, independent of text colour. |
| Decoration | `text-decoration-thickness` | Length, `auto`, or `from-font`. |
| Decoration | `text-underline-offset` | Distance from baseline. |
| Decoration | `text-underline-position` | `auto` / `under` / `from-font` / `left` / `right`. |
| Decoration | `text-decoration-skip-ink` | `auto` / `none` / `all`. |
| Wrapping | `white-space` | `normal` / `nowrap` / `pre` / `pre-wrap` / `pre-line` / `break-spaces`. |
| Wrapping | `text-wrap` | `wrap` / `nowrap` / `balance` / `pretty` / `stable`. |
| Wrapping | `word-break` | `normal` / `break-all` / `keep-all` / `break-word`. |
| Wrapping | `overflow-wrap` | `normal` / `break-word` / `anywhere`. |
| Wrapping | `hyphens` | `none` / `manual` / `auto`. |
| Wrapping | `text-justify` | `auto` / `inter-word` / `inter-character` / `none`. |
| Wrapping | `text-align-last` | Alignment of the last line in justified text. |
| Wrapping | `line-break` | `auto` / `loose` / `normal` / `strict` / `anywhere`. |
| Layout in text | `text-indent` | First-line indent. |
| Layout in text | `tab-size` | Tab character width. |
| Layout in text | `word-spacing` | Extra space between words. |
| Layout in text | `vertical-align` | Inline-level vertical alignment. |
| Layout in text | `-webkit-line-clamp` | Number input. N>0 writes `display: -webkit-box` + `-webkit-box-orient: vertical` + clamp + `overflow: hidden`. N=0 clears the clamp. |
| Layout in text | "Truncate" button | One click writes `text-overflow: ellipsis` + `white-space: nowrap` + `overflow: hidden`. |
| Direction (i18n) | `direction` | `ltr` / `rtl`. |
| Direction (i18n) | `writing-mode` | `horizontal-tb` / `vertical-rl` / `vertical-lr` / `sideways-rl` / `sideways-lr`. |
| Direction (i18n) | `unicode-bidi` | `normal` / `embed` / `isolate` / `bidi-override` / `isolate-override` / `plaintext`. |
| Font features | `font-stretch` | Variable-font width axis (percentage / keyword). |
| Font features | `font-size-adjust` | Adjusts fallback-font glyph aspect ratio against the primary font. |
| Font features | `font-kerning` | `auto` / `normal` / `none`. |
| Font features | `font-optical-sizing` | `auto` / `none`. |
| Font features | `font-synthesis` | Allow / disallow synthesis of bold / italic / small-caps when missing in the font. |
| Font features | `font-variant-caps` | `normal` / `small-caps` / `all-small-caps` / `petite-caps` / `all-petite-caps` / `unicase` / `titling-caps`. |
| Font features | `font-variant-position` | `normal` / `sub` / `super` (CSS-driven sub/super-script glyphs). |
| Font features | `font-variant-numeric` | Tabular-nums, oldstyle-nums, slashed-zero, fractions. |
| Font features | `font-variant-ligatures` | Common / discretionary / historical / contextual. |
| Font features | `font-feature-settings` | Raw OpenType feature string. |
| Font features | `font-variation-settings` | Raw variation-axis string for variable fonts. |
| List | `list-style-position` | `outside` / `inside`. |
| List | `list-style-image` | `none` or a `url(...)` for a custom marker image. |
| Rendering | `text-rendering` | `auto` / `optimizeSpeed` / `optimizeLegibility` / `geometricPrecision`. |

### Planned

_Nothing planned for Typography._ The Advanced disclosure is currently exhaustive within our scope.

### Skipped (and why)

Each of these is intentionally out-of-scope. The reasons are durable, so we don't expect to revisit unless a specific project demand surfaces.

| Feature | Reason |
|---|---|
| **`text-shadow`** | Lives in the **Effects** section, alongside `box-shadow` and the other shadow / blur effects. Typography owns text *layout / glyph* properties; shadows are visual effects regardless of what's casting them. |
| **`text-emphasis`**, **`text-emphasis-color`**, **`text-emphasis-position`**, **`text-emphasis-style`** | CJK emphasis marks (e.g. dots above ideographs). Out of scope until we ship a CJK-focused project. |
| **`text-orientation`** | Glyph orientation under vertical `writing-mode`. CJK-specific. |
| **`ruby-position`**, **`ruby-align`**, **`ruby-overhang`** | Ruby annotations above CJK glyphs. CJK-specific. |
| **`text-combine-upright`** | Stack a small run of digits upright inside vertical text (CJK). |
| **`font-variant-east-asian`** | Selects between simplified vs traditional / full-width vs proportional CJK glyph variants. |
| **`font-variant-alternates`** | Stylistic-set / character-variant OpenType picker. Power-user; would need a per-font feature browser to be meaningful. |
| **`font-variant-emoji`** | Newer; limited browser support; very niche (force text vs emoji presentation). |
| **`font-language-override`** | Override the language used to pick locale-specific glyphs. Niche internationalisation. |
| **`font-palette`** + **`@font-palette-values`** | Color-font palette selection. Very niche; needs a palette authoring tool to be useful. |
| **`hyphenate-character`** | Custom hyphen glyph. Cosmetic detail; default hyphen is right 99% of the time. |
| **`text-box-trim`** + **`text-box-edge`** | Proposal-stage CSS for tighter rhythm. Browser support spotty (Chrome 123+, partial Safari). Re-evaluate when stable. |
| **`white-space-collapse`** + **`text-spacing-trim`** | Newer alternates / additions. Browser support too uneven to commit UI. |
| **`@font-face` editor / font upload** | Tooling / asset-management concern, not a per-element design tab. The font picker still exposes fonts the page has loaded. |

---

## 5. Fill

### At parity

Each fill layer renders as a single row (drag handle | swatch | label | eye | settings | trash). Click the gear to expand a per-layer body underneath; click again to collapse back to one row.

Layered list:

| Feature | Notes |
|---|---|
| Multi-fill stacking | Top of the list paints on top (matches Figma + CSS comma order). Bottom-most solid is `background-color`; image-stack is `background-image`. |
| Drag-to-reorder | HTML5 drag-and-drop on the row itself. Solid is anchored to the bottom. |
| Per-fill visibility (eye) | In-memory `Map<elementId, FillLayer[]>` so a hidden layer keeps its raw CSS until the user toggles it back on. |
| + Add fill (inline menu) | 5 type pills below the trigger: Solid / Linear / Radial / **Conic** / Image. No popover (the previous absolute-positioned popover was unanchored — fixed). |
| Eyedropper | Chrome `EyeDropper` API. Opens the system colour picker; on unsupported browsers a tooltip explains the requirement. |
| Site-colour tokens dropdown on hex input | Focusing any colour-input's hex field opens a tokens-only dropdown beneath it (no HSV picker). Click a token to apply. The full HSV+tokens panel still opens when the swatch is clicked — this is the lightweight shortcut. |
| Image fit mode segmented (Fill / Fit / Crop / Tile) | 4-button row above an image layer's Size + Repeat selects. Each writes a {size, repeat} pair atomically (Fill = `cover` + `no-repeat`; Fit = `contain` + `no-repeat`; Crop = `100% 100%` + `no-repeat`; Tile = `auto` + `repeat`). |
| 9-cell position pad | 3×3 visual grid replacing the position keyword select. Each cell writes one of nine `X% Y%` pairs to the layer's `background-position` slot; the active cell is highlighted from the parsed current position. |

Per-layer (CSS comma-positional, dispatched aligned by layer order):

| CSS property | Notes |
|---|---|
| `background-color` | One per element (the solid). |
| `background-image` | Comma-separated stack of `linear-gradient` / `radial-gradient` / `conic-gradient` / `url(...)` entries. |
| `background-size` | Per-layer (`auto` / `cover` / `contain` / explicit pair). |
| `background-repeat` | Per-layer. |
| `background-position` | Per-layer (9-keyword pad as a select). |
| `background-blend-mode` | Per-layer (every CSS blend keyword). |

Visual gradient editing:

| Feature | Notes |
|---|---|
| Stop list | Each stop is one row: colour swatch + position input + trash. + Add stop button at the bottom. |
| Angle / shape / from-clause | Editable as a separate `Angle` (linear) / `Shape` (radial) / `From` (conic) input. |
| Conic gradient | First-class `+ Add` option. Default writes a 4-stop colour wheel. |

Fill Advanced (chevron in section header):

| CSS property | Notes |
|---|---|
| `background-clip` | `border-box` / `padding-box` / `content-box` / `text`. |
| `background-origin` | `border-box` / `padding-box` / `content-box`. |
| `background-attachment` | `scroll` / `fixed` / `local`. |
| **Gradient text** preset | One click writes `background-clip: text`, `-webkit-background-clip: text`, `-webkit-text-fill-color: transparent`, `color: transparent` — the canonical CSS recipe for filling glyph shapes with the topmost gradient/image. |
| `mask-image` | URL or `none`. |
| `mask-mode` | `match-source` / `alpha` / `luminance`. |
| `mask-composite` | `add` / `subtract` / `intersect` / `exclude`. |
| `mask-repeat`, `mask-size`, `mask-position` | Mirror their `background-*` siblings. |
| `mask-origin`, `mask-clip` | Painting box for the mask layer. |

SVG paint variant — when `kind === 'svg'`, the Fill section also surfaces SVG-only paint properties (which take precedence over presentation attributes in CSS):

| CSS property | Notes |
|---|---|
| `fill` | Path / shape paint colour. |
| `fill-opacity` | 0–1. |
| `fill-rule` | `nonzero` / `evenodd`. |
| `stroke`, `stroke-width`, `stroke-opacity` | Path stroke. (Distinct from the box's CSS `border-*` — those still live in the Stroke section.) |
| `stroke-linecap`, `stroke-linejoin` | `butt` / `round` / `square`; `miter` / `round` / `bevel`. |
| `stroke-dasharray`, `stroke-dashoffset` | Dashed path patterns. |

### Planned

_Nothing planned for Fill._ The section is at full parity with Figma + web-CSS within the scope set by the Skipped table below.

### Skipped

| Feature | Reason |
|---|---|
| **`background` shorthand text input** | We expose all longhands; shorthand is just a concession to terseness. |
| **CSS Paint API (`paint(...)`)** | Programmatic backgrounds via Houdini. Limited support. |
| **Image fill rotation** | No clean CSS path for rotating a single `background-image` entry; would require pseudo-elements or a wrapper. Out of CSS Fill scope. |
| **Per-fill opacity slider** | CSS has no per-layer opacity. We bake alpha into rgba colour stops; an opacity slider would be a UI-only convenience that just rewrites colours. Re-evaluate if user demand surfaces. |
| **`mask-border-*` family** | Image-mask the border area. Rare, partial browser support. |

### Figma vs CSS divergence

| Figma concept | CSS equivalent | Where in our panel |
|---|---|---|
| Multi-fill stacking | `background-image` comma-list (first in CSS = top of stack). | Fill section, layered list. |
| Image fill with crop / fit | `background-size: cover` / `contain` / explicit + `background-position`. | Per-layer expanded body. |
| Pattern fill / Tile | `background-repeat: repeat` + an explicit `background-size`. | Per-layer expanded body. |
| Diamond gradient | Not directly representable; would need a clipped conic with custom stops. | **Skipped** — no clean CSS path. |
| Per-fill blend mode | `background-blend-mode` (per-layer comma). | Per-layer expanded body. |
| Element-wide blend mode ("Pass through") | `mix-blend-mode`. | **Appearance** section. |
| Element-wide opacity | `opacity`. | **Appearance** section. |
| Image colour adjustments (exposure / contrast / saturation) | `filter: brightness/contrast/saturate/...`. | **Appearance** section (element-wide; CSS can't apply per-image). |
| Drop / inner shadow | `box-shadow`. | **Effects** section. |
| Background blur | `filter: blur` / `backdrop-filter: blur`. | **Effects** section. |

---

## 6. Stroke (Border / Outline / Inset shadow)

### At parity

Primary row (always visible):

| Feature | CSS dispatched | Notes |
|---|---|---|
| **Position: Inside / Outside / Center** | Outside → `border-*`. Inside → `box-shadow: inset 0 0 0 N <c>` (synthesised — CSS has no native inside-stroke). Center → `outline-*` + `outline-offset: -(N/2)`. | Mutually exclusive segmented control. |
| **Color** | Fans to all four `border-*-color` (or `outline-color` in Center, or the colour token in the inset shadow). | Single colour writes uniformly across sides; per-side colours via the per-side panel. |
| **Weight** | Fans to all four `border-*-width` (or `outline-width`). | Length input. `0` clears the stroke. |
| **Style dropdown** | All four `border-*-style` (or `outline-style` in Center). | Every CSS keyword: `solid`, `dashed`, `dotted`, `double`, `groove`, `ridge`, `inset`, `outset`, `hidden`, `none`. Plus `auto` (outline-only — picking it auto-switches the position to Center and writes `outline-style: auto`, which renders the browser-native focus ring). |
| **Per-side toggle** (`settings-2` icon) | Reveals per-side panel. | Only shown in Outside mode **and** while there's a single stroke. Inside / Center are CSS-uniform; multi-stroke is CSS box-shadow chained, also uniform per stroke. |

Per-side panel (Outside mode only):

| Feature | CSS dispatched | Notes |
|---|---|---|
| **Per-side width** | `border-top-width` · `border-right-width` · `border-bottom-width` · `border-left-width` | One row per side. While the panel is open, the primary Weight field stops fanning out so per-side values aren't clobbered. Edits auto-promote `border-style: none → solid` so the change is visible. |
| **Per-side colour** | `border-top-color` · `border-right-color` · `border-bottom-color` · `border-left-color` | Each side gets its own colour picker (swatch + hex input + tokens dropdown on focus). |
| **Per-side style** | `border-top-style` · `border-right-style` · `border-bottom-style` · `border-left-style` | Each side gets its own dropdown (full CSS style set). |

Layered list (renders when 2+ strokes exist):

| Feature | CSS dispatched | Notes |
|---|---|---|
| **Multi-stroke** | Comma-separated `box-shadow` (`inset` for Inside, non-inset for Outside multi). | Stack multiple strokes on the same element. Top of list = closest to the element (CSS shadow paint order). |
| **+ Add stroke** | Pushes a new layer (1px white) onto the stack. | Disabled in Center mode (CSS `outline` doesn't stack — tooltip explains). |
| **Auto-migration** (Outside, 1 → 2 strokes) | Reads existing `border-*-width/-color/-style`, collapses per-side widths to `Math.max(T,R,B,L)`, clears `border-*-width`, writes `box-shadow` chain. | Surfaces a small note: "Top of list paints closest to the element. Per-side widths are unavailable while strokes are stacked." |
| **Auto-migration** (Outside, 2 → 1 strokes) | Restores `border-*-width/-color`, clears stroke-shaped `box-shadow` entries (preserves Effects-section drop / inner shadows). | Per-side toggle reappears. |
| **Drag-to-reorder** | Re-serialises the chain on drop. | Mirrors Fill's HTML5 DnD. |
| **Per-layer visibility** (eye) | Filters out hidden layers in the dispatcher. | Layer state survives across element re-selection (in-memory `Map<id, StrokeLayer[]>`). |
| **Active-row highlight** | The primary controls (Colour / Weight) operate on the highlighted layer. | Click any row to make it active. |

Other primary controls:

| Feature | CSS dispatched | Notes |
|---|---|---|
| **Outline offset** | `outline-offset` | Center-mode-only input. Negative pulls inward toward the box edge; positive pushes outward. Auto-seeded at `-(weight/2)` when entering Center mode. |
| **Dashed config panel** | CSS custom properties `--dm-stroke-dash`, `--dm-stroke-gap`, `--dm-stroke-cap` | Surfaces only when style is `dashed`. Captures user intent. |
| **Custom dashes** (preset button) | Synthesises a corner-aware SVG with the user's `dash`, `gap`, `cap`, `weight`, `color` and writes it as `border-image-source` (slice = weight, repeat = `round`). | Pixel-precise rendering — the typed dash / gap finally honoured visually. The 4-region SVG + `repeat: round` makes the browser auto-align dashes at every corner. The SVG is element-size independent. Auto-promotes `border-style` from `none` to `solid` and seeds `border-width: 2px` if currently zero (border-image needs both to render). |
| **Native pattern** (preset button) | Clears `border-image-source` back to `none` and resets the other border-image-* properties to their defaults. | Drops back to the browser's native CSS dashed pattern. |
| **Stroke-style intent map** | In-memory only | Per-element map so the dashed config panel still toggles in Inside mode (where CSS can't render dashed visually but the user still wants to capture the design intent). |

Stroke Advanced (chevron in section header):

| Feature | CSS property | Notes |
|---|---|---|
| **Border-image source** | `border-image-source` | Image URL or any CSS `<image>` (gradient, etc.). Replaces the rendered border with the image's slices. |
| **Border-image slice** | `border-image-slice` | Defines the 9 regions of the source. Number / percentage / `fill`. Default `100%`. |
| **Border-image width** | `border-image-width` | Width per side or shorthand. Default `1` (= use the existing `border-width`). |
| **Border-image outset** | `border-image-outset` | Pushes the image area beyond the border box. |
| **Border-image repeat** | `border-image-repeat` | `stretch` / `repeat` / `round` / `space`. |
| **Gradient stroke** preset | Writes a default linear-gradient as `border-image-source` and seeds `border-width: 4px` + `border-style: solid` if currently empty. | One-click for the common "gradient border" recipe. |
| **Clear image** preset | Resets `border-image-*` back to defaults (`none`, `100%`, `1`, `0`, `stretch`). | — |

### Planned

_Nothing planned for Stroke._ The section is at full parity with Figma + web-CSS within the scope set by the Skipped table below.

### Skipped

| Feature | Reason |
|---|---|
| **`border-collapse` / `border-spacing`** | Table-only. Out of scope for a per-element design tab. |
| **Logical border properties** (`border-block-start-*`, `border-inline-end-*`, etc.) | Aliases for the physical longhands which we already cover. Adding a parallel set would double the surface area without new visual capability for left-to-right writing modes. Re-evaluate when we add i18n-first projects. |
| **`mask-border-*`** | Image-mask the border area. Rare, partial browser support; `border-image` covers the vast majority of "image as border" use cases. |
| **`column-rule-*`** | Vertical rules between multi-column children. Belongs in a future "Columns" section if at all. |

---

## 7. Effects

### At parity

Layered list — every effect on the element renders as its own row:

| Effect kind | CSS dispatched | Notes |
|---|---|---|
| **Drop shadow** | `box-shadow` (no `inset`) | One row per non-stroke, non-inset entry in the `box-shadow` chain. Per-shadow editor: inset toggle (flips drop ↔ inner), x, y, blur, spread, colour. |
| **Inner shadow** | `box-shadow: inset` | One row per inset entry. Same per-shadow editor. |
| **Drop shadow (filter)** | `filter: drop-shadow(...)` | One row per `drop-shadow()` call inside `filter`. Distinct from box-shadow because it follows the rendered alpha edge — perfect for SVG icons, `clip-path`'d shapes, transparent PNGs. No `spread` / `inset` (CSS limitation). |
| **Text shadow** | `text-shadow` | Surfaces only on text-bearing layers. |
| **Layer blur** | `filter: blur(N)` | One row per `blur()` call inside `filter`. Single radius input. |
| **Background blur** | `backdrop-filter: blur(N)` | Same on `backdrop-filter`. |

Layered list mechanics:

| Feature | Notes |
|---|---|
| **Drag-to-reorder** | HTML5 DnD on each row. Drag is constrained to within the same CSS chain (a drop shadow can't be dragged onto a layer-blur — different chains). |
| **Per-effect visibility** (eye) | In-memory `hiddenEffectsByElement` Map. Toggling eye stashes the entry's raw CSS in `stashedEffectByKey` and removes it from the chain; toggling back splices it back at its original index. |
| **Per-effect remove** (trash) | Cleanly removes the entry from its CSS chain (preserves siblings). |
| **+ Add menu** | Single-effect adds (drop / inner / text / filter-drop / layer-blur / backdrop-blur). All adds **append** to the existing chain so multi-shadow / multi-filter stacks naturally. |
| **+ Add menu — Composed presets** | One-click multi-property recipes: Soft drop · Hard drop · Layered drop (5-shadow stack) · Glow · Embossed · Frosted glass · Neon text. |
| **+ Add menu — Motion** | Transition · Animation · Transform · Motion path (seeds an oval `offset-path`). |

Motion subsection (renders only when the relevant property is set):

| Subsection | Properties |
|---|---|
| **Transition** | `transition-property` / `-duration` / `-timing-function` / `-delay`, with the cubic-bezier picker. |
| **Animation** | `animation-name` / `-duration` / `-timing-function` / `-delay` / `-iteration-count` / `-direction` / `-fill-mode` / `-play-state`. 12 built-in `dm-*` keyframes. |
| **Transform** | `translate`, `rotate`, `scale`, `skew` via `transform`. Per-axis editors. |
| **Motion path** | `offset-path`, `offset-distance`, `offset-rotate`, `offset-anchor`, `offset-position`. CSS-native equivalent of SVG `<animateMotion>`. |
| **View transition** | `view-transition-name`, `view-transition-class`. Bridges the View Transitions API — the CSS metadata is captured statically; the actual transition fires when the page calls `document.startViewTransition()`. The same `view-transition-name` is also exposed in Position → Advanced (both contexts are valid; the property is transferable). |
| **Scroll-driven animation** | `animation-timeline`, `animation-range` / `-start` / `-end`, `scroll-timeline-name` / `-axis` / `scroll-timeline`, `view-timeline-name` / `-axis` / `-inset` / `view-timeline`, `timeline-scope`. Includes a one-click "Bind to page scroll" preset that writes `animation-timeline: scroll(root block)` + `animation-range: entry 0% exit 100%`. |

### Planned

_Nothing planned for Effects._ Both previously-planned items (view-transition integration + scroll-driven animations) shipped above.

### Skipped

| Feature | Reason |
|---|---|
| **`mask-image` / `mask-*` suite** | Lives in **Fill → Advanced** now — masks are a fill-shaped concept, not an effect. Cross-referenced. |
| **CSS Paint API filters (`paint(...)`)** | Houdini-driven custom paint. Niche / spotty support. |
| **`will-change`** | Performance hint, not visual. Lives in **Appearance → Advanced** instead. |

### Figma vs CSS divergence

| Figma concept | CSS equivalent |
|---|---|
| Drop shadow | `box-shadow` (without `inset`). |
| Inner shadow | `box-shadow: inset …`. |
| Layer blur | `filter: blur(N)`. |
| Background blur | `backdrop-filter: blur(N)`. |
| Smart Animate | View Transitions API or framework-level animation. Out of scope. |

---

## 7.4 Layers tab

A DOM tree of the current page, organised for design intent. See `LAYERS.md` for the full reference.

### At parity

Tree mechanics:

| Feature | Notes |
|---|---|
| **DOM tree (every element = one row)** | Walk of `document.body` recorded at panel-open; SPA re-renders refresh on tab switch via `refreshDomTree()`. |
| **Stable element ids** | Each element gets a `data-dm-*` attribute so re-renders preserve identity (selection survives). |
| **Indentation guides** | One vertical line per parent depth. |
| **Expand / collapse** chevron | Per-node, in-memory. |
| **Tag icons** | Per-tag-family icon (text / media / svg / form / list / semantic / box / void). |
| **Click → select** | Updates `info.id`. |
| **Hover → page outline** | Yellow dashed outline over the corresponding element. |
| **Drag-to-reorder** | HTML5 DnD on each row. Drop above / below midpoint = previous / next sibling. Recorded as a `MOVE` change in the Changes tab. |
| **Empty state** | When the tree hasn't been populated yet — "Click the inspector icon to start selecting elements." |

Search + filter:

| Feature | Notes |
|---|---|
| **Search input** | Live filter by custom name / smart name / tag / class / id. Matches auto-expand parents so the hit is visible. |
| **Filter chips** (All / Visible / Hidden / **Modified**) | Composes with search. Each chip has a count badge. **Modified** = at least one tracked change of any kind on the element. |
| **Multi-select toggle** | When on, clicks add to a selection set. Count badge on the toggle button. Edits in Design tab fan out. |

Per-row controls (hover-revealed):

| Control | What |
|---|---|
| **Crosshair** | Scroll the page to bring this layer into view (without selecting). Sends `SP_SCROLL_TO_ELEMENT`. Same icon as the Changes-tab "go to element" button. |
| **Eye / Eye-closed** | Toggle visibility. Three-state under the hood: drops our `display: none` rule if we set it; writes `display: revert` if author CSS was hiding it (cascade falls back to user-agent default); otherwise injects `display: none`. Non-destructive — entry shows in Changes. Uses Lucide `eye-closed` (not `eye-off`) when hidden so the row reads at a glance. |

Per-row badges:

| Badge | When |
|---|---|
| **Multi-select badge** (`checkSquare`) | This layer is in the multi-select set and isn't the focused row. |
| **Change-indicator dot** | This layer has at least one tracked change. |

Bulk-action toolbar (multi-select with 2+ layers): Show / Hide / Duplicate / Delete / Clear-selection.

Tree-extension badges (rendered next to / inline with the row):

| Badge | Source | Notes |
|---|---|---|
| **Component name** | `getComponentHierarchy(el)[0].name` from React fiber. | Replaces the smart name in the row when present. The original `<tag>` shows as a smaller faded subtitle so DOM identity isn't lost. |
| **Color swatch** | `backgroundColor` (from computed style, when not transparent). | 10×10 swatch beside the tag icon. Tooltip shows the colour value. |
| **z-index chip** | `zIndex` (when not `auto` or `0`). | Mono-font `z:N` chip on the right of the name. |
| **Container badge** (`shadow` / `iframe` / `pseudo`) | Walks open shadow roots, same-origin iframes, and `::before` / `::after` pseudo-elements with non-default `content`. | Coloured pill (purple / amber / teal) so the user sees these are virtual / cross-tree nodes. Pseudo-elements use a special `::before` / `::after` tag name; shadow roots show as `#shadow-root`. |

Persistence: none. The Layers tab intentionally carries no panel-only state across reloads — it mirrors the live DOM. Filter chip, search query, and collapse state are all in-memory; a fresh page load starts clean.

Scroll-into-view: wired through `SP_SCROLL_TO_ELEMENT` → `SCROLL_TO_ELEMENT` content message → `el.scrollIntoView({ behavior: 'smooth', block: 'center' })`. The handler strips any `::pseudo` / `::shadow` suffix from the elementId so virtual nodes target their host.

### Planned

_Nothing planned for Layers._ All previously-planned items shipped above.

### Skipped

| Feature | Reason |
|---|---|
| **Lock / pin layer** | The lock state lived only in the panel — the page didn't enforce it, so it was a UX-only filter on selection. The same outcome ("don't accidentally select this") is one click away on the canvas. Removed in favour of fewer parallel state graphs. |
| **Rename layer** | The page already names every node via tag / id / class / component. A panel-only renaming map drifts the moment a class changes or a component is renamed in source. Names always reflect the live DOM now. |
| **Boolean operations** (Union / Subtract / Intersect / Exclude) | Vector-only; doesn't apply to the DOM. Belongs in vector editors, not a CSS panel. |
| **Group selected → wrap in `<div>`** | DOM-mutating ergonomic shortcut. The user can already write a wrapper via the agent flow; doing it visually opens up a class of layout-correctness footguns we'd rather not own. |
| **Sort children alphabetically / by tag** | Re-orders the DOM, which means writing `MOVE` changes for every sibling. Niche enough to skip. |
| **Right-click context menu** | We deliberately don't override the browser context menu — keeping Inspect / Copy / Paste accessible matters more than custom actions, and the action row already covers the parity-bearing operations. |
| **Closed shadow DOM** | Closed shadow roots are opaque by spec. No work-around. |
| **Cross-origin iframes** | Same — opaque by spec. |

---

## 7.45 Comments

Sticky-note comments anchored to specific elements. Each comment lives both as a yellow tear-drop **pin** on the page and a row in the Changes tab. See `CHANGES.md` and `FEATURES.md` §1.6 for the user-facing reference.

### At parity

Page-side pin:

| Feature | Notes |
|---|---|
| **Yellow tear-drop overlay** | 28×28 pin pinned to the top-right of the host element. |
| **Pin numbering** (`1`, `2`, …) | Sorted by creation timestamp. Number painted inside the pin replaces the `💬` emoji. |
| **Status colour** | Open = yellow (`#FBBF24`). Resolved = grey (`#A3A3A3`) + 60% opacity. Tooltip prefixes `✓` for resolved. |
| **Drag-to-reposition** | Pointer-events drag. Persists `pinOffset:{x,y}` per comment. Click-without-drag still opens the panel card. |
| **Reposition on scroll / resize** | Pinned-coords recompute on every scroll + resize event. |
| **Hide-all toggle** | `eye` / `eye-off` button in the action row hides every pin on the page (preference persisted). The Changes-tab list still works. |

Panel-side row:

| Feature | Notes |
|---|---|
| **Pin number badge** (`#N`) | Mirrors the page pin number. Yellow when open, grey when resolved. |
| **Body** with strikethrough on resolve | Resolved comments kept, not deleted. |
| **Resolve / Reopen** button | Green when open, neutral when resolved. Toggles `resolved?: boolean`. |
| **Edit** button | Opens the comment-edit card pre-filled. |
| **Delete** button | Opens an inline confirmation overlay. **Esc** dismisses. |
| **Time-ago + edited indicator** | `5m ago` chip; appends `· edited 1m ago` when `updatedAt > timestamp + 1s`. |
| **Compact + expanded states** | Compact lists in the Changes tab; expanded "viewing" state has larger actions and the timestamp in the header. |
| **Per-row checkbox** | Comments participate in the bulk-revert toolbar like every other change kind. |
| **Layer-row count badge** | Layers tab shows `💬 N` on rows whose elements have at least one comment. |

### Planned

_Nothing planned for Comments._ Markdown body, Open/Resolved sub-filter, and hover-preview pin all shipped above. Reply threads moved to Skipped below as a deliberate non-goal.

### Skipped

| Feature | Reason |
|---|---|
| **Reply threads** | Multiple replies per comment is a collaboration concept that doesn't fit a solo workflow. Reconsider only if Design Mode grows multi-user editing. |
| **Mentions / @user** | Single-user extension; no concept of "another user" to mention. |
| **Reactions / read state / notifications** | Same — collaboration features don't apply to a solo workflow. |
| **Comment export as JSON** | Comments already ship in the Copy Prompt payload. |

---

## 7.5 Changes tab

The session log of every edit, grouped by element. See `CHANGES.md` for the full reference.

### At parity

Top-row controls (sticky-pinned above the list):

| Control | What |
|---|---|
| **Changes toggle** | Single button (eye icon + "Changes" label). Active when your edits are visible (default); flips to muted `eye-off` while previewing the original. Banner appears in the Changes tab; Copy Prompt + Send to Agent disable while previewing. |
| **Clear all** | Inline overlay confirms before wiping every tracked style / text / DOM / comment change. The overlay's *Clear all* button is danger-coloured; *Cancel* dismisses. |
| **Export / Import** | File-IO cluster on the right. Export saves every change as JSON; Import replaces every change with an imported JSON. |
| **Expand all / Collapse all** | Lives in the search row. One-click toggle for every group's open / closed state. Label flips based on what's currently open. |

Filter row:

| Control | What |
|---|---|
| **Search** | Live, case-insensitive, matches selector / property / old + new value / DOM action / tag name / comment text. `×` button clears the box. |
| **Filter chips** | All / Styles / Text / DOM / Comments. Each chip shows a count badge. Empty result swaps the list for a "No matches" notice + Clear-filter link. |
| **Sort dropdown** | Oldest first (default) / Newest first / By element. By-element keeps each group's items together while preserving relative age across groups. |
| **Multi-select + bulk revert** | Per-row checkbox column. When 2+ rows are checked, a toolbar appears with **Revert selected** (drives every selected change-id through the per-change revert path) and **Clear** (deselect all). |
| **Keyboard escape** | Esc dismisses the Clear All confirmation overlay. |
| **Char-level diff for text changes** | When the old + new strings together exceed ~30 chars, a Myers-LCS diff renders inline (red strikethrough deletions, green insertions) instead of the 20-char truncation. |

Per-group header:

| Control | What |
|---|---|
| **Chevron** | Collapse / expand. State in-memory. |
| **Selector** | The element's CSS selector. Truncates; full selector in tooltip. |
| **Stale badge** | Renders when the tracker has no stable element id (framework re-render or removal). Group fades to 70% opacity. |
| **Count badge** | Number of changes in the group. |
| **Crosshair (`crosshair`)** | Selects the group's element on the page. |
| **Copy group (`clipboard`)** | Emits a Copy-Prompt payload scoped to just this element's changes. Toast confirms. |
| **Revert all (`trash`, danger)** | Reverts every change in this group via the normal per-change tracker path (preserves undo / overlay). |

Per-row controls:

| Kind | Controls |
|---|---|
| **Style change** | `sliders` icon · `prop: oldValue → newValue` line (truncated to 20 chars per side) · click body selects the element · **Batch apply** (`zap`) with `×N` count badge — applies to all matching elements; toggle re-applies / clears the flag · **Revert** (`trash`). |
| **Text change** | `type` icon · `text: old → new` (truncated) · Revert. |
| **DOM change** | Per-action icon + colour (delete / duplicate / move / insert / text) · `ACTION <tagName>` line · Revert. |
| **Comment** | Compact card (yellow `messageSquare` icon, body text, Edit + Delete) · expanded "viewing" card (purple-tinted background, `×` to close, full body, larger Edit + Delete actions). |
| **Time-ago tooltip** | All rows carry a hover tooltip with relative time (`just now` / `42s ago` / etc.). |

Sticky bottom (panel-wide):

| Button | What |
|---|---|
| **Copy Prompt** | Builds a markdown prompt summarising every tracked change including file:line / framework hints from source detection. Disabled when View Original is on. |
| **Send to Agent** | Stages a handoff marker over the MCP transport; the agent's next `get_changes` sees it as the "ready to implement" signal. When MCP is offline or no agent is connected, the click opens setup instructions instead of sending. |

### Planned

_Nothing planned for Changes tab._ The active DOM check for the stale badge shipped — group rows are now stale when their `elementId` is missing **or** isn't found in the live `domTree` snapshot.

### Skipped

| Feature | Reason |
|---|---|
| **Confirm dialog for individual revert** | Single-click revert is already cheap and the change can be re-made; an extra click would just slow everyone down. |
| **Pin / star changes** | Not enough demand to warrant the extra column / state. |
| **Change export as JSON** | The Copy Prompt payload (markdown) is the supported export shape; raw JSON would be a separate audience we don't yet serve. |

---

## 8. Cross-cutting

### At parity

| Concern | What we have |
|---|---|
| **Live overlay sync** | Select-box overlay and W×H label update on every CSS write via `requestAnimationFrame`. |
| **Layer-type gating** | Sections shown per element kind. |
| **Section reset** | Per-section reset icon clears tracked changes scoped to that section's prop list. |
| **Section anchor / deep link** | Clicking a style change in the Changes tab switches to Design, expands the relevant section, and scrolls its header into view. Property → section lookup uses `SECTION_PROPS`. |
| **Per-section expanded preference** | `sectionStates` persists to `chrome.storage.session` per browser session, so the panel opens at the same shape the user last left it. |
| **Tooltips** | `title` attribute on every icon button. |
| **12-column grid** | `grid12` helper for section content layout. |
| **Color picker drag** | `pointerdown` on the SV gradient and hue strip activates `colorDrag`; `pointermove` updates color live. |
| **Color format cycle** | HEX → RGB → HSL via `chevrons-up-down` button. |
| **HSL sub-inputs** | When the format is HSL, the panel swaps R / G / B numeric inputs for H / S / L (with the matching `hsl()` write back). |
| **Site-tokens dropdown on hex input** | Focusing any colour input's hex field opens a tokens-only dropdown beneath. The full HSV+tokens panel still opens when the swatch is clicked. |
| **Stroke color panel detached** | Clicking the swatch toggles a panel BELOW the entire stroke row. |
| **Drag-to-reorder for layered lists** | HTML5 DnD on every layered list (Fill / Stroke / Effects / Layers tab rows). |
| **Non-destructive eye for layered lists** | Per-element in-memory hidden map (Fill, Stroke, Effects). The hidden layer's raw CSS is stashed and restored at its original chain index on toggle-back. |
| **Source detection background** | React-fiber lookup runs invisibly to enrich Copy Prompt with file:line hints. The Layers tab also uses it for the optional component badge. |

### Planned

_Nothing planned cross-cutting._ Section deep-link, persisted section state, HSL sub-inputs, tokens-on-focus dropdown, drag-to-reorder, non-destructive eye — all shipped.

### Skipped

| Concern | Reason |
|---|---|
| **Swatch-below-the-row pattern for ALL color pickers** | We landed on a different consistency story: every colour input shares the inline panel + tokens-on-focus dropdown. The detached pattern is kept for Stroke only because the row is too narrow to host the panel inline. |
| **Component / variant detection in any framework** | Framework lock-in misrepresents who we serve. Source detection still feeds Copy Prompt invisibly + powers the Layers component badge. |
| **Direct prop / className editing on the source file** | Out of scope; we ship a Copy Prompt + MCP bridge for that flow. |
| **Tailwind class authoring** | Out of scope of the Design tab — Tailwind is an implementation choice; we surface the resulting CSS. |

---

## 9. Web platform features explicitly out of scope

These exist in CSS but don't fit a visual design tab. Listed for completeness.

| Feature | Why out of scope |
|---|---|
| **Anchor positioning** (`anchor-name`, `position-anchor`, `position-area`) | Behavioural — defines how popovers and tooltips attach. |
| **View Transitions API** (`view-transition-name`, `::view-transition-*`) | Behavioural / animation primitive across navigation. |
| **Container Queries** (`@container`, `container-type`, `container-name`) | Authoring construct, not a per-element visual. |
| **Cascade Layers** (`@layer`) | Specificity / authoring concern. |
| **Houdini Paint / Layout / Animation Worklets** | Programmatic CSS. Niche. |
| **Print styles** (`@media print`, `page-break-*`) | Print-specific. |
| **Responsive design queries** (`@media`, `@supports`) | Authoring construct. We expose what's currently computed for the selected element. |
| **CSS custom property authoring** | The Site Tokens panel covers consumption. Authoring belongs in a dedicated Tokens panel. |
| **`@scope`** | Authoring scoping. Not visual. |
| **`@property`** | Custom-property type registration. Authoring. |

---

## 10. Recommended next-pass priority

If we attack the Planned bucket, here's the ROI-ordered list:

1. **Per-side colors and styles in Stroke** (cheap, high CSS-coverage gain).
2. **Drag-to-reorder + non-destructive eye for Fill / Effects** (existing layered lists become fully usable; aligns with Figma).
3. **Border-image suite** (biggest CSS gap; unlocks gradient strokes and pixel-precise dash patterns).
4. **Multi-stroke / chained strokes** (Figma parity for stacked strokes).
5. **Typography text-decoration cluster** (`text-decoration-style/color/thickness`, `text-underline-offset`) — small but visible CSS coverage gain.
6. **Truncate preset** (`text-overflow: ellipsis` + `white-space: nowrap` + `overflow: hidden` as one click).
7. **Swatch-below-the-row pattern for all color pickers** (consistency).
8. **Site-tokens dropdown attached to hex input** (per user spec).
9. **HSL sub-inputs in color panel when in HSL mode** (consistency with format cycle).
10. **Appearance: `isolation: isolate`, `accent-color`, `caret-color`** — small but useful for full Appearance coverage.

Items 11+ — full text-overflow / wrap suite, `transform-origin` *as a visual rotation pivot indicator on the overlay* (currently text-only), `align-content` direct exposure outside Advanced, etc. — are individually small but collectively worth a whole pass.
