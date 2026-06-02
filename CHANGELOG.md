# Changelog

All notable changes to Design Mode are tracked here. The current focus
is on the browser extension and its companion MCP server.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions use [SemVer](https://semver.org/spec/v2.0.0.html).

## [1.7.0] — 2026-06-02

### Added

- **Region comments.** Drop a freeform rectangle anywhere on the page
  (drag or click) to attach a comment to an area rather than a single
  element; persists until you Add or Cancel. Shortcut **Alt+R**.
- **Pop-out window.** Detach Design Mode into its own window that
  coexists with the side panel; background message routing is rebound
  per-tab (`targetTabId`) and content broadcasts are tab-scoped.
- **Agent command.** A `/design-mode` agent workflow command plus a
  "Set up your agent" section in Settings with copy buttons.
- **Two new MCP tools** (local + cloud): `mark_comment_resolved` and
  `set_change_status` — the agent marks changes/comments
  to-do / in_progress / resolved as it implements them. `get_changes`
  now exposes per-item `id` + `status`, and the Changes tab gains a
  WIP/DONE badge per row and a Status sub-filter.
- **`get_screenshot` region/element capture.** The tool accepts a
  `commentId` and returns a clean, cropped image of the comment's
  region or element as an MCP image content block.
- **Layout: gap Fixed/Auto.** Column/row gap fields gain a Fixed/Auto
  mode mirroring Width/Height — Auto spreads children via space-between
  and shows the measured effective gap.
- **Margin & Padding rows.** Figma-style uniform value with a per-side
  (T/R/B/L) expander, mirroring corner radius.
- **Nudge-amount setting.** Configurable Shift+Arrow step (default 10,
  persisted); plain Arrow stays at 1.
- **Design tokens in Changes.** `:root` variable edits appear in the
  Changes tab under a Design-tokens group with original → current and a
  Revert, plus a Tokens filter chip.
- **Shortcuts popover** with a non-remappable Fixed group and
  platform-correct modifiers (Alt+C comment, Alt+R region, Alt+P pause,
  Alt+X export; Alt+D remains the lone `chrome.command`).
- **Comparison pages**: Design Mode vs Figma Make, and Design Mode vs
  Drawbridge.

### Changed

- **Clean screenshot capture.** Every Design Mode overlay (hover/select
  outlines, margin/padding bands, guides, comment pins/regions) is
  hidden for the capture frame, then restored; the no-selection shot
  captures the current viewport overlay-free.
- **"Copy Prompt" → "Copy as Prompt"** (label only).
- **Single IDE-agnostic MCP config snippet** (`mcpServers` +
  `type: "http"`) replaces the per-IDE Claude/Cursor variants that
  omitted the transport type. Local snippet now reflects clone +
  `npm start` (no published npm package).
- **Freeze/pause-motion toggle** moved from the action row to the Motion
  section header (now shown for the page context too).
- **Computed box** (Chrome-DevTools view) moved into Layout → Advanced.

### Fixed

- MCP version drift — relay `initialize`, SSE hello, and the local
  `McpServer` were stuck reporting 1.2.0.
- `get_session_summary.activeSessions` is now populated.
- `/demo` accent token and several undefined demo tokens that degraded
  blue accents and hid the active nav number.

### Security

- Cloud relay: per-tenant 15-calls/10s burst guard.
- Malformed inbound JSON is logged instead of silently dropped.
- Removed the unused `DM_TOKEN_SECRET` from `.env.example` (cloud auth
  is a hash-lookup of random `dm_` tokens; nothing signs).

### Internal

- Removed dead Annotation/ThreadMessage/Severity/Status types and their
  message-union members, fields, and relay allow-list entries (no
  runtime consumers; region comments supersede them).
- Dependabot consolidated to a single root/workspace entry.
- Dependency bumps: `ws` 8.21.0, `sass` 1.100.0, `lucide-react` 1.x
  (inline GitHub-mark SVG replaces the dropped brand icon),
  `eslint-plugin-prettier`, `prettier-plugin-tailwindcss`.

## [1.6.0] — 2026-05-29

### Added

- **Design-system / Tokens panel.** Three-tab panel surfacing the page's
  design system, opened from the swatch-book icon in the action row.
  - **Declared** — every `:root` CSS variable on the page, grouped by
    purpose (Colour / Typography / Spacing / Radius / Shadow / Other),
    with swatch/preview, an inline live editor that repaints the page via
    `documentElement.style.setProperty`, a reset-to-original button, and a
    "×N uses" badge that lights up the on-page consumers via the
    multi-select overlay.
  - **Detected** — histograms of values *actually used* by viewport-visible
    elements for spacing / radius / font-size / shadow, with drift warnings
    when a value is close to a declared token and a "Replace with…"
    dropdown that fans out a `CONSOLIDATE_DETECTED` scan to rewrite every
    matching computed value as `var(--name)` under a single grouped change
    in the Changes tab.
  - **Defined** — user-saved presets (the new home for the previous
    Presets feature). Save the selected element's styles as a named
    preset; the Add form's kind dropdown only lists kinds with at least
    one non-default value on the current selection. Applied presets gain
    an **↶ Applied** button that reverts every style change in that
    application's `groupId`. Persists to `chrome.storage.sync`.
- Cross-tab **filter chips** (`All` / `Colours` / `Type` / `Spacing` /
  `Radius` / `Shadow` / `Other`), free-text search, and a **"Show only
  tokens used on this page"** toggle — tab-aware.

### Changed

- **Presets panel replaced by the Design-system / Tokens panel.** Existing
  user-saved presets surface in the Defined tab and are read back without
  migration. The swatch-book header icon now opens the Tokens panel.
- **Markdown exporter** no longer dumps the whole token catalog on every
  Copy Prompt. It emits a focused **`## Tokens changed`** section listing
  only the `:root` CSS variables you edited in this session (original →
  current); with no root-var edits the section is omitted entirely.
- **Website overhaul.** New marketing / docs pages — `/about`, `/faq`,
  `/contact`, `/blog` (+ `[slug]`), `/compare` (+ `[slug]`), `/docs`
  (+ `[slug]`), `/use-cases` (+ `[slug]`) — driven by content files in
  `website/src/content/`. New SEO infra: `robots.ts`, `sitemap.ts`,
  `manifest.ts`, `public/llms.txt` + `public/llms-full.txt`, and per-page
  JSON-LD structured data via `components/site/json-ld.tsx`. Hero copy
  split, mobile fixes, footer spacing polish.

### Internal

- New `content/root-var-store.ts` — tiny session-only store for per-token
  original values, shared between the content message handlers and the
  Markdown exporter without a circular dependency on `content/index.ts`.
- Removed dead `__DEAD_PRESETS__` scaffolding in `sidepanel.ts`; removed
  background `SP_*` relays for the deleted preset-bundle messages (the
  generic `SP_` fallback handles every new message in the new panel).
- Persistent storage now includes `dm-tokens-tab` (the active Tokens-panel
  tab) alongside the existing `dm-*` UI preferences.

## [1.5.0] — 2026-05-23

### Added

- **Margin & padding overlay bands.** The on-page hover and selection overlay
  now draws DevTools-style box-model bands — light red outside the element box
  for margin, light green between the border and content for padding. Bands
  hide when the corresponding spacing is all-zero.
- **All four inspector overlay colours configurable.** Settings → Inspector
  overlay now exposes hover, selection, margin, and padding colours with hex
  codes next to each swatch and a Reset link that restores the defaults.
- **WCAG contrast checker in the colour picker.** Picking a foreground colour
  shows the contrast ratio against the effective background, an absolute rating
  (Excellent / Good / Poor / Very Poor), AA and AAA pass/fail tabs, and a
  Category override (Auto / Large / Normal / Graphics). Category and level
  persist across sessions.
- **File size in the Media section.** The Media meta line now shows the
  transferred size beside the resolution (e.g. `1200 × 630px · image · 124 KB`),
  read from the browser's resource timing — no extra network request.

### Changed

- The website Open Graph image is now a static `og-image.png` instead of the
  dynamic `opengraph-image` route, so link unfurls use the designed asset.

### Fixed

- The hover and selection overlay colour swatches now repaint the overlay live
  the moment you change them — previously they persisted to storage but had no
  visible effect.
- The colour picker focuses its hex input on swatch click (was throwing a
  TypeError trying to `.select()` the swatch button).
- The background script no longer logs expected "cannot be scripted" /
  "could not establish connection" errors on pages Chrome refuses to script
  (`chrome://`, the Web Store, devtools); it ships a disabled state instead.

## [1.4.0] — 2026-05-23

### Added

- **Measurement guides in inspect mode (VisBug-style).** Hovering an
  element now draws dashed axis guide lines through its four edges,
  spanning the page. With one element selected, hovering another shows
  edge-to-edge distance pills — the gap on the open axis plus the
  side-edge offsets; a contained element shows its four inset gaps
  instead. The pills are a session-only visual aid (never recorded).
- **Drag-to-resize handles.** The selected element shows 8 handles
  (four corners + four edge midpoints). Dragging resizes live — the
  orange outline + `W × H` label track instantly and the Design tab's
  width/height fields update during the drag. On release the new
  `width`/`height` land in the Changes tab as a grouped "Resize" entry
  and export as CSS. Edge handles change one dimension, corners change
  both; resizing from the Design tab keeps the handles in sync.
- **Drag-to-move the selected element.** Dragging the body of the
  selected element (anywhere outside the 8 resize handles) moves it
  live — the Design tab's X / Y fields tick along, the orange outline
  follows the cursor, and the change persists through the change-tracker
  as a grouped "Move" entry that exports as CSS. Holding Shift constrains
  motion to the dominant axis. Elements that were `position: static`
  auto-promote to `relative` on first drag so `left` / `top` become
  live (the promotion is captured into the same Changes entry, so undo
  reverts it together). In multi-select, dragging any selected member
  moves the whole set together as a single undo step.
- **Shift-click multi-select on the canvas.** Shift-clicking elements
  on the page adds them to the multi-select set (previously only the
  Layers-tab toggle did this) and draws the pixel spacing between the
  selected elements. Native text selection is suppressed while
  inspecting so shift-click never highlights page text.

### Internal

- Removed the dead session-only 8-handle resize block in
  `content/design-mode.ts` (and its unreachable
  `SHOW_RESIZE_HANDLES` / `HIDE_RESIZE_HANDLES` message handlers); the
  new inspect-mode resize supersedes it and routes through the
  change-tracker so edits ship.
- `dev:link` script (`npm run dev:link`) symlinks a worktree's
  `packages/extension/dist` to the main clone's, so parallel-agent
  worktrees (Conductor, etc.) share one build folder and Chrome reloads
  a single extension.
- Removed the `vercel` CLI devDependency from `mcp-cloud` (run
  `vercel dev` via `npx`); drops ~250 transitive packages and takes
  `npm audit` to zero.

## [1.3.0] — 2026-05-20

### Added

- **Real agent-presence everywhere.** The MCP status indicator now
  distinguishes three states — offline, running (transport up but
  no agent attached), and connected (transport up AND an agent has
  talked to the relay in the last 5 minutes). The Send-to-Agent
  button enables only in the connected state.
  - In **Local mode**, the local server's WebSocket connection is
    itself proof of an attached agent (the MCP client process
    spawned it), so `HELLO` carries `agentConnected: true`
    immediately.
  - In **Cloud / Self-hosted mode**, the relay tracks per-tenant
    presence in Redis with a 5-minute TTL; every authenticated
    `/api/mcp` POST refreshes it. A new `/api/extension/stream`
    SSE endpoint pushes initial state on connect and 1→0
    transitions when the TTL expires.
- **Cloud is now the default MCP mode for fresh installs.**
  Existing users keep whatever `dm-mcp-mode` was stored — no
  migration. The Settings mode picker order is now
  **Cloud · Local · Self-hosted**.
- **Product Hunt badge in the Contribute panel.** The "Spread the
  word" tier now embeds the live Product Hunt badge from
  `api.producthunt.com`. The same badge appears on the homepage
  hero and in the website footer.

### Changed

- **Mode picker order** flipped to Cloud · Local · Self-hosted in
  both the extension Settings view and the website's `/mcp` page,
  reflecting the new default.
- **Canonical relay URL** in the extension (`content/index.ts` +
  `sidepanel.ts`) is now the apex `mcp.designmode.app` instead of
  `www.mcp.designmode.app`. The `www` subdomain still serves the
  routes but is no longer the default; the 307 redirect was
  retired at the Vercel domain layer.
- **Homepage HeroShowcase** leads with the cover screenshot on the
  left and feature bullets on the right (was the reverse). The
  "Made for the vibe-coding loop" title/body stacks vertically at
  every breakpoint (was a side-by-side grid at lg+). The homepage
  top slab uses the same yellow gradient as every other page (the
  muted-grey override was removed). New `hero.png` shot sits below
  FAQ, just above the footer.
- **Full website rebuild on the Mainline template** — new homepage,
  About, Contact, Privacy, Demo, MCP, and Features pages. `/faq`
  and `/pricing` removed; `/features` added. Light-mode-only
  lock-in. Navbar widened and re-styled, primary CTA unified
  across the site.

### Fixed

- **Layer-move origin preservation** — moving a layer in the Layers
  tab no longer corrupts the change-tracker's stored origin (was
  causing the diff to lose track of the original position for
  moved layers).
