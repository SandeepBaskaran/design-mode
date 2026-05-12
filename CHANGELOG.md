# Changelog

All notable changes to Design Mode are tracked here. The current focus
is on the browser extension and its companion MCP server.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions use [SemVer](https://semver.org/spec/v2.0.0.html).

## [1.0.2] — 2026-05-12

### Added

- **Layout guide section.** Figma-style overlay of Columns / Rows /
  Grid bars rendered as a `::before` pseudo-element on the selected
  element. Per-element session memory; survives page reload while the
  side panel is open. Each row is draggable / rearrangeable with a
  slim primary row (kind + count/size + settings + eye + trash) and a
  3×2 expanded body for Columns/Rows (Colour, Opacity, Align, Width /
  Height, Margin, Gutter) or 1×2 for Grid (Colour, Opacity).
- **Motion section** split out of Effects. Lives directly below
  Effects with its own `+` menu: Transition, Animation, Transform,
  Motion path, View transition, Scroll-driven animation. Starts
  collapsed by default to keep the design tab compact.
- **Noise effect** with Mono / Duo / Multi modes. Painted via an
  `::after` pseudo-element from a synthetic `__effect_overlay` prop;
  size X/Y, density, colour(s) + opacities. Round-trips through the
  change-tracker so it appears in Changes and persists across reloads.
- **Texture effect** with size X/Y, blur radius, and a "Clip to
  shape" checkbox (inherits `border-radius` / `clip-path` so the
  texture matches the element's mask).
- **Seeded presets — one of every kind.** A fresh install ships
  with Position, Layout, Appearance, Typography, Fill, Stroke,
  Effects (×7 recipes), Motion, and Layout guide examples. Migration-
  safe: existing users get the new kinds merged in without
  resurrecting deleted presets.
- Each Drop shadow row carries a **"Show behind transparent areas"
  checkbox** that swaps between three CSS chains: `box-shadow` (on,
  rectangle), `text-shadow` (off, text elements — alpha-bound to
  glyphs), `filter: drop-shadow` (off, other elements — alpha-bound
  to whole-element alpha). Spread is preserved in the typed model
  when toggling off and re-emitted when toggled back on.
- Layer blur / Background blur rows surface the **blur radius inline**
  in the primary row — no settings expand, no body, no Progressive
  tab (CSS doesn't support true gradient blur and a mask-image fake
  would mislead).

### Changed

- **Effects refactored to a Figma-aligned six-kind menu**: Inner
  shadow · Drop shadow · Layer blur · Background blur · Noise ·
  Texture. The previous menu's Drop / Text / Filter-drop siblings
  are collapsed into the single Drop shadow row above.
- **Stroke section**: weight inputs floor at 0; corner-radius inputs
  floor at 0; both block the minus keystroke and clamp paste /
  Arrow-step.
- **Presets**: built-in effect recipes (Soft / Hard / Layered drop,
  Glow, Embossed, Frosted glass, Neon text) moved from the Effects
  `+` menu into the seeded Presets list — they're rename / edit /
  delete-able like any user preset.

### Fixed

- **Scroll position preserved on every render**, not just on tab
  switches. The numeric Arrow keypress (font-size, padding, weight,
  any numeric input) no longer snaps the design panel to the top.
- **Inherited typography reset companion.** `text-align`, `color`,
  `font-*`, `line-height`, `letter-spacing`, `text-transform` no
  longer cascade visually to every descendant on the page when set
  on a container. The change-tracker now emits a `revert` companion
  rule on descendant `[data-dm-id]` elements so the edit feels
  local — matches the Figma model.
- **Sticky `multiSelectActive` flag** cleared on empty
  `MULTI_SELECT_UPDATE` messages instead of remaining true once set.
- **Batched stroke handlers.** `strokeAdd` / `strokeRemove` /
  `strokeToggle` / drag-reorder collect their dispatch fan-out into
  a single `applyStylesBatch` instead of firing 5 un-awaited sends
  per click → one re-render, no tearing.
- **Non-negative numeric clamp** extended to `border-*-width`,
  `padding-*`, `font-size`, `outline-width` in addition to the
  existing corner-radius and stroke-weight props.
- **Effects colour picker** works again. HSV drag on shadow swatches
  was silently dropped because `__effd_<chain>_<idx>_color` fell
  through `applyStyle` to the content script as a CSS property. New
  intercept splices the picker's value into the right chain entry.

### Security

- **Sanitised rich-text editor seed.** The Typography section's
  contenteditable was previously seeded with the inspected page's
  raw `innerHTML`. Any malicious page could plant a payload (e.g.
  `<img src=x onerror=…>`) that fires inside the privileged
  side-panel context the moment the user clicks the offending
  element. The new `sanitizeRichTextHtml` (in
  `packages/extension/src/sidepanel/sidepanel.ts`) uses DOMParser
  to parse the HTML in a sandbox, then walks the tree keeping only
  a strict allow-list of formatting tags and the `href / target /
  rel` attributes on `<a>` (only http(s) / fragments / relative
  paths). Anything else is replaced by its text content.
- **Explicit MV3 CSP added** to `manifest.json`:
  `script-src 'self'; object-src 'self'; base-uri 'self'`. Defense
  in depth against future regressions even though MV3's default
  already forbids `unsafe-eval` / remote scripts.
- **`safeCssColor` clamp** on every page-derived colour value that
  flows into an inline `style="background:<v>"` attribute. A value
  like `red; background-image: url(https://attacker/log)` is now
  rejected at interpolation time instead of triggering an outbound
  request from the panel context.
- SECURITY.md now lists the maintainer contact email and explicitly
  documents the cloud-mode transport as a non-default opt-in.
- PRIVACY.md documents the optional cloud transport (`*.vercel.app`,
  `mcp.designmode.app`) and the bearer-token storage location.

### Internal

- `EffectEntry` union collapsed: `text-shadow` and
  `filter-drop-shadow` are no longer distinct kinds — they're
  variants of `drop-shadow` with `chain ∈ { 'box', 'filter', 'text'
  }` discriminating which CSS slot the entry lives in. `parseEffects`
  emits the new shape; the panel never sees the chain split.
- New `content/effects-overlay.ts` (Noise / Texture SVG builders) +
  `content/layout-guides.ts` (Columns / Rows / Grid gradient
  builders) keep the page-side stylesheet logic out of the
  side-panel bundle.

## [1.0.1] — 2026-05-04

First public release.
