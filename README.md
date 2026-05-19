# Design Mode ✦

> Design directly in your browser. Your agent writes the code.

A free, open-source Chromium extension that turns any website into a live design surface. Edit layout, type, colour, spacing and structure with visual controls — then ship the result straight to Claude Code, Cursor, or any AI coding agent over MCP. No mock files, no copy-paste.

---

## 🎨 Install in 60 seconds

**1. Add it to Chrome:** **[Get Design Mode from the Chrome Web Store →](https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih)**

**2. Try it without installing:** [walk the interactive demo at designmode.app/demo](https://designmode.app/demo)

**3. Connect your AI agent (optional):** [pick one of the three modes at designmode.app/mcp](https://designmode.app/mcp)

That's it. Pin the extension to your toolbar, open any website, click the toolbar icon to open the side panel. Hover any element to highlight it; click to edit. Everything you change is tracked in the Changes tab and can be sent to your AI coding agent with one click.

---

## What is it?

Design Mode is a visual editor that lives in your browser. Instead of describing UI changes in chat ("make the button rounder, add more spacing, change the blue"), you just **drag, click, and type** on the live site — and your AI coding agent reads those edits as a real diff. It works on any URL already in your tab: localhost, staging, or production. No Storybook, no mock files, no copy-paste.

**Why people use it:**

- Restyle any website without writing a single line of CSS.
- Show your AI agent *exactly* what you want — visually — instead of describing it.
- Drop sticky-note comments on elements and ship them with the prompt.
- Export your changes as ready-to-paste CSS, Tailwind, SCSS, or JSX.
- Tighten a layout in seconds, then commit the patch. The vibe-coding loop, minus the back-and-forth.

## Three ways to connect your AI agent

Design Mode brings a coding agent inside the page through a small bridge called MCP. There are three connection modes — pick whichever fits how you work:

- **Cloud (default)** — Use the hosted relay at `mcp.designmode.app`. Paste a bearer token into your agent's config and you're done — no install, no terminal. Free with a per-tenant daily quota.
- **Local** — Run a tiny companion server on your laptop with one `npm` command. Fastest path, nothing leaves your machine — power-user mode with a terminal.
- **Self-hosted** — Same code as Cloud (open source in `packages/mcp-cloud`) on your own Vercel deployment. You own the relay and the privacy posture.

**[Full setup guide for all three modes — Claude Desktop, Cursor, Claude Code →](https://designmode.app/mcp)**

---

## Highlights

- **Visual design controls** — Typography (named weights, lucide bold/italic/underline/
  strikethrough toggles), colour pickers with a site-palette dropdown, Figma-style spacing
  box, layout / position / border / effects, transform components (translate, scale, rotate),
  pointer-events, user-select, outline, background-size/position/repeat, image & SVG download.
- **Layers panel** — Searchable Figma-style DOM tree with drag-to-reorder, visibility toggle,
  hover-to-highlight, and select-on-click that round-trips with viewport selection.
- **Persistence that survives reload** — Edits land as rules in a managed override stylesheet
  keyed by saved CSS selectors (think DevTools "Local Overrides"). Survives full page reloads,
  back/forward navigation, and SPA re-renders without inline-style stamping. Per-URL session
  storage via `chrome.storage.session`.
- **Effects (Figma-aligned)** — Inner shadow · Drop shadow (with the
  "Show behind transparent areas" toggle that swaps between
  `box-shadow`, `text-shadow`, and `filter: drop-shadow` on the fly) ·
  Layer blur · Background blur · Noise (Mono / Duo / Multi modes) ·
  Texture (with optional clip-to-shape). Noise and Texture render as
  SVG-data-URI overlays via a `::after` pseudo-element so they don't
  disturb layout.
- **Motion section** — Split out from Effects: Transition · Animation ·
  Transform · Motion path · View transition · Scroll-driven animation,
  each as its own editor. Structured editor with 12 built-in `dm-*`
  keyframes (`dm-fade-in`, `dm-slide-up`, `dm-pulse`, `dm-bounce`, …)
  auto-injected on use, full longhand controls (duration, timing,
  delay, iterations, direction, fill, play state), and a ▶ Preview
  button that re-triggers the animation cleanly.
- **Layout guide** — Figma-style overlay of Columns / Rows / Grid bars
  on the selected element via a `::before` pseudo-element. Doesn't
  affect layout; per-element session memory; survives page reload
  while the side panel is open.
- **Transition editor** — Per-property breakdown (property / duration / timing / delay) plus
  ▶ Preview that flashes a contrast value for the configured duration so you can see the curve.
- **Changes log** — Every edit grouped by element. View Original / View Changes toggle,
  single-change revert (actually reverses the action), batch-apply to all matching elements
  with the zap icon showing `×N` match count, click any change to scroll-and-highlight the
  affected element on the page.
- **Capture modes** — Camera-button setting: `clipboard` / `download` / `both`, persisted
  across captures with an inline confirmation toast.
- **Comments** — Yellow pin sticky notes anchored to elements; export with the prompt.
- **Presets** — Save current element styles as named presets across
  9 kinds (Position / Layout / Appearance / Typography / Fill / Stroke /
  Effects / Motion / Layout guide). One seeded preset per kind ships
  out of the box so you can see the structure; site-token presets
  surfaced as searchable dropdowns; cross-site sync via
  `chrome.storage.sync`.
- **Compact prompt format** — `Copy Prompt` produces an LLM-optimised, ~8× smaller markdown
  format with framework + styling-system detection, source-file hints, and grep-ready selectors.
- **MCP server** — Real-time WebSocket bridge between extension and 6 MCP tools your agent
  can call: `get_changes`, `apply_changes`, `clear_changes`, `get_session_summary`,
  `export_changes` (CSS / Tailwind / SCSS / JSX), and `get_screenshot` (PNG of the viewport
  or a single element via a unique CSS path, returned as an MCP image block). Spring +
  easing curves come through inside the underlying CSS values, so they ship in the regular
  change stream.
- **Keyboard-first** — Strict numeric inputs, arrow stepping (+1 / +10 with Shift), Ctrl+Z / Ctrl+Shift+Z.

---

# For contributors & developers

The rest of this README is for people who want to build the project from source, run the MCP server locally, or hack on the codebase. If you just want to use Design Mode, the [60-second install path](#-install-in-60-seconds) above is all you need.

## Repo layout

```
design-mode/
├── packages/
│   ├── extension/    Chrome extension (Manifest V3 side panel, Vite, TypeScript)
│   ├── mcp-local/    MCP companion + WebSocket bridge (Node.js, TypeScript)
│   ├── mcp-cloud/    Hosted MCP relay (Vercel-deployable)
│   └── shared/       Shared types, message schemas, constants
├── website/          Marketing + docs + interactive demo (Next.js 14)
├── docs/             Project docs (e2e-testcases.md)
├── icons/            Extension icons (16 / 48 / 128 PNG + chrome.svg)
├── scripts/          Repo helpers (pre-publish check)
└── package.json      npm workspaces root
```

## Quick start

### 1. Install

```bash
npm install
```

This installs every workspace (`extension`, `mcp-local`, `mcp-cloud`, `shared`, `website`) in one shot.

### 2. Build the extension

```bash
npm run build:extension
```

Output: `packages/extension/dist/`.

### 3. Load in Chrome (or any Chromium browser)

1. `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `packages/extension/dist`
4. Pin **Design Mode** in the toolbar; click it on any page to open the side panel

### 4. (Optional) Run the MCP server

```bash
npm run start
```

Starts a WebSocket bridge on `ws://localhost:9960` and an MCP server on stdio.

Add to Claude Code:

```bash
claude mcp add design-mode -- npm start --prefix /path/to/design-mode/packages/mcp-local
```

Or add manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "design-mode": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/path/to/design-mode/packages/mcp-local"
    }
  }
}
```

In the side panel, open **Settings** and enable **Auto-connect**.

### 5. (Optional) Run the docs site

```bash
npm run dev:website
```

Opens at `http://localhost:3000`.

## MCP tools

The server exposes 6 tools your agent can call:

| Tool | What it does |
|---|---|
| `get_changes` | Read all style/text/DOM changes + comments + a ready-to-paste CSS block. Each change carries the element's unique CSS `selector` — feed that back into `get_screenshot` or `apply_changes` to address the exact element. |
| `apply_changes` | Push CSS back to the browser for live preview (single change or batch — pass an array of `{ elementId, styles }`) |
| `clear_changes` | Reset the session |
| `get_session_summary` | Connection status, active sessions, counts (use as a health check before `apply_changes`) |
| `export_changes` | Emit changes as `css`, `tailwind`, `scss`, or `jsx` (camelCase inline style objects) |
| `get_screenshot` | Capture a PNG of the viewport, or pass a unique `selector` / `elementId` to crop to one element. Generic selectors that match >1 element fail with a list of candidate paths. Returned as an MCP image block. |

Spring physics and cubic-bezier easing curves come through inside the underlying CSS
values (`transition: all 0.3s cubic-bezier(...)`) — there's no separate "apply spring"
tool because animations are CSS, and CSS belongs in `apply_changes` like everything else.

Run `npm start` for the full ASCII banner.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+D` | Toggle the side panel |
| `Alt+I` | Toggle inspect mode |
| `Alt+1` / `Alt+2` / `Alt+3` | Jump to Layers / Design / Changes tab |
| `Alt+A` | Add a comment on the selected element |
| `Alt+F` | Freeze / resume animations on the page |
| `Alt+S` | Screenshot the selected element |
| `Alt+E` | Copy generated CSS to clipboard |
| `Delete` | Remove the selected element |
| `Ctrl+Z` / `Cmd+Z` | Undo last change |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Cmd/Ctrl+click` on a layer | Toggle that layer into the multi-select set |
| `Shift+click` on a layer | Range-select between the previous click and this one |
| `↑` / `↓` on numeric field | Increment / decrement by 1 (or 0.1 for unitless props) |
| `Shift+↑` / `Shift+↓` | Step by 10 (or by 1 for unitless props) |
| `Tab` in Design tab | Cycle inputs |
| `Ctrl+Enter` in comment | Submit |
| `Enter` on a Layers row | Toggle collapse / expand |
| `Escape` | Cancel comment → tear down multi-select → exit inspect → deselect |

Shortcuts are suppressed while a page-side `<input>` / `<textarea>` /
`contenteditable` is focused, so typing in a form field never
accidentally triggers a panel action. `Escape` is the only exception.

## Development

```bash
npm run dev:extension   # rebuild extension once (then refresh in chrome://extensions)
npm run dev:mcp-local   # start the local MCP server + ws://localhost:9960 bridge
npm run dev:mcp-cloud   # run the hosted MCP relay locally (Vercel dev)
npm run dev:website     # next dev for the docs site
npm run build           # build extension + website
npm run package:extension # build + zip dist into packages/extension/design-mode-extension.zip
npm run clean           # nuke all build artefacts
```

## Test fixture & debug helpers

The fastest way to verify a change end-to-end is to load the bundled fixture and walk
its checklist:

```
packages/extension/test-fixtures/index.html       # open via file://
packages/extension/test-fixtures/README.md        # 5-step e2e checklist
```

Once the side panel is attached to a page, two helpers are exposed in DevTools console
for ad-hoc inspection:

- `__dm.dump()` — current in-memory `styleChanges` / `textChanges` / `domChanges` arrays
- `__dm.applied()` — current text of `<style id="dm-applied-styles">` (the override sheet)

## Testing before publish

Walk through every phase in [`docs/e2e-testcases.md`](./docs/e2e-testcases.md) against the
freshly-built `packages/extension/dist/`. The convenience script

```bash
npm run verify
```

runs `scripts/prepublish-check.mjs` — full build, manifest sanity, MCP tool-count
guard, MCP bundle integrity, website build — then prints the e2e checklist
reminder. The manual checklist covers:

- Activation, MCP connection, and tab toggle
- Inspect / click select, hover stability, escape-to-deselect
- Every Design tab category (typography, colours, spacing box, layout, position, border, effects, media)
- Layers tab (drag, visibility, search, click-select)
- Comments lifecycle (create / edit / delete / pin click)
- Changes tab — recording, View Original / View Changes, revert (DOM reversal),
  batch apply (zap visual state), Clear All, persistence across reloads
- Copy Prompt + Send to Agent
- MCP server start / connection / tool calls
- Cross-feature integration regressions

## Tech stack

- **Extension**: Vite, TypeScript, Chrome Manifest V3 side panel
- **Server**: Node.js, MCP SDK, WebSocket (`ws`), TypeScript
- **Website**: Next.js 14 (App Router), TypeScript, Sass, Manrope
- **Monorepo**: npm workspaces

## Privacy & security

- The extension is local-only — no telemetry, no analytics, no remote logging.
  Edits live in `chrome.storage` on your machine; the optional MCP server runs
  on `localhost`. Full details: [PRIVACY.md](./PRIVACY.md).
- The marketing site at `designmode.app` loads Google Fonts and (when configured
  via `NEXT_PUBLIC_GA_ID`) Google Analytics. CTA clicks and outbound links on the
  site emit anonymous GA events; forks ship without analytics by default
  (events safely no-op when `NEXT_PUBLIC_GA_ID` is unset).
- Vulnerability reports: [SECURITY.md](./SECURITY.md).

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the build/run flow,
hard rules (no outbound network, no inline-style writes for tracked changes),
and where to file issues vs. security reports.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](./LICENSE). Fork it, extend it, ship it.
[Get in touch](mailto:hello@sandeepbaskaran.com) for custom integrations.