- **Hydration warning on `<html>`** — `suppressHydrationWarning`
  added to the root tag in `layout.tsx` so night-mode browser
  extensions (Night Eye, Dark Reader variants) injecting attributes
  like `data-nm-theme="dark"` no longer trigger a React warning.
- **Wrong-product OG image** replaced with Design Mode artwork
  rendered via Next.js's `next/og` dynamic image route at
  `/opengraph-image`.

### Internal

- **Website dep cleanup.** Removed 7 unused shadcn primitives
  (`checkbox`, `form`, `input`, `label`, `select`, `switch`,
  `textarea`) and 10 dead npm dependencies
  (`@hookform/resolvers`, `@radix-ui/react-{checkbox,label,select,switch}`,
  `motion`, `next-safe-action`, `react-hook-form`, `react-icons`,
  `zod`). Pruned orphaned `--chart-*` and `--sidebar*` CSS tokens
  from `globals.css`. Removed duplicate `public/icon.png` (Next.js
  auto-discovers the file-convention `src/app/icon.png`). Net
  diff: −1,198 / +7.

### Security

- **postcss CVE override.** Pinned `postcss: ^8.5.10` via root
  `package.json` overrides to neutralise GHSA-qx2v-qp2m-jg93 (XSS
  via unescaped `</style>` in CSS stringify output) inside `next`'s
  transitive tree. Website `npm audit` is now clean.
  `packages/mcp-cloud` still surfaces 16 advisories — all in the
  `vercel` CLI's dev-only transitive tree; not shipped to
  production users; re-audit each quarter.

