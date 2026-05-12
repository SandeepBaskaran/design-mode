# Design Panel — Reference

User-facing reference for every property surfaced in Design Mode's Design tab. For each property: what it does, when to use it, accepted values, value range, example values, and the closest Figma equivalent.

For implementation status (At parity / Planned / Skipped) and CSS-spec coverage tracking, see **PARITY.md**. This document is for **understanding what each control does**.

Last updated: 2026-05-12 (release 1.0.2).

---

## Section visibility — which sections appear for which layer kind

The **Indicator row** is always rendered at the top of the Design tab (regardless of layer kind). Below it, the Icon section and Media section render conditionally based on detected element type. The remaining sections are gated by `LayerKind`.

| Layer kind | Always shown | Conditional | Property sections |
|---|---|---|---|
| `text` (h1–h6, p, span, a, button, label, …) | Indicator | Icon (when an `<i>` is a detected FontAwesome icon) | Position, Layout, Appearance, **Typography**, Fill, Stroke, Effects, Motion, Layout guide |
| `container` (div, section, main, ul, ol, nav, header, footer, article) | Indicator | — | Position, Layout, Appearance, Fill, Stroke, Effects, Motion, Layout guide |
| `media` (img, picture, video, canvas, iframe, audio) | Indicator | **Media** | Position, Appearance, Fill, Stroke, Effects, Motion |
| `svg` (svg, path, circle, rect, …) | Indicator | **Media**, Icon (when a detected Lucide / FontAwesome SVG) | Position, Appearance, Fill, Stroke, Effects, Motion |
| `form` (input, textarea, select, button[type]) | Indicator | — | Position, Appearance, Typography, Fill, Stroke, Effects, Motion |
| `void` (br, hr, meta) | Indicator | — | Position, Appearance |
| `page` (html, body) | Indicator | — | Layout, Appearance, Fill, Layout guide |