## [1.2.0] — 2026-05-19

### Added

- **Contribute panel.** New heart-handshake icon in the side panel
  header (between Theme and Help) opens a full-page Contribute
  overlay. Three tiered sections — Spread the word (Star the repo,
  Review on the Chrome Web Store, Share with your network), Help
  improve it (Report an issue, Start a discussion, Open a pull
  request), and Support the project (Sponsor on GitHub). The
  "Share with your network" action copies a short prefilled blurb
  to the clipboard. No new permissions; clipboard write only.

### Fixed

- **Canonical website URL.** Five docs/metadata references to
  `design-mode.dev` were rewritten to `designmode.app` — the bug
  template's scope dropdown, `FEATURES.md` website note,
  `PRIVACY.md` website section, `README.md` website paragraph, and
  the Next.js `metadataBase` in `website/src/app/layout.tsx` (which
  otherwise emitted the wrong canonical / OG / Twitter URLs).
- **Diagnostics label alignment.** "Design Mode:" was butting up
  against the version in `Copy diagnostics` output because the
  label-padding helper padded to 12 chars instead of 13. Now padded
  to 13.

### Internal

- **CodeQL `js/identity-replacement` cleanup.** Removed a dead
  `.replace(/[-]/g, '-')` no-op in the Changes-tab filter regex
  builder.
- **Dependabot config tightened.** Per-ecosystem
  `open-pull-requests-limit: 3` plus explicit `ignore` lists for
  the deferred majors (zod 4, TS 6, Vite majors, React 19, Next
  majors, Vercel majors, `@types/node` majors, redis 5, eslint 9)
  so the weekly scan can't flood the queue again.
- **FEATURES.md §5.1** rewritten to list all four header icons
  (Theme, Contribute, Help, Settings) in order; **`docs/e2e-testcases.md`**
  gained Phase 0.6 — Header overlay panels (Help, Contribute) — with
  8 manual test rows covering open/close, link targets, clipboard
  flows, mutual exclusivity, and theme parity.

## [1.1.0] — 2026-05-14

### Added

- **In-panel Help view.** New `?` icon in the side panel header
  opens a full-panel Help overlay with a "Report an issue" link
  straight to GitHub Issues, a "Copy diagnostics" button that
  captures Design Mode version + Chrome + OS + theme to the
  clipboard, plus quick links to README, PRIVACY.md, and the
  security disclosure email. No new permissions — clipboard write
  only, environment metadata only.
- **Alt+1 / Alt+2 / Alt+3 tab navigation** — keyboard shortcuts to
  jump straight to Layers / Design / Changes from anywhere in the
  side panel. Documented in `docs/e2e-testcases.md` Phase 0.10.