**Conditional sections** (Icon, Media) appear above Position when their detection conditions are met. Their visibility is independent of the property-section gating — e.g. a `<svg>` layer can have *both* Icon (if class = `lucide-*`) and Media (because it's an SVG element) at the same time.

---

# Indicator row

Always rendered at the very top of the Design tab. Tells you what's currently selected and gives a one-click jump to the live computed CSS for that layer.

| Element | What | When |
|---|---|---|
| **State chip** | A pill showing one of three states: `Selected` (blue, with `crosshair` icon — a real layer is focused), `Hovering` (yellow, with `eye` icon — you're hovering over a layer in the page or Layers tab without committing), or `Page` (blue, with `panel-right` icon — no specific layer is selected, so the Design tab is editing the `<body>` as the implicit context). | Always. |
| **Tag** | The element's tag name (`<div>`, `<button>`, `<svg>`, etc.) in monospace. | Always. |
| **Multi-select badge** | A blue chip — `N selected` — appears when multi-select is active and the count is ≥ 1. Tooltip explains that style edits will fan out to every selected layer. | When `multiSelectActive && multiSelectIds.length > 0`. |
| **CSS button** (`code` icon) | Opens an overlay showing the computed CSS for the selected layer — every CSS property that's not a browser default — formatted as a CSS selector + declaration block, ready to copy. | Always rendered; disabled (greyed out) when nothing is selected. |

Example layouts:

```
[ Selected ]  <button>                                  [ CSS ]
[ Hovering ]  <div>                                     [ CSS ]
[ Selected ]  <button>     [ 5 selected ]               [ CSS ]
[ Page ]      <body>                                    [ CSS ]
```

The state chip switches automatically: clicking a layer in the page or the Layers tab → `Selected`. Mousing over a layer without committing → `Hovering`. Initial empty state with nothing committed → `Page`.

**Figma equivalent**: Figma's right-panel header (selection name, layer-type icon, Inspect tab toggle) approximates.

---

# Icon

Conditional — appears when **icon detection** finds that the selected element looks like an icon from a known library. The detector recognises:

- `<svg class="lucide lucide-*">` (Lucide, the most common React/Vue icon library).
- `<svg data-icon="...">` (FontAwesome SVG mode).
- `<i class="fa fa-...">` (FontAwesome webfont mode).

When detected, the section shows:

| Element | What | Behavior |
|---|---|---|
| **Library** | The detected library name in accent color: `lucide`, `fontawesome`, etc. | Read-only label. |
| **Icon** | Either:<br/>• A select dropdown with **all icons of the same library on the page** (when 2+ are present — lets you swap to a different one in one click).<br/>• A read-only label with the icon's name (when only one is detected). | Selecting from the dropdown rewrites the element's class to switch icons. |

**Examples**:
- Lucide button uses `<svg class="lucide lucide-search">` → detected. The page also has a `lucide-x` icon. The dropdown lists `search` and `x`. You can swap.
- FontAwesome `<i class="fa fa-heart">` → detected. The page only has the heart. Read-only label shows `heart`.

**When to use**: replacing a single icon in the design without leaving the panel. Especially useful for Lucide where the icon set is large and consistent — the dropdown gives a flat list of every Lucide icon already loaded on the page.

**Figma equivalent**: Figma's components panel + variant swap. Conceptually similar to "swap the selected component with another from the same library."

---

# Media

Conditional — appears for `media` and `svg` layer kinds (specifically: `img`, `picture`, `video`, `canvas`, `iframe`, `audio`, and any SVG root). It's where you grab the asset, see its preview, and tweak the image-rendering controls.

The section's contents adapt to the media kind detected at runtime (`mediaInfo.kind`):

## When the layer is an image (`<img>`, or `<picture>` with detected `<img>`)

| Element | What | Behavior |
|---|---|---|
| **Preview** | Renders the image inline (max 140px tall) so you can confirm what you're looking at. | Visual only. |
| **Meta line** | `naturalWidth × naturalHeight px · image` — the source's natural dimensions and the kind label. | Read-only. |
| **Download `<filename>`** | Button (`download` icon). Clicking saves the file via `chrome.downloads`. The filename comes from the source URL (or `image.png` as a fallback). Object-URL resources (e.g. blob: URLs) are also supported. | Always enabled when the source loaded. |
| **Src** | Text input bound to `src` (the `src` attribute, not a CSS property). Edit to swap the image source live. | Always editable. |
| **Fit** (select) | Bound to `object-fit`. Values: `fill` (default — stretch), `contain` (fit inside, letterbox), `cover` (fill, may crop), `none` (natural size, may overflow), `scale-down` (smaller of `none` / `contain`). | Always editable. |
| **Alt** | Text input bound to the `alt` attribute. Critical for accessibility — the screen-reader description of the image. | Always editable. |

## When the layer is a video (`<video>`)

| Element | What | Behavior |
|---|---|---|
| **Preview** | Renders an inline `<video>` player (max 140px tall) with native browser controls. If the element has a `poster` attribute, the poster image is shown until play. | Click play to preview. |
| **Meta line** | `naturalWidth × naturalHeight px · video` (when intrinsic dimensions are available). | Read-only. |
| **Download `<filename>`** | Saves the video file. | Always enabled. |

## When the layer is audio (`<audio>`)

| Element | What | Behavior |
|---|---|---|
| **Preview** | Inline `<audio>` element with native browser controls. | Click play to preview. |
| **Meta line** | `audio` kind label. | Read-only. |
| **Download `<filename>`** | Saves the audio file. | — |

## When the layer is an SVG (`<svg>` root)

| Element | What | Behavior |
|---|---|---|
| **Preview** | Renders the SVG inline (max 120px tall) — the actual rendered SVG, not a screenshot. | Visual only. |
| **Meta line** | `svg` kind label. | Read-only. |
| **Download `<filename>`** | Saves the SVG markup as a `.svg` file. | — |
| **Copy SVG markup** (`copy` icon) | One-click copies the full `<svg>...</svg>` source to the clipboard. Useful for grabbing icons / illustrations to paste into other code or Figma. | — |

## When the layer's background is the media (legacy / async detection)

If `mediaInfo` hasn't loaded yet but the layer is an `<img>` with an `imgSrc` known from the inspector, the section renders a fallback view with the preview, src, fit, and alt inputs — same as the image case above. Once `mediaInfo` loads, the section re-renders with the full controls.

## Layer-kind specifics

| Layer kind | Section appears? | Notes |
|---|---|---|
| `media` (img, picture, video, audio, canvas, iframe) | Yes — once `mediaInfo` loads. | The download button + preview are the most common workflow. |
| `svg` (svg, path, circle, rect, polygon, …) | Yes for `<svg>` root. Sub-elements (`path`, `circle`, etc.) inherit the parent's section. | Copy SVG markup is the SVG-only addition. |
| Other kinds (`text`, `container`, `form`, `void`, `page`) | **Hidden.** | Even if the element has a CSS `background-image`, that's a Fill, not a media layer. The Media section is reserved for actual media tags. |

**Figma equivalent**: Figma's "Export" panel covers the download workflow. Figma also has an Image fill type for raster media — separate from CSS's `<img>` element. The "Copy SVG markup" button is closest to Figma's "Copy as SVG" right-click action on a vector layer.

---

# Position

Places a layer **inside its parent / on the page**, plus rotation, mirror, anchor relationships, and 3D depth.

The whole section is gated by the `position` dropdown — if you set `position: static`, all the offset-based fields (X/Y/Z, Right/Bottom, Logical anchors, anchor-positioning extras) are hidden because they have no effect.

## Main row

### `position` (dropdown)

| Value | What | When to use | Figma equivalent |
|---|---|---|---|
| `static` (default) | Layer sits in normal document flow. X/Y/Z and offsets are inert. | Most layers. The default. | "In layout" — the standard frame mode. |
| `relative` | In flow, but offsetable from where it would naturally sit. Creates a positioning context for absolute children. | Small visual nudges; declaring "this is the anchor for my absolute children." | No direct equivalent — Figma doesn't expose this CSS-specific concept. |
| `absolute` | Removed from flow, positioned relative to the nearest positioned ancestor (or the viewport if none). | Popovers, badges, tooltips, modal overlays, free-form positioned elements. | Frame with **Absolute position** turned on (under Auto Layout). |
| `fixed` | Removed from flow, positioned relative to the **viewport**. Doesn't move on scroll. | Sticky toolbars, navbar, modal backdrops. | No direct equivalent — Figma prototypes use "Fixed position when scrolling." |
| `sticky` | Hybrid: relative until you scroll past a threshold, then fixed-like at that edge. | Section headers in long lists, sticky table column headers. | Figma prototype's "Fix position when scrolling" approximates. |

### Object alignment grid (6 buttons)

Three horizontal alignment + three vertical alignment buttons.

| Cell | What | Dispatch logic |
|---|---|---|
| Align left / center / right | Horizontal alignment | If parent is **block flow** → `margin-left` / `margin-right: auto`. If parent is **flex / grid** → `justify-self`. If position is **absolute / fixed** → `left` / `right` + `translate(-50%, 0)`. |
| Align top / middle / bottom | Vertical alignment | If parent is **flex / grid** → `align-self`. If position is **absolute / fixed** → `top` / `bottom` + `translate(0, -50%)`. Block flow doesn't natively vertical-center children, so the buttons are inert there. |

**Figma equivalent**: the alignment row in Position panel.

### Distribute (2 buttons, multi-select only)

Appears only when 2+ siblings are selected. Writes `justify-content: space-between` (horizontal) or `align-content: space-between` (vertical) on the **common parent** so all selected siblings space evenly.

**Figma equivalent**: "Tidy up" → distribute horizontally / vertically.

### X (`left`) / Y (`top`) / Z (`z-index`) / Z-order ↑↓

Hidden when `position: static`.

| Field | Property | What | Range / values |
|---|---|---|---|
| **X** | `left` | Distance from the parent's left edge. | Any CSS length: `0`, `10px`, `2rem`, `25%`, `auto`. Negative pulls left. |
| **Y** | `top` | Distance from the parent's top edge. | Same set. |
| **Z** | `z-index` | Stacking order inside the same positioning context. Higher = in front. | Integer or `auto`. Practical: `-1` to `9999`. |
| **Z↑** | `z-index += 1` | Bring this layer one step forward. | — |
| **Z↓** | `z-index -= 1` | Send this layer one step backward. | — |

**Figma equivalent**: X / Y inputs and the layer-order arrows (Bring forward / Send backward).

### Rotation + 90° quick rotate + Flip H / V

| Field | Property | What | Range / values |
|---|---|---|---|
| **Rotation** (deg) | `rotate` longhand | Rotates around `transform-origin` (default: center). | Any angle. `45deg`, `-90deg`, `0.5turn`. Negative spins counter-clockwise. |
| **CCW (90°)** | `rotate -= 90deg` | Rotate 90° counter-clockwise (snapped). | — |
| **CW (90°)** | `rotate += 90deg` | Rotate 90° clockwise (snapped). | — |
| **Flip H** | toggles sign of `scale` X axis | Mirrors horizontally. | Toggle. |
| **Flip V** | toggles sign of `scale` Y axis | Mirrors vertically. | Toggle. |

**Figma equivalent**: Rotation field, 90° rotate icons, Flip H / Flip V.

## Advanced disclosure

Click `layout-panel-left` in the Position section header to expand.

### Pivot (transform-origin)

The pivot point that `rotate` and `scale` orbit around.

**9-cell pad**: 9 keyword pairs corresponding to the 9 anchor points on a box.

| Cells | Writes |
|---|---|
| Top-left, Top-center, Top-right | `top left` / `top center` / `top right` |
| Center-left, Center, Center-right | `center left` / `center center` / `center right` |
| Bottom-left, Bottom-center, Bottom-right | `bottom left` / `bottom center` / `bottom right` |

**Raw input**: free-form CSS value. Examples:
- `25% 75%` — quarter from left, three-quarters down
- `100px 50px` — pixel offsets from top-left corner
- `top 30%` — top edge horizontally, 30% from left vertically

**Default**: `50% 50%` (center).

**Figma equivalent**: no exact analog. Figma rotates around center always.

### Skew X / Skew Y (deg)

Slants the layer along the named axis.

| Field | What | Range |
|---|---|---|
| **Skew X** (deg) | Horizontal slant. | -89° to 89°. Practical: -45° to 45°. At ±90° the element collapses to a line. |
| **Skew Y** (deg) | Vertical slant. | Same range. |

Composed surgically into the `transform` shorthand — your existing `rotate` / `translate` / `scale` longhands stay intact.

**Figma equivalent**: no first-class control. Approximate with custom skew via raw transform.

### Anchor (right / bottom edges)

Hidden when `position: static`.

| Field | Property | What |
|---|---|---|
| **Right** | `right` | Distance from the parent's right edge. Setting both `left` and `right` stretches the box horizontally. |
| **Bottom** | `bottom` | Distance from the parent's bottom edge. Setting both `top` and `bottom` stretches the box vertically. |

**Figma equivalent**: setting both X and "constrain right" approximates this.

### 3D

CSS 3D transform primitives.

| Field | Property | What | Values |
|---|---|---|---|
| **Perspective** | `perspective` | Distance of the viewer's "eye" from this element's children's plane. Smaller = stronger 3D foreshortening. Affects children, not this element. | Length (`1000px`) or `none`. `400px` (strong), `1000px` (moderate), `2500px+` (subtle). |
| **Persp. origin** | `perspective-origin` | Where the viewer's eye is, relative to this element. | Length / percentage pair (`50% 50%`) or keyword pair (`top right`). Default `50% 50%`. |
| **Transform style** | `transform-style` | Whether 3D-transformed children render in 3D. | `flat` (default — children flatten to 2D) or `preserve-3d` (children compound their 3D transforms). |
| **Backface visibility** | `backface-visibility` | Whether the back of the element shows when rotated past 90°. | `visible` (default) or `hidden` (for card-flip effects). |
| **Transform reference box** | `transform-box` | Which box `transform-origin` and `transform` are computed against. | `view-box` (SVG default), `fill-box` (SVG path bounding box), `stroke-box` (path + stroke), `border-box` (HTML border), `content-box` (HTML content). |

**Figma equivalent**: none. Figma is 2D-only.

### Logical anchors (i18n)

Hidden when `position: static`.

Logical aliases for the four physical edges. They auto-flip with `writing-mode` / `direction`.

| Field | Property | Maps to physical |
|---|---|---|
| **Block start** | `inset-block-start` | `top` (in horizontal-tb) / `right` (in vertical-rl) / `left` (in vertical-lr) |
| **Block end** | `inset-block-end` | `bottom` / `left` / `right` (mirroring above) |
| **Inline start** | `inset-inline-start` | `left` (in ltr) / `right` (in rtl) |
| **Inline end** | `inset-inline-end` | `right` (in ltr) / `left` (in rtl) |

**When to use**: authoring CSS for codebases that target multiple writing systems / directions. Keeps "from the start of the inline axis" semantically correct without hard-coding "left."

**Figma equivalent**: none — Figma doesn't surface CSS authoring for i18n.

### Anchor positioning

| Field | Property | What | Values |
|---|---|---|---|
| **Anchor name** | `anchor-name` | Names this element as an anchor that other elements can attach to. | An identifier starting with `--` (e.g., `--menu-button`) or `none`. |
| **Position anchor** (disabled when static) | `position-anchor` | On a positioned element, names which anchor to attach to. | Identifier matching some element's `anchor-name`, or `auto`. |
| **Position area** (disabled when static) | `position-area` | Region around the anchor for placement. | 1-2 keywords from: `top`, `bottom`, `left`, `right`, `center`, `start`, `end`, plus `span-*` and logical equivalents (`block-start`, `inline-end`). E.g., `top right`, `bottom span-all`. |
| **Try order** (hidden when static) | `position-try-order` | Strategy when the primary `position-area` doesn't fit. | `normal` (first that fits), `most-width`, `most-height`, `most-block-size`, `most-inline-size`. |
| **Visibility** (hidden when static) | `position-visibility` | What the popover does when its anchor is off-screen. | `always`, `anchors-visible` (hide when anchor isn't visible), `no-overflow` (hide when this would overflow). |
| **Try fallbacks** (hidden when static) | `position-try-fallbacks` | List of fallback positions. Browser tries each with the `try-order` strategy. | Comma-separated list — `top, bottom, left, right` — or named `@position-try` rules. |

**When to use**: building tooltips, dropdown menus, popovers without JavaScript. The browser handles anchor-following automatically.

**Figma equivalent**: prototype "attach overlay to" interaction approximates.

### View transition name

| Field | Property | What | Values |
|---|---|---|---|
| **View transition name** | `view-transition-name` | Tags this element so the browser's View Transitions API can identify it across DOM updates and morph it smoothly. | An identifier (`hero-cover`, `card-12`) or `none`. |

**When to use**: designing smooth navigation animations between routes / states. Set the same name on the "before" and "after" element; the browser interpolates between them.

**Figma equivalent**: Smart Animate (with shared layer names) is conceptually similar.

### Raw transform

Free-form CSS shorthand for everything `transform` accepts.

| Functions | Effect |
|---|---|
| `translate(x, y)`, `translateX`, `translateY` | Move. Lengths or percentages. |
| `rotate(angle)` | 2D rotate. |
| `scale(x, y)`, `scaleX`, `scaleY` | Resize. Multipliers. |
| `skew(x, y)`, `skewX`, `skewY` | Slant. Angles. |
| `translate3d`, `translateZ` | 3D translate. |
| `rotate3d`, `rotateX`, `rotateY`, `rotateZ` | 3D rotate. |
| `scale3d`, `scaleZ` | 3D scale. |
| `perspective(N)` | Per-element perspective function. |
| `matrix(a,b,c,d,e,f)`, `matrix3d(...)` | Raw 2×3 / 4×4 matrix. |

Order matters — functions apply left-to-right with each operating on the result of the previous.

**Default**: `none`.

### Self alignment override

| Field | Property | What | Values |
|---|---|---|---|
| **Align self** | `align-self` | Cross-axis alignment override for this element when its parent is flex/grid. | `auto` (inherit from parent), `start`, `center`, `end`, `flex-start`, `flex-end`, `stretch`, `baseline`, `first baseline`, `last baseline`, plus `safe` / `unsafe` modifier keywords. |
| **Justify self** | `justify-self` | Main-axis alignment override (mostly grid). | Same value set. |

**When to use**: when most siblings should follow the parent's `align-items` but one needs to be different.

**Figma equivalent**: in Auto Layout, the per-child alignment override.

---

# Layout

How the layer **lays out itself and its children** — sizing, flow direction, gaps, padding, margin, overflow.

**Visibility**: shown for `text`, `container`, `page`. Hidden for `media`, `svg`, `form`, `void` (those are leaf elements with intrinsic sizing rules).

## Main controls

### Layout mode (4-button segmented)

| Mode | Writes | What |
|---|---|---|
| **Free / blocks** | `display: block` | Children stack in normal block flow. The default. |
| **Horizontal stack** | `display: flex; flex-direction: row` | Children laid out left-to-right. |
| **Vertical stack** | `display: flex; flex-direction: column` | Children laid out top-to-bottom. |
| **Grid** | `display: grid` | Children placed into a grid (you define the tracks below in Advanced). |

**Figma equivalent**: Auto Layout direction (None / Horizontal / Vertical) + frame's grid feature.

### W (`width`) / H (`height`) + aspect-ratio + shrink

| Field | Property | What | Values |
|---|---|---|---|
| **W** | `width` | Box width. | Any CSS length / keyword: `auto`, `100%`, `400px`, `min-content`, `max-content`, `fit-content`, `fit-content(200px)`, `stretch`. |
| **H** | `height` | Box height. | Same set. |
| **Aspect ratio** (button) | `aspect-ratio` | Lock W:H ratio. Click to lock to current ratio (turns blue), click again to unlock (`auto`). | When locked: a number (`16 / 9`, `1`, `1.6180`). |
| **Shrink** (button) | `width: max-content; height: max-content` | Resize to fit content (Figma's "Hug contents"). | — |

### Min/Max W and H

| Field | Property | What | Values |
|---|---|---|---|
| **Min W** | `min-width` | Lower bound on width. | Length, %, `auto`. |
| **Max W** | `max-width` | Upper bound on width. | Length, %, `none`. |
| **Min H** | `min-height` | Lower bound. | Same as Min W. |
| **Max H** | `max-height` | Upper bound. | Same as Max W. |

**Figma equivalent**: Min / Max width / height fields.

### Children align (9-cell pad) + Col gap / Row gap

Visible only on flex / grid containers.

| Field | What |
|---|---|
| **9-cell pad** | Picks where children sit on both axes. Writes `justify-content` (column from the cell) + `align-items` (row from the cell). For grid containers, writes `justify-items` instead of `justify-content`. |
| **Col gap** | `column-gap` — horizontal gap between children. Visible on grid + horizontal-stack flex. |
| **Row gap** | `row-gap` — vertical gap. Visible on grid + vertical-stack flex. |

**Figma equivalent**: Alignment 9-cell pad + spacing-between-items.

### Padding + Margin (Chrome DevTools-style nested box)

Visualises the box-model:
- Outer (dashed border) = margin.
- Inner = padding.
- Each side has its own input.

**Figma equivalent**: padding fields in Auto Layout. Figma doesn't expose margin (CSS-only concept).

### Clip content + Clip path

| Field | Property | What | Values |
|---|---|---|---|
| **Clip content** (checkbox) | `overflow: hidden` ↔ `visible` | Whether content overflowing the box is clipped. | On / off. |
| **Clip path** (select with presets) | `clip-path` | Custom clip shape applied to this element. | `none`, `inset(10px)` (rectangular inset), `circle(50%)` (circular), `ellipse(50% 50%)`, `polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)` (diamond), `inset(0 round 12px)` (rounded rect). Free-form values also writable via raw input in code. |

**Figma equivalent**: "Clip content" checkbox in Auto Layout / Frame. Clip-path has no Figma analog (closest: vector mask).

### Overflow X / Y + Box sizing (one row)

| Field | Property | What | Values |
|---|---|---|---|
| **Overflow X** | `overflow-x` | Horizontal-axis overflow. | `visible`, `hidden`, `scroll`, `auto`. |
| **Overflow Y** | `overflow-y` | Vertical-axis overflow. | Same set. |
| **Box sizing** | `box-sizing` | Whether width/height include padding+border. | `content-box` (default) or `border-box` (Figma's mental model — frame size includes its padding). |

## Layout Advanced disclosure

Toggles via the `layout-panel-left` icon in the Layout section header.

### Aspect ratio (raw)

Free-form text input for `aspect-ratio` value, e.g. `16 / 9`, `1.5`, `auto`.

### align-content (when flex container with wrap, or grid)

| Property | What | Values |
|---|---|---|
| `align-content` | Cross-axis distribution of multi-line wrap. | `normal`, `start`, `center`, `end`, `flex-start`, `flex-end`, `space-between`, `space-around`, `space-evenly`, `stretch`, `baseline`. |

### place-items / place-content (container shorthand)

Two text inputs for shorthand setting both `align-*` and `justify-*` simultaneously. Power-user; the longhands in the 9-cell pad cover most cases.

### Flex item subsection (when parent is flex)

| Field | Property | What | Range |
|---|---|---|---|
| **Grow** | `flex-grow` | How much extra space this child claims relative to siblings. | 0+ (default 0). `1` makes it expand, `2` claims twice as much. |
| **Shrink** | `flex-shrink` | How much this child shrinks under pressure. | 0+ (default 1). `0` prevents shrinking. |
| **Basis** | `flex-basis` | Starting size before grow/shrink kicks in. | Length, percentage, `auto`, `content`. |
| **Order** | `order` | Visual reorder without DOM change. | Integer (default 0). Lower = earlier. |
| **Wrap** | `flex-wrap` | Whether children wrap to new lines. | `nowrap`, `wrap`, `wrap-reverse`. |

### Grid container subsection (when display is grid)

| Field | Property | What | Values |
|---|---|---|---|
| **Cols** | `grid-template-columns` | Column track definitions. | `1fr 1fr`, `200px auto`, `repeat(3, 1fr)`, `repeat(auto-fill, minmax(200px, 1fr))`. |
| **Rows** | `grid-template-rows` | Row track definitions. | Same syntax. |
| **Areas** | `grid-template-areas` | Named cells (multi-line). | `"a a b" "c c b"` — each cell named. |
| **Auto cols** | `grid-auto-columns` | Implicit column track size. | Length / keyword. |
| **Auto rows** | `grid-auto-rows` | Implicit row track size. | Same. |
| **Auto flow** | `grid-auto-flow` | How implicit items place themselves. | `row`, `column`, `row dense`, `column dense`. |

### Grid item subsection (when parent is grid)

| Field | Property | What | Values |
|---|---|---|---|
| **Col** | `grid-column` | Column placement. | `1 / 3`, `span 2`, `2 / -1`. |
| **Row** | `grid-row` | Row placement. | Same syntax. |
| **Area** | `grid-area` | Named area placement. | Name from grid-template-areas. |
| **Place self** | `place-self` | Self-alignment shorthand within the grid cell. | `auto`, `start`, `center`, `end`, `stretch`, plus modifier keywords. |

---

# Appearance

How the layer **looks at the surface** — opacity, blend, corner radius, color filters.

## Main controls

### Opacity + Blend + Isolation row

12-col grid: opacity (4) | blend (6) | isolation (2).

| Field | Property | What | Values |
|---|---|---|---|
| **Opacity** | `opacity` | Whole-layer transparency. | `0` (fully transparent) to `1` (fully opaque). |
| **Blend** | `mix-blend-mode` | How this layer blends with what's behind it. | `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`, `plus-lighter`. |
| **Iso** (toggle) | `isolation` | Forces a new stacking context. Use to keep blend modes from bleeding across siblings. | `auto` (default) ↔ `isolate`. |

**Figma equivalent**: Opacity, Blend mode dropdown. (Figma has no `isolation` analogue — it always isolates per-layer.)

### Corner radius

| UI | Property | What | Values |
|---|---|---|---|
| Primary input | `border-radius` (shorthand) | Uniform corner radius for all four corners. | Length / percent: `0`, `8px`, `1rem`, `50%`. To go elliptical, type two values: `12px 24px`. |
| `scan` icon | Toggle expanded mode | Reveals the per-corner 2×2 below. | — |
| 2×2 grid (per corner) | `border-top-left-radius` · `border-top-right-radius` · `border-bottom-left-radius` · `border-bottom-right-radius` | Individual corner radii. Each cell carries the corner glyph + an **X input** and a **Y input** separated by `/`. | Length / percent. When X = Y the corner is circular; when they differ the corner is elliptical. |

How the 2×2 cell works:
- Edit X alone → Y is preserved (value becomes elliptical with the typed X).
- Edit Y alone → X is preserved.
- Set X = Y → output collapses back to a single value (`10px` instead of `10px 10px`).
- Empty input falls back to the current axis value (so blanking Y == circular).

**Figma equivalent**: Corner radius (linked + individual mode). Figma's "Smoothing" / squircle is **skipped** (proprietary `SuperEllipse` math, no CSS equivalent).

### Color adjust filters (icon button row)

Each button **toggles** the named function on `filter`. Re-clicking an active function removes just that function — composes naturally with the rest. Raw `filter` input below for fine control.

| Icon | Property fragment | What | Default when added | Value range |
|---|---|---|---|---|
| `sun` | `brightness(N)` | Multiplies the brightness of every pixel. | `brightness(1.2)` | `0` (fully black) → `1` (unchanged) → `>1` brightens. No upper bound; `2` doubles. |
| `circle-half-full` | `contrast(N)` | Pulls pixels toward / away from middle grey. | `contrast(1.2)` | `0` (full grey) → `1` (unchanged) → `>1` more contrast. |
| `palette` | `saturate(N)` | Multiplies the saturation. | `saturate(1.5)` | `0` (greyscale) → `1` (unchanged) → `>1` more vivid. |
| `rotate-3d` | `hue-rotate(deg)` | Shifts every hue around the colour wheel. | `hue-rotate(45deg)` | Any angle. `360deg` is identity. |
| `circle-off` | `grayscale(%)` | Mixes toward greyscale. | `grayscale(50%)` | `0%` (unchanged) → `100%` (fully grey). |
| `contrast` | `invert(%)` | Inverts each channel. | `invert(50%)` | `0%` (unchanged) → `100%` (full inversion). `50%` lands on middle grey. |
| `flame` | `sepia(%)` | Old-photograph tint. | `sepia(50%)` | `0%` → `100%`. |
| `square-stack` | `drop-shadow(X Y blur color)` | Shadow that follows the element's alpha shape. Unlike `box-shadow` it ignores `overflow: hidden` and respects transparent SVG cutouts. | `drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))` | Standard `<shadow>` syntax: offset-x · offset-y · blur · colour (no spread, no inset). |

`drop-shadow` vs `box-shadow` (Effects section):
- `box-shadow` is rectangular (follows the element's box). Simpler, hardware-accelerated.
- `filter: drop-shadow` follows the rendered alpha — perfect for SVG icons, irregular masks, or `clip-path`'d elements.

**Figma equivalent**: Effects → adjust effects (Figma's set is narrower; `hue-rotate`, `invert`, `sepia`, and per-element `drop-shadow` are CSS-only).

## Advanced disclosure

### Visibility & cursor

| Field | Property | What | Values |
|---|---|---|---|
| **Visible** | `visibility` | Whether the layer renders. | `visible`, `hidden` (still occupies space), `collapse` (table-only). |
| **Cursor** | `cursor` | Mouse pointer when hovering. | `auto`, `default`, `pointer`, `text`, `crosshair`, `move`, `grab`, `grabbing`, `not-allowed`, `wait`, `help`, `zoom-in`, `zoom-out`, `none`, `col-resize`, `row-resize`, `n/s/e/w/ne/nw/se/sw-resize`. |
| **Color scheme** | `color-scheme` | Tells the browser which built-in theme to use for native scrollbars / form controls. | `normal`, `light`, `dark`, `light dark`, `only light`, `only dark`. |
| **Forced colors** | `forced-color-adjust` | How the element responds to forced-colors mode (Windows High Contrast). | `auto`, `none` (opt out — keep author colours), `preserve-parent-color`. |

### Interaction

| Field | Property | What | Values |
|---|---|---|---|
| **Pointer events** | `pointer-events` | Whether the layer receives mouse events. | `auto`, `none` (clicks pass through), `all`. |
| **User select** | `user-select` | Whether text inside is user-selectable. | `auto`, `none`, `text`, `all`, `contain`. |
| **Appearance** | `appearance` | Whether to show the browser-native style for form controls. Mostly used as `none` to reset. | `auto`, `none`, plus the native control keywords (`textfield`, `menulist-button`, `searchfield`, `textarea`, `push-button`, `slider-horizontal`, `checkbox`, `radio`, `square-button`, `menulist`, `listbox`, `meter`, `progress-bar`, `button`, `button-bevel`). |

### Form colours (only on form layers)

Surfaced when the selected layer is a form control (`<input>`, `<textarea>`, `<select>`, `<button>`, etc.).

| Field | Property | What | Values |
|---|---|---|---|
| **Accent** | `accent-color` | Colour of the native control's "active" parts (checkbox tick, radio dot, range thumb, progress bar). | Any CSS colour or `auto`. |
| **Caret** | `caret-color` | Text-input caret colour. | Any CSS colour or `auto`. |

### Backdrop adjust (`backdrop-filter`)

Same icon row as `filter` but writes to `backdrop-filter`. Composes the same way (toggling each function in/out without resetting the rest). Below the row, a raw `backdrop-filter` input for fine control.

The `blur(...)` function is also available here — but for "background blur" / "frosted glass" effects, the Effects section's Background blur control is the dedicated home.

### Clip path

A structured shape editor. Pick a shape from the **Shape** select; the appropriate fields appear below. The **Raw** input alongside reflects the live CSS string — use it for combinations the structured editor doesn't cover (e.g. `inset(10px round 4px)`).

| Top-row field | Property | What | Values |
|---|---|---|---|
| **Shape** | virtual `__clippath_shape` | The shape kind. Picking a value writes a sensible default. | `none`, `inset`, `circle`, `ellipse`, `polygon`, `path`, `url`, `custom` (preserves any value the structured editor can't model). |
| **Raw** | `clip-path` | The full CSS string — always editable. | Any valid `clip-path` expression. |

Per-shape fields:

| Shape | Fields | What | Values |
|---|---|---|---|
| **`none`** | — | No clipping. | — |
| **`inset`** | Top · Right · Bottom · Left | Inset rectangle from each edge. | Length or percentage (per edge). |
| **`circle`** | Radius · Center X · Center Y | Circular cutout. | Radius: length / `closest-side` / `farthest-side`. Center: length / percentage. |
| **`ellipse`** | Rx · Ry · X · Y | Elliptical cutout. | Same as circle, two radii. |
| **`polygon`** | Points (`X% Y%, X% Y%, …`) | Polygon vertices. CSS uses comma-separated `X Y` pairs. | Percentages or lengths per axis. |
| **`path`** | SVG path `d` | Arbitrary SVG path string. | A valid SVG path (e.g. `M 0 0 H 100 V 100 H 0 Z`). |
| **`url`** | Fragment id (`#…`) | Reference an `<svg>` `<clipPath>` element on the page. | The fragment id (the `#` is added automatically). |
| **`custom`** | — | The current value isn't one we model — only the Raw field is exposed. | — |

### Scrollbars

| Field | Property | What | Values |
|---|---|---|---|
| **Width** | `scrollbar-width` | Thickness of native scrollbars. | `auto`, `thin`, `none`. |
| **Color (thumb track)** | `scrollbar-color` | Two-colour pair for the scrollbar's thumb and track. | Two CSS colours separated by space, or `auto`. |
| **Gutter** | `scrollbar-gutter` | Reserve scrollbar space even when not scrolling. | `auto`, `stable`, `stable both-edges`. |

### Performance

These are perf hints — they don't change visual output directly but affect how the browser renders / lays out.

| Field | Property | What | Values |
|---|---|---|---|
| **Contain** | `contain` | Promise the browser this element's layout / paint / style / size is independent of its surroundings. | `none`, `strict`, `content`, `size`, `layout`, `style`, `paint`, plus combinations. |
| **Content vis.** | `content-visibility` | Skip rendering offscreen subtrees. | `visible`, `auto`, `hidden`. |
| **Will change** | `will-change` | Hint to the compositor about what's about to animate. | Property name(s), e.g. `transform`, `opacity`. |

---

# Typography

How **text inside the layer renders**. Inherited by descendants.

**Visibility**: shown for `text` and `form` layers.

## Main controls

| Field | Property | What | Values |
|---|---|---|---|
| **Font family** | `font-family` | Typeface(s). Comma-separated fallback list. | `"Inter", system-ui, sans-serif`. Picker shows fonts actually used on the page + curated fallbacks. |
| **Weight** | `font-weight` | Stroke weight. | Named: `Thin (100)`, `Extra Light (200)`, `Light (300)`, `Regular (400)`, `Medium (500)`, `Semibold (600)`, `Bold (700)`, `Extra Bold (800)`, `Black (900)`. Variable fonts allow any integer. |
| **Size** | `font-size` | Glyph size. | Length: `12px`, `1rem`, `120%`. Typical 10-72px. |
| **Line height** (move-vertical icon) | `line-height` | Vertical spacing between lines. | Unitless multiplier (`1.5`), length (`24px`), or `normal`. Unitless preferred for inherited consistency. |
| **Letter spacing** (move-horizontal icon) | `letter-spacing` | Tracking. | Length: `-0.5px`, `0.05em`, or `normal`. Negative tightens. |
| **Color** | `color` | Text color. | Any CSS color (hex, rgb, hsl, named, var). |


### Style + casing row (8 toggles, 1.5 of 12 columns each)

One row, four style toggles followed immediately by four casing buttons:

| Field | Property | What | Values |
|---|---|---|---|
| **Bold** (toggle) | `font-weight: 700` ↔ `400` | Bold on/off. | — |
| **Italic** (toggle) | `font-style: italic` ↔ `normal` | Italic on/off. | — |
| **Underline** (toggle) | `text-decoration-line` includes `underline` | Underline on/off. | — |
| **Strikethrough** (toggle) | `text-decoration-line` includes `line-through` | Strikethrough on/off. | — |
| **No case** | `text-transform: none` | Reset casing. | — |
| **UPPERCASE** | `text-transform: uppercase` | Uppercase every glyph. | — |
| **lowercase** | `text-transform: lowercase` | Lowercase every glyph. | — |
| **Title Case** | `text-transform: capitalize` | Capitalise the first letter of each word. | — |

### Alignment + list row (4 align + 3 list, split 50/50)

Single row split in half — 4 alignment buttons left, 3 list buttons right:

| Field | Property | What | Values |
|---|---|---|---|
| **Align left** | `text-align: left` | Left-align the line box. | — |
| **Align center** | `text-align: center` | Centre-align. | — |
| **Align right** | `text-align: right` | Right-align. | — |
| **Justify** | `text-align: justify` | Justify both edges. | — |
| **No list** | `list-style-type: none` | Strip list markers. | — |
| **Bulleted** | `list-style-type: disc` | Filled-disc bullets. | — |
| **Numbered** | `list-style-type: decimal` | Decimal numbers. | — |

## Advanced (chevron in section header)

Mirrors the Position / Layout pattern — primary controls stay clean and Figma-style; deeper CSS is one click away. Each row writes its single CSS property unless noted.

### Decoration

| Field | Property | What | Values |
|---|---|---|---|
| **Style** | `text-decoration-style` | Underline / strikethrough line shape. | `solid`, `double`, `dotted`, `dashed`, `wavy`. |
| **Color** | `text-decoration-color` | Decoration colour, independent of `color`. | Any CSS color. Defaults to `currentColor`. |
| **Thickness** | `text-decoration-thickness` | Decoration line weight. | Length (`2px`), `auto`, `from-font`. |
| **U. offset** | `text-underline-offset` | Distance from baseline to underline. | Length, percentage, or `auto`. |
| **U. position** | `text-underline-position` | Where the underline sits relative to the text. | `auto`, `under`, `from-font`, `left`, `right`. |
| **Skip ink** | `text-decoration-skip-ink` | Whether the underline breaks for descenders (g, p, y). | `auto`, `none`, `all`. |

### Wrapping

| Field | Property | What | Values |
|---|---|---|---|
| **White space** | `white-space` | Whitespace and line-break collapsing. | `normal`, `nowrap`, `pre`, `pre-wrap`, `pre-line`, `break-spaces`. |
| **Text wrap** | `text-wrap` | Modern wrapping algorithm. | `wrap`, `nowrap`, `balance` (good for headings), `pretty` (avoids orphans), `stable`. |
| **Word break** | `word-break` | Where breaks may happen inside long words. | `normal`, `break-all`, `keep-all`, `break-word`. |
| **Overflow wrap** | `overflow-wrap` | Whether long words may break to avoid overflow. | `normal`, `break-word`, `anywhere`. |
| **Hyphens** | `hyphens` | Auto-hyphenation. | `none`, `manual`, `auto`. |
| **Justify** | `text-justify` | Algorithm used when `text-align: justify`. | `auto`, `inter-word`, `inter-character`, `none`. |
| **Last line** | `text-align-last` | Alignment of the last line in justified text. | `auto`, `start`, `end`, `left`, `right`, `center`, `justify`. |
| **Line break** | `line-break` | How line-breaking opportunities are determined (especially with CJK). | `auto`, `loose`, `normal`, `strict`, `anywhere`. |

### Layout in text

| Field | Property | What | Values |
|---|---|---|---|
| **Indent** | `text-indent` | First-line indent. | Length, percentage. |
| **Tab size** | `tab-size` | Width of a tab character. | Integer (number of chars) or length. |
| **Word space** | `word-spacing` | Extra space between words on top of the natural inter-word advance. | Length, `normal`. |
| **Vertical align** | `vertical-align` | Inline / inline-block vertical alignment in the line box. | `baseline`, `top`, `middle`, `bottom`, `sub`, `super`, `text-top`, `text-bottom`. |
| **Line clamp** | `-webkit-line-clamp` (+ `display: -webkit-box`, `-webkit-box-orient: vertical`, `overflow: hidden`) | Multi-line ellipsis at N lines. Writes the full four-property pattern in one shot. | Integer N. `0` clears the clamp. |
| **Truncate** (button) | `text-overflow: ellipsis` + `white-space: nowrap` + `overflow: hidden` | One-click single-line ellipsis preset. | — |

### Direction (i18n)

| Field | Property | What | Values |
|---|---|---|---|
| **Direction** | `direction` | Reading direction. | `ltr`, `rtl`. |
| **Writing mode** | `writing-mode` | Block flow direction (vertical scripts). | `horizontal-tb`, `vertical-rl`, `vertical-lr`, `sideways-rl`, `sideways-lr`. |
| **Unicode bidi** | `unicode-bidi` | Bidirectional algorithm override. | `normal`, `embed`, `isolate`, `bidi-override`, `isolate-override`, `plaintext`. |

### Font features

| Field | Property | What | Values |
|---|---|---|---|
| **Stretch** | `font-stretch` | Variable-font width axis. | Percentage (50–200%) or keyword. |
| **Size adjust** | `font-size-adjust` | Adjusts the fallback-font glyph aspect ratio so a swap doesn't visibly resize text. | Number (`0.5`), `none`, or `from-font`. |
| **Kerning** | `font-kerning` | Whether kerning data baked into the font is applied. | `auto`, `normal`, `none`. |
| **Optical** | `font-optical-sizing` | Whether the font's optical-size axis is used to adjust glyphs to current `font-size`. | `auto`, `none`. |
| **Synthesis** | `font-synthesis` | Whether the browser may synthesise bold / italic / small-caps when the font lacks them. | `weight style small-caps` (default), `none`, or any subset. |
| **Caps** | `font-variant-caps` | Small / titling caps. | `normal`, `small-caps`, `all-small-caps`, `petite-caps`, `all-petite-caps`, `unicase`, `titling-caps`. |
| **Position** | `font-variant-position` | CSS-driven sub-/super-script glyphs (when the font has them). | `normal`, `sub`, `super`. |
| **Numeric** | `font-variant-numeric` | Tabular figures, oldstyle figures, slashed-zero, fractions. | `normal`, `ordinal`, `slashed-zero`, `lining-nums`, `oldstyle-nums`, `proportional-nums`, `tabular-nums`, `diagonal-fractions`, `stacked-fractions`. |
| **Ligatures** | `font-variant-ligatures` | Common / discretionary / historical / contextual. | `normal`, `none`, plus per-set on/off keywords. |
| **Feature settings** | `font-feature-settings` | Raw OpenType feature string. | E.g. `"liga" 1, "ss01" 1`. |
| **Variation settings** | `font-variation-settings` | Raw variation-axis string for variable fonts. | E.g. `"wght" 480, "opsz" 32`. |

### List

| Field | Property | What | Values |
|---|---|---|---|
| **List position** | `list-style-position` | Whether the marker sits inside or outside the principal block. | `outside`, `inside`. |
| **List image** | `list-style-image` | Custom marker image. | `none` or `url(...)`. |

### Rendering

| Field | Property | What | Values |
|---|---|---|---|
| **Text rendering** | `text-rendering` | Browser hint for trade-off between speed and legibility. | `auto`, `optimizeSpeed`, `optimizeLegibility`, `geometricPrecision`. |

### Skipped (intentionally not surfaced)

These CSS properties are deliberately out of scope. See PARITY.md → Typography → Skipped for the per-property rationale.

| Group | Properties |
|---|---|
| CJK / vertical text | `text-emphasis`, `text-emphasis-color`, `text-emphasis-position`, `text-emphasis-style`, `text-orientation`, `ruby-position`, `ruby-align`, `ruby-overhang`, `text-combine-upright`, `font-variant-east-asian` |
| Power-user OpenType | `font-variant-alternates`, `font-variant-emoji`, `font-language-override` |
| Color fonts | `font-palette`, `@font-palette-values` |
| Cosmetic edges | `hyphenate-character` |
| Proposal-stage / spotty support | `text-box-trim`, `text-box-edge`, `white-space-collapse`, `text-spacing-trim` |
| Tooling concerns | `@font-face` editor / font upload |

**Figma equivalent**: Typography primary panel + an "Advanced typography" drawer that exposes web-only CSS controls Figma doesn't expose.

---

# Fill

Color, gradient, and image **fills** for the box. Multi-layer with full per-layer control.

**Visibility**: shown for `text`, `container`, `media`, `svg`, `form`, `page`. The section header carries the Advanced chevron and (auto) reset button — no eye toggle (per-layer eye lives on each row).

## Layered list

Each fill is exactly one row:

| UI element | What |
|---|---|
| Drag handle (`gripVertical`) | Drag the row up/down to reorder. The solid layer is anchored to the bottom — the visible image-stack reorders freely. |
| Swatch preview | Shows the actual fill — color / gradient / image. |
| Label | Hex (solid) · `linear — 180deg, white 0% black 100%` (gradient) · `image — …/photo.jpg` (image). |
| Eye | Toggle visibility. Hidden layers are kept in memory but not painted. |
| Settings (`slidersHorizontal`) | Toggle the per-layer body underneath this row. |
| Trash | Remove the layer permanently. |
| `+ Add fill` button | At the bottom of the list. Click to expand 5 inline type pills (no popover): Solid · Linear · Radial · Conic · Image. |

## Per-fill body (settings-icon expansion)

The body shows below the row when expanded — the row itself stays one line.

### Solid

| Field | Property | What | Values |
|---|---|---|---|
| **Color** | `background-color` | The fill colour. | Any CSS colour (`#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `oklch(...)`, `var(--token)`, named). |

### Image

| Field | Property | What | Values |
|---|---|---|---|
| **URL** | This layer's entry in `background-image` | The image source. | `https://…`, `/path/to.png`, data URLs. Auto-rewrapped as `url(...)` on save. |
| **Fit** (segmented row) | Atomically writes `background-size` + `background-repeat` slots | The four standard fit modes (matches Figma). | **Fill** → `cover` + `no-repeat` (covers the box, may crop). **Fit** → `contain` + `no-repeat` (fits inside, may letterbox). **Crop** → `100% 100%` + `no-repeat` (stretches). **Tile** → `auto` + `repeat` (repeats at native size). |
| **Size** | This layer's slot in `background-size` | How the image scales (fine control beyond the fit segmented). | `auto`, `cover`, `contain`, `100% 100%`, `50% 50%`. |
| **Repeat** | This layer's slot in `background-repeat` | Tiling behaviour. | `repeat`, `no-repeat`, `repeat-x`, `repeat-y`, `space`, `round`. |
| **Position** (3×3 pad) | This layer's slot in `background-position` | Visual 3×3 grid; each cell writes an `X% Y%` pair. The active cell reflects the parsed current position. | `0% 0%`, `50% 0%`, `100% 0%`, `0% 50%`, `50% 50%`, `100% 50%`, `0% 100%`, `50% 100%`, `100% 100%`. |
| **Blend** | This layer's slot in `background-blend-mode` | How this fill blends with layers underneath. | All CSS blend keywords. |

### Gradient (Linear / Radial / Conic)

| Field | Property | What | Values |
|---|---|---|---|
| **Angle / Shape / From** | First arg of the gradient function | Linear → angle (`180deg`); Radial → shape (`circle`, `ellipse at center`); Conic → start (`from 0deg at 50% 50%`). | Any valid first argument for the gradient kind. |
| **Stops** | Comma-separated colour stops in the gradient function | Each stop has a colour and an optional position. | Color: any CSS colour. Position: `0%`–`100%` or a length. |
| **+ Add stop** | Appends a new stop | New stop defaults to opaque black at `100%`. | — |
| **Trash (per stop)** | Removes that stop | Disabled if only 2 stops remain (gradient needs at least 2). | — |
| **Size / Repeat / Position / Blend** | Same as Image — per-layer comma slots. | | |

## Colour input shortcuts

The colour picker has three entry points, each surfacing the same site-colour token list at the friction level you want:

| Entry point | What opens | When to use |
|---|---|---|
| Click the **swatch** (left button) | Full HSV + tokens panel below the row | Pick any colour from the wheel; tokens shown beneath the picker. |
| Focus the **hex input** | Tokens-only dropdown floating beneath the input | Quick access to site colours without opening the full HSV. Closes when focus leaves. |
| Type into the **hex input** | (Same input, no popup) — typed value applies on commit | Paste a hex / rgb / hsl / colour-name / `var(--token)` directly. |
| **Pick** button (inside HSV panel) | Chrome `EyeDropper` system picker | Sample any pixel on screen. Falls back to a friendly alert on Firefox / Safari. |

## Advanced (chevron in section header)

### Background painting box

| Field | Property | What | Values |
|---|---|---|---|
| **Clip** | `background-clip` | Where the painted background ends. | `border-box`, `padding-box`, `content-box`, `text` (gradient/image fills the glyph shape). |
| **Origin** | `background-origin` | Where `background-position` is anchored. | `border-box`, `padding-box`, `content-box`. |
| **Attachment** | `background-attachment` | How the background scrolls. | `scroll` (default), `fixed` (locks to viewport), `local` (locks to scrolling content). |
| **Gradient text** (button) | Writes `background-clip: text` + `-webkit-background-clip: text` + `-webkit-text-fill-color: transparent` + `color: transparent`. | One-click preset for the canonical CSS recipe that uses your topmost gradient/image as the glyph fill. | — |

### Mask

| Field | Property | What | Values |
|---|---|---|---|
| **Image** | `mask-image` | The mask source. | `url(...)`, gradient, `none`. |
| **Mode** | `mask-mode` | How the mask source's pixels become alpha. | `match-source`, `alpha`, `luminance`. |
| **Composite** | `mask-composite` | How multiple mask layers combine. | `add`, `subtract`, `intersect`, `exclude`. |
| **Repeat** | `mask-repeat` | Tiling. | Same keywords as `background-repeat`. |
| **Size** | `mask-size` | Mask scale. | Same as `background-size`. |
| **Position** | `mask-position` | Mask anchor. | Same as `background-position`. |
| **Origin** | `mask-origin` | Where `mask-position` is anchored. | `border-box`, `padding-box`, `content-box`, `margin-box`, `fill-box`, `stroke-box`, `view-box`. |
| **Clip** | `mask-clip` | Where the mask is drawn. | Same as `mask-origin` plus `no-clip`. |

## SVG paint variant (when `kind === 'svg'`)

For SVG layers, the Fill section also surfaces SVG-only paint properties (CSS form takes precedence over presentation attributes):

### SVG paint

| Field | Property | What | Values |
|---|---|---|---|
| **Fill** | `fill` | Path / shape paint colour. | Any CSS colour, `none`, or `url(#id)` for paint servers. |
| **Opacity** | `fill-opacity` | Alpha. | `0`–`1`. |
| **Fill rule** | `fill-rule` | How self-intersecting paths are filled. | `nonzero` (default), `evenodd`. |

### SVG stroke (distinct from the box's CSS `border-*` — those still live in the Stroke section)

| Field | Property | What | Values |
|---|---|---|---|
| **Color** | `stroke` | Path stroke colour. | Any CSS colour, `none`. |
| **Width** | `stroke-width` | Stroke thickness. | Length. |
| **Linecap** | `stroke-linecap` | End-of-line shape. | `butt`, `round`, `square`. |
| **Linejoin** | `stroke-linejoin` | Corner shape. | `miter`, `round`, `bevel`. |
| **Dash array** | `stroke-dasharray` | Dash pattern. | `none` or one-or-more lengths (e.g. `4 2`). |
| **Dash offset** | `stroke-dashoffset` | Where the dash pattern starts. | Length. |

**Figma equivalent**: Fill panel — multi-fill stacking with type picker (Solid / Linear / Radial / Angular / Image) per layer. Diamond is skipped (no clean CSS equivalent). For SVG, Figma's "fill" maps directly to the `fill` paint property here; image-fill colour adjustments live in the **Appearance** section (CSS `filter` is element-wide).

---

# Stroke

The **outline** of the box. CSS doesn't have a native "stroke position," so we synthesize Inside (inset shadow), Outside (border), and Center (outline).

**Visibility**: shown for `text`, `container`, `media`, `svg`, `form`.

## Stroke position selector (Inside / Outside / Center)

| Mode | CSS dispatched | What |
|---|---|---|
| **Inside** | `box-shadow: inset 0 0 0 N <color>` | Stroke renders inside the box edge. Doesn't push siblings. |
| **Outside** | `border-*-width / -style / -color` | Standard CSS border. Adds to the box's outer dimensions (unless `box-sizing: border-box`). |
| **Center** | `outline-*` + `outline-offset: -(N/2)` | Stroke straddles the box edge. Doesn't add to layout dimensions (CSS `outline` is layout-free). |

**Figma equivalent**: Stroke align (Inside / Outside / Center).

## Main row (Colour + Weight + Style + Per-side toggle)

| Field | Property | What | Values |
|---|---|---|---|
| **Colour** | All four `border-*-color` (or `outline-color` in Center; the colour token in the inset shadow for Inside) | Stroke colour. | Any CSS colour (`#hex`, `rgb()`, `hsl()`, `oklch()`, `var(--token)`, named). |
| **Weight** | All four `border-*-width` (or `outline-width` in Center; the spread of the inset shadow for Inside) | Stroke thickness. | Length. `0` clears the stroke. |
| **Style** (dropdown) | All four `border-*-style` (or `outline-style` in Center) | Line pattern. | `solid`, `dashed`, `dotted`, `double`, `groove`, `ridge`, `inset`, `outset`, `hidden`, `none`. Plus `auto` (outline-only — picking it auto-switches the position to Center and writes `outline-style: auto`, the browser-native focus ring). |
| **Per-side toggle** (`settings-2`) | Reveals the per-side panel below. | **Only shown in Outside mode.** Inside (inset shadow) and Center (outline) are CSS-uniform across sides; exposing the toggle there would mislead. | — |

**Figma equivalent**: Stroke section (colour, weight, style dropdown, per-side widths).

## Layered list (multi-stroke)

Renders **only when 2+ strokes** exist on the element. A single stroke is fully represented by the primary controls, so the list stays hidden until you click `+ Add stroke`.

| UI element | Property | What | Values |
|---|---|---|---|
| Drag handle (`gripVertical`) | — | Drag the row up/down to reorder. CSS shadow paint order means **top of list = closest to the element**. | — |
| Swatch | The layer's `color`. | Click the row to make it the **active** layer (the primary controls below operate on it). | — |
| Label | `Wpx · <color>` | Quick read of the layer's weight + colour. | — |
| Eye | The layer's `visible` flag (in-memory). | Toggle this layer in / out of the dispatched chain. Hidden layers stay in state until removed. | — |
| Trash | Removes the layer from state and re-dispatches. | If down to 1 layer in Outside mode, the dispatcher migrates back to the `border-*` path (per-side toggle re-appears). | — |
| `+ Add stroke` button (below primary controls) | Pushes a new layer (1px white) onto the stack. | Disabled in Center mode (CSS outline cannot stack — tooltip explains). | — |

**Position semantics with multi-stroke**:
- **Outside, single** → `border-*-width / -color / -style` (preserves per-side support).
- **Outside, multi** → comma-separated `box-shadow` (no inset). Per-side support is **unavailable** — the dispatcher clears `border-*-width` to 0 and the panel surfaces a small note.
- **Inside, single or multi** → comma-separated `box-shadow` (`inset`). Existing Effects-section drop / inner shadows are preserved untouched (they live in the same `box-shadow` chain).
- **Center** → single only (`outline-*`). `+ Add stroke` is disabled.

**Stacking ordering note**: Earlier `box-shadow` entries paint on top in CSS. The layered list visualises the same order — drag a row up to bring it closer to the element. For Outside multi-stroke, the topmost row's spread is smallest (touches the element); subsequent rows' spreads grow outward.

**Auto-migration semantics (Outside mode only)**:

| From | To | What happens |
|---|---|---|
| Single (border-*) | Multi (box-shadow chain) | Existing per-side widths collapse to `Math.max(T,R,B,L)` and become layer 0's weight. Border-* widths clear to `0`. The note appears: *"Top of list paints closest to the element. Per-side widths are unavailable while strokes are stacked."* |
| Multi (box-shadow chain) | Single (border-*) | Layer 0's weight + colour become the new uniform `border-*` values. Stroke-shaped `box-shadow` entries clear (drop / inner shadows are preserved). Per-side toggle re-appears. |

## Per-side panel (Outside mode, settings-2 expanded)

Four rows — Top / Right / Bottom / Left — each with three fields. Editing one cell never fans out.

| Field | Property | What | Values |
|---|---|---|---|
| **Width** (per side) | `border-top-width` · `border-right-width` · `border-bottom-width` · `border-left-width` | Side-specific thickness. | Length. The first per-side edit auto-promotes `border-style: none → solid` so the change is visible. |
| **Colour** (per side) | `border-top-color` · `border-right-color` · `border-bottom-color` · `border-left-color` | Side-specific colour. Each cell carries the same swatch + hex input + tokens-on-focus dropdown as the main colour picker. | Any CSS colour. |
| **Style** (per side) | `border-top-style` · `border-right-style` · `border-bottom-style` · `border-left-style` | Side-specific style. | Same set as the primary Style dropdown. |

**When to use**: any time you want different sides to look different — common patterns include a 2px bottom border under headings, a left rail accent, or three sides solid + one dashed.

**Mode caveat**: this panel is only available in Outside mode. Inside (inset shadow) and Center (outline) cannot have per-side variations in CSS — the toggle button is hidden in those modes to make the constraint visible up front.

## Dashed config panel (when style is `dashed`)

| Field | Property (CSS custom prop) | What | Values |
|---|---|---|---|
| **Dash** | `--dm-stroke-dash` | Dash length. | Positive integer ≥ 1 (px). |
| **Gap** | `--dm-stroke-gap` | Gap length. | Positive integer ≥ 1 (px). |
| **Square cap** (button) | `--dm-stroke-cap: square` | Sharp dash ends. | — |
| **Round cap** (button) | `--dm-stroke-cap: round` | Rounded dash ends. | — |

**Two render modes** for the dashed pattern:

| Button | What it does |
|---|---|
| **Custom dashes** | Synthesises a corner-aware SVG using your typed `dash`, `gap`, `cap`, plus the current `border-width` and `border-color`. Writes the SVG as `border-image-source` (with `slice = weight`, `repeat: round`). The `repeat: round` setting makes the browser auto-scale tiles to fit a whole number per side — dashes never get clipped at corners. The SVG itself is **element-size independent** (no resize re-trigger needed). Auto-promotes `border-style: none → solid` and seeds `border-width: 2px` if the element has no border yet. |
| **Native pattern** | Clears `border-image-source` (and the rest of the border-image suite) back to defaults. Reverts to the browser's built-in `dashed` look — pattern is up to the browser; your typed dash / gap values become design intent only. |

The active button has its outline highlighted so you can see at a glance which mode is on.

## Outline offset (Center mode only)

| Field | Property | What | Values |
|---|---|---|---|
| **Outline offset** | `outline-offset` | Distance between the box edge and the outline. | Length. Negative pulls inward (default seed: `-(weight/2)` so the outline straddles the edge); positive pushes outward. |

## Stroke Advanced (chevron in section header)

### Border image

CSS lets you slice an image (or gradient) into 9 regions and use it as the border. This enables gradient strokes, ornate frames, and dash/dot patterns the native `dashed`/`dotted` styles can't render.

| Field | Property | What | Values |
|---|---|---|---|
| **Source** | `border-image-source` | The image / gradient that fills the border. | `none`, `url(...)`, `linear-gradient(...)`, `radial-gradient(...)`, `conic-gradient(...)`, etc. |
| **Slice** | `border-image-slice` | Where to cut the source into 9 regions. | Number / percentage (1–4 values for top/right/bottom/left), optionally followed by `fill` to also paint the centre. Default `100%`. |
| **Width** | `border-image-width` | The width of the image bands. | Length / percentage / number (multiple of `border-width`) / `auto`. Default `1` — same as `border-width`. |
| **Outset** | `border-image-outset` | Pushes the painted area beyond the border box. | Length / number. Default `0`. |
| **Repeat** | `border-image-repeat` | How the four edge bands tile. | `stretch`, `repeat`, `round` (whole tiles, scaled), `space` (whole tiles, gaps). |

### Presets

| Button | What it writes | When to use |
|---|---|---|
| **Gradient stroke** | `border-image-source: linear-gradient(135deg, #ff0080, #7928ca)`, `slice: 1`, `width: 1`, `outset: 0`, `repeat: stretch`. Also seeds `border-width: 4px` + `border-style: solid` if currently empty. | Quick start for the standard "gradient border" recipe. Edit Source above to customise the gradient. |
| **Clear image** | Resets `border-image-*` back to defaults (`none`, `100%`, `1`, `0`, `stretch`). | Drop back to a regular border without losing the existing `border-width` / `style` / `color`. |

**Note on `border-image` and `border-style`**: an image only renders when `border-style` is **not** `none` and `border-width` is non-zero. The Gradient stroke preset handles both for you; if you set the source manually, make sure the underlying border isn't empty.

---

# Effects

Visual effects — shadows, blurs, motion.

**Visibility**: shown for `text`, `container`, `media`, `svg`, `form`.

## Layered list

Every effect on the element is one row. Multiple shadows / blurs stack in the order shown — top of list paints on top.

| Effect kind | CSS dispatched | What |
|---|---|---|
| **Drop shadow** | One non-inset entry in `box-shadow` chain | Shadow projected behind the layer's outer edges. Each non-stroke, non-inset entry surfaces as its own row. |
| **Inner shadow** | One inset entry in `box-shadow` chain | Shadow projected inside the layer's edges. |
| **Drop shadow (filter)** | `drop-shadow(...)` call inside `filter` | DOM-aware shadow that follows the rendered alpha — for SVG icons, `clip-path`'d shapes, transparent PNGs. No `spread` or `inset` (CSS limitation). |
| **Text shadow** | `text-shadow` | Shown only on text-bearing layers. |
| **Layer blur** | `blur(...)` call inside `filter` | Blurs the layer itself. |
| **Background blur** | `blur(...)` call inside `backdrop-filter` | Blurs what's behind the layer (frosted glass). |

**Row controls** (each row):

| Control | What |
|---|---|
| Drag handle | Drag to reorder within the same chain. Drops onto a different chain are ignored. |
| Type icon | Shows the effect family at a glance. |
| Label + meta | Effect name (e.g. *Drop shadow*) + a one-line summary of the values (`x y blur spread · colour`). |
| Eye | Toggles visibility. Hidden entries are stashed in memory and removed from CSS; toggle back to restore at the original index. |
| Settings (`slidersHorizontal`) | Expands the per-effect editor below the row. |
| Trash | Permanently removes the entry from its CSS chain. |

## Per-shadow editor (drop / inner / filter / text)

| Field | Property | What | Values |
|---|---|---|---|
| **Type** (`box-shadow` only) | `inset` keyword | Flips between Outer (drop) and Inner. | `outer` / `inset`. |
| **Colour** | shadow colour | The shadow's RGBA. | Any CSS colour. The colour swatch + hex input + tokens-on-focus dropdown all work like elsewhere. |
| **Offset X** | first shadow length | Horizontal offset. | Length; negative allowed. |
| **Offset Y** | second shadow length | Vertical offset. | Length; negative allowed. |
| **Blur** | third shadow length | Softness radius. | Length; ≥ 0. |
| **Spread** (`box-shadow` only) | fourth shadow length | How much the shadow extends past the box. | Length; negative allowed (shrinks). |

*`filter: drop-shadow()` and `text-shadow` don't accept `spread` or `inset` — those rows render fewer fields.*

## Per-blur editor (layer / background)

| Field | Property | What | Values |
|---|---|---|---|
| **Radius** | `blur(N)` arg | Blur amount. | `0px` typical to `~50px`. |

## Add menu (`+` in section header)

Single-effect adds (each appends a new row):

- **Drop shadow** · seeds `0 4px 12px rgba(0,0,0,0.12)`.
- **Inner shadow** · seeds `inset 0 2px 6px rgba(0,0,0,0.18)`.
- **Text shadow** · seeds `0 1px 2px rgba(0,0,0,0.25)`.
- **Filter drop-shadow** · seeds `drop-shadow(0 4px 8px rgba(0,0,0,0.2))`.
- **Layer blur** · seeds `blur(4px)`.
- **Background blur** · seeds `blur(8px)` on `backdrop-filter`.

Composed presets — multi-property recipes applied in one click:

| Preset | What it writes |
|---|---|
| **Soft drop** | `0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.08)` (two-stop ambient lift). |
| **Hard drop** | `0 2px 0 rgba(0,0,0,0.85)` (sharp, no blur). |
| **Layered drop** | A 5-stop shadow stack mimicking Material elevation. |
| **Glow** | `0 0 0 2px rgba(79,158,255,0.45), 0 0 20px rgba(79,158,255,0.55)` (accent-coloured halo). |
| **Embossed** | `inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.12)` (raised-button look). |
| **Frosted glass** | `backdrop-filter: blur(12px) saturate(1.4)` (frosted with vibrancy). |
| **Neon text** | A 5-stop colour stack on `text-shadow` (white inner glow + magenta outer halo). |

Motion entry-points:

- **Transition** · seeds `transition: all 0.2s ease`.
- **Animation** · seeds `animation: dm-fade-in 0.4s ease both`.
- **Transform** · seeds `translate: 0px 0px` so the Transform components editor can take over.
- **Motion path** · seeds an oval `offset-path` plus `offset-distance: 0%` and `offset-rotate: auto`.

## Motion subsection

Below the effect list. Each subsection renders only when its property is non-default.

### Transition

| Property | What | Values |
|---|---|---|
| `transition-property` | Which property animates. | Property name(s) or `all`. |
| `transition-duration` | How long. | Time. |
| `transition-timing-function` | The easing curve. | `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier(...)`, `steps(...)`. The custom-curve viz exposes a cubic-bezier picker. |
| `transition-delay` | Delay before the transition starts. | Time. |

### Animation

12 built-in keyframes (`dm-fade-in`, `dm-slide-up`, `dm-pulse`, etc.) plus any `@keyframes` defined on the page.

| Property | What | Values |
|---|---|---|
| `animation-name` | Which keyframe set. | Built-in `dm-*` or custom name. |
| `animation-duration` | How long one cycle takes. | Time. |
| `animation-timing-function` | Per-cycle easing. | Same as transition. |
| `animation-delay` | Delay before the first cycle. | Time. |
| `animation-iteration-count` | How many cycles. | Number or `infinite`. |
| `animation-direction` | Cycle direction. | `normal`, `reverse`, `alternate`, `alternate-reverse`. |
| `animation-fill-mode` | What state to hold before / after. | `none`, `forwards`, `backwards`, `both`. |
| `animation-play-state` | Running or paused. | `running`, `paused`. |

### Transform components

| Property | What | Values |
|---|---|---|
| `translate` | X / Y offset (and Z for 3D). | Length per axis. |
| `rotate` | Rotation angle. | Angle. |
| `scale` | X / Y scale (and Z for 3D). | Numbers. |
| `transform: skew(X, Y)` | Skew angles. | Angle per axis. |

### Motion path

Animate the element along a custom path. CSS-native equivalent of SVG `<animateMotion>`.

| Field | Property | What | Values |
|---|---|---|---|
| **Path** | `offset-path` | The path the element travels. | `none`, `path('M…')`, `ray(...)`, `circle(...)`, `polygon(...)`, `url(#svg-path)`. |
| **Distance** | `offset-distance` | Progress along the path (0% → 100%). Animate this on `:hover` / via `@keyframes` to move the element. | Percentage or length. |
| **Rotate** | `offset-rotate` | Whether the element rotates with the path tangent. | `auto`, `reverse`, an angle, or `<angle> auto`. |
| **Anchor** | `offset-anchor` | The point on the element that travels along the path. | Same syntax as `transform-origin`. |
| **Position** | `offset-position` | Where on the path travel starts when `offset-path` is `auto`. | Same syntax as `background-position`. |
| **Clear motion path** (button) | All five reset to defaults. | — |

### View transition

Bridges the View Transitions API. The CSS properties below are static metadata — the actual transition fires when the page calls `document.startViewTransition(...)`. Useful for choreographed page or DOM swaps (a la Astro, Next.js App Router, vanilla `startViewTransition`).

| Field | Property | What | Values |
|---|---|---|---|
| **Name** | `view-transition-name` | A unique-per-page identifier. The browser keeps the old + new versions of an element with the same `name` linked across the transition and animates between them. | Any CSS identifier; `none` to disable. |
| **Class** | `view-transition-class` | Groups multiple elements so a single `::view-transition-group(.cls)` rule can target them. | Space-separated identifiers; `none`. |
| **Clear view transition** (button) | Resets `name` and `class` to `none`. | — |

> Note: the same `view-transition-name` is also exposed in Position → Advanced. Both contexts are valid; the property is transferable.

### Scroll-driven animation

Bind animation progress to scroll position rather than time. The same animation-timing properties (`animation-name`, `-duration`, etc.) drive the animation; **`animation-timeline`** swaps the time source for a scroll progress source.

#### Animation timeline

| Field | Property | What | Values |
|---|---|---|---|
| **Timeline** | `animation-timeline` | Which timeline drives the animation. | `auto` (default time), `none`, `<scroll-timeline-name>`, `<view-timeline-name>`, anonymous functions: `scroll(<axis> <scroller>)`, `view(<axis> <inset>)`. |
| **Range** | `animation-range` (shorthand for `-start` / `-end`) | What slice of the timeline maps to 0%→100% of the animation. | `normal`, `cover`, `contain`, `entry`, `exit`, with optional `<percentage>` offsets. E.g. `entry 0% exit 100%`. |

#### Scroll-timeline source (this element scrolls)

Marks the current element as a scroll-progress timeline. Other animations on the page reference it by `<name>` via `animation-timeline`.

| Field | Property | What | Values |
|---|---|---|---|
| **Name** | `scroll-timeline-name` | The identifier other animations bind to. | A CSS identifier (e.g. `--main-scroll`) or `none`. |
| **Axis** | `scroll-timeline-axis` | Which axis to track. | `block`, `inline`, `x`, `y`. |

#### View-timeline source (this element's visibility)

Marks the current element as a view-progress timeline — progress runs as the element enters and exits the scrollport.

| Field | Property | What | Values |
|---|---|---|---|
| **Name** | `view-timeline-name` | The identifier other animations bind to. | A CSS identifier or `none`. |
| **Axis** | `view-timeline-axis` | Which axis to track. | `block`, `inline`, `x`, `y`. |
| **Inset** | `view-timeline-inset` | Shrinks the visible region used for progress. | `auto`, length, or two lengths (start / end). |

#### Scope

| Field | Property | What | Values |
|---|---|---|---|
| **Timeline scope** | `timeline-scope` | Hoists a timeline name to be visible to descendants. | A CSS identifier or `none`. |

#### Buttons

| Button | What it writes |
|---|---|
| **Bind to page scroll** | `animation-timeline: scroll(root block)` + `animation-range: entry 0% exit 100%`. The fast path for "this animation runs as the user scrolls the page". |
| **Clear** | Resets every scroll-driven property back to its default. |

**Figma equivalent**: Effects panel covers Drop / Inner / Layer / Background. Filter drop-shadow, Motion path, View transition, and Scroll-driven animation are CSS-only goodies. Smart Animate maps to Transition / Animation conceptually; View transitions overlap with Smart Animate's intent (carry an element across page states), but the implementation is browser-native.

---

# How the panel responds to context

## Layer-type gating

Each section's visibility is gated by `LayerKind` (the table at the top of this doc). If you select a `<br>` element, you only see Position and Appearance — the rest don't apply to a void element.

The **Indicator row** is always rendered (regardless of layer kind) — it's the panel's "you're editing this" confirmation chip.

The **Icon section** is conditional on icon detection — independent of layer kind. Any element whose tag + class combination matches a known icon-library pattern (Lucide, FontAwesome SVG, FontAwesome webfont) gets it. Most often that's `svg` and `text` kinds (because `<i>` tags are text-bearing).

The **Media section** is conditional on `LayerKind === 'media' || LayerKind === 'svg'`. It only appears for actual media tags (`<img>`, `<video>`, etc.) and SVG roots — *not* for any container that happens to have a CSS `background-image`. Backgrounds are a Fill, not a media layer; surfacing them in Media would be misleading.

## Position-type gating (within Position)

Setting `position: static` hides:
- The X / Y / Z / Z-order row
- Right / Bottom row in Advanced
- Logical anchors row in Advanced
- Try order / Visibility row in Advanced
- Try fallbacks input in Advanced

Anchor name stays enabled (an element can be named as an anchor regardless of its own positioning). `Position anchor` and `Position area` stay visible but disabled with a tooltip.

## Position-type prefill

When you change the `position` dropdown:
- → `absolute` or `fixed` → if `top` and `left` are both `auto`, prefills both to `0px` so the layer pops to the top-left corner of its containing block.
- → `sticky` → if `top` is `auto`, prefills `top: 0px` (the most common sticky pattern: sticky-to-top header).
- → `static` or `relative` → no prefill (offsets aren't needed).

If you've already set values, no prefill happens — we never clobber existing intent.

## Layout-mode gating (within Layout)

The 4-mode segmented control swaps `display` and `flex-direction`. Children-align row + Col/Row gap fields gate by mode:

| Mode | Children align pad | Col gap | Row gap |
|---|---|---|---|
| Free / blocks | hidden | hidden | hidden |
| Horizontal stack | shown | shown | hidden |
| Vertical stack | shown | hidden | shown |
| Grid | shown | shown | shown |

## Stroke-mode gating (within Stroke)

The Inside / Outside / Center selector swaps the underlying CSS target. The dashed config panel only appears when style is `dashed`. The Outline offset input only appears in Center mode.