### Changed

- **Versioning policy: `mcp-cloud` synced to the extension's
  version line.** Was on an independent `0.x` track; from this
  release on, all four packages (extension, mcp-local, mcp-cloud,
  shared) plus the website ship at the same number. One-time jump
  from `0.1.0` → `1.1.0` for mcp-cloud. No protocol changes.
- **CLAUDE.md is now a public project guide.** Captures build
  commands, security baseline, monorepo patterns, documentation
  conventions, label taxonomy, CI / dependency hygiene, GitHub
  Discussions, and the full release-readiness checklist.
  Maintainer-specific workflow rules moved out of the repo entirely.
- **Website homepage and `/mcp` route refresh.** Homepage hero +
  overview row resized and aligned with the footer; `/mcp`
  rewritten as a three-mode tour (Local / Cloud / Self-hosted) with
  copy-ready config snippets for Claude Desktop, Cursor, and Claude
  Code.
- **README rework.** 60-second install path at the top, "What is
  it" intro, three-ways-to-connect summary, technical content gated
  behind "For contributors & developers".

### Fixed

- **`mcp-local` TypeScript build.** npm had hoisted `zod 4.3.6` to
  the project root while the MCP SDK's `server.tool()` overloads
  only compile cleanly against Zod 3.x. Pinned `zod` to `3.25.76`
  via a root direct dep + `"overrides": { "zod": "$zod" }` so every
  transitive consumer (the MCP SDK included) resolves the same 3.x.

### Internal

- **`.github/` directory added:**
  - Issue forms — `bug_report.yml`, `feature_request.yml`,
    `config.yml` (disables blank issues, routes security to
    SECURITY.md, routes Q&A to /discussions).
  - `pull_request_template.md` with scope / test-plan / security
    checklists.
  - `FUNDING.yml` for the repo Sponsor button.
  - `workflows/ci.yml` — runs `npm run verify` on every PR + push
    to main.
  - `workflows/codeql.yml` — JS/TS static security analysis on PRs +
    weekly cron.
  - `workflows/stale.yml` — labels inactive issues at 45 days / PRs
    at 14 days, converts stale PRs to draft, closes after the
    respective windows. Exempts `pinned` / `security` /
    `help wanted` / `good first issue` / `regression` / `wip`.
  - `workflows/release.yml` — fires on `v*.*.*` tag push, builds
    the extension, attaches `design-mode-extension.zip` to a new
    GitHub Release, uses the matching `CHANGELOG.md` section as the
    release body.
  - `dependabot.yml` — weekly grouped patch/minor PRs across all 6
    npm directories + `github-actions`.
- **Label taxonomy created** via `gh label create`: `triage`,
  `needs-info`, `needs-repro`, `stale`, `scope:{extension,
  mcp-local, mcp-cloud, shared, website, docs, build}`, `security`,
  `regression`, `breaking-change`, `pinned`, `wip`.
- **GitHub Discussions enabled** with the default category set;
  welcome post pinned.

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
