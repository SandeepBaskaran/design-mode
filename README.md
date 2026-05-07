# Design Mode ◆

> Design directly in your browser. Your agent writes the code.

A free, open-source Chromium extension that turns any website into a live design surface. Edit layout, type, colour, spacing and structure with visual controls — then ship the result straight to Claude Code, Cursor, or any AI coding agent over MCP. No mock files, no copy-paste.

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
- **Animation & motion** — Structured editor with 12 built-in `dm-*` keyframes (`dm-fade-in`,
  `dm-slide-up`, `dm-pulse`, `dm-bounce`, …) auto-injected on use, full longhand controls
  (duration, timing, delay, iterations, direction, fill, play state), and a ▶ Preview button
  that re-triggers the animation cleanly.
- **Transition editor** — Per-property breakdown (property / duration / timing / delay) plus
  ▶ Preview that flashes a contrast value for the configured duration so you can see the curve.
- **Changes log** — Every edit grouped by element. View Original / View Changes toggle,
  single-change revert (actually reverses the action), batch-apply to all matching elements
  with the zap icon showing `×N` match count, click any change to scroll-and-highlight the
  affected element on the page.
- **Capture modes** — Camera-button setting: `clipboard` / `download` / `both`, persisted
  across captures with an inline confirmation toast.
- **Comments** — Yellow pin sticky notes anchored to elements; export with the prompt.
- **Presets** — Save current element styles as named presets; site-token presets surfaced as
  searchable dropdowns; cross-site sync via `chrome.storage.sync`.
- **Compact prompt format** — `Copy Prompt` produces an LLM-optimised, ~8× smaller markdown
  format with framework + styling-system detection, source-file hints, and grep-ready selectors.
- **MCP server** — Real-time WebSocket bridge between extension and 6 MCP tools your agent
  can call: `get_changes`, `apply_changes`, `clear_changes`, `get_session_summary`,
  `export_changes` (CSS / Tailwind / SCSS / JSX), and `get_screenshot` (PNG of the viewport
  or a single element via a unique CSS path, returned as an MCP image block). Spring +
  easing curves come through inside the underlying CSS values, so they ship in the regular
  change stream.
- **Keyboard-first** — Strict numeric inputs, arrow stepping (+1 / +10 with Shift), Ctrl+Z / Ctrl+Shift+Z.

## Repo layout

```
design-mode/
├── packages/
│   ├── extension/    Chrome extension (Manifest V3 side panel, Vite, TypeScript)
│   ├── server/       MCP companion + WebSocket bridge (Node.js, TypeScript)
│   └── shared/       Shared types, message schemas, constants
├── website/          Single-page docs (Next.js 14)
├── docs/             Project docs (e2e-testcases.md)
├── icons/            Extension icons (16 / 48 / 128 PNG + chrome.svg)
└── package.json      npm workspaces root
```

## Quick start

### 1. Install

```bash
npm install
```

This installs every workspace (`extension`, `server`, `shared`, `website`) in one shot.

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
claude mcp add design-mode -- npm start --prefix /path/to/design-mode/packages/server
```

Or add manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "design-mode": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/path/to/design-mode/packages/server"
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
| `Ctrl+Z` / `Cmd+Z` | Undo last change |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `↑` / `↓` on numeric field | Increment / decrement by 1 |
| `Shift+↑` / `Shift+↓` | Step by 10 |
| `Tab` in Design tab | Cycle inputs |
| `Ctrl+Enter` in comment | Submit |
| `Escape` | Cancel comment / deselect |

## Development

```bash
npm run dev:extension   # rebuild extension once (then refresh in chrome://extensions)
npm run dev:server      # start MCP/WebSocket bridge with tsx watch
npm run dev:website     # next dev for the docs site
npm run build           # build extension + website
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
npm run prepublish:check
```

runs the full build then prints the e2e checklist reminder. The checklist covers:

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
- The marketing site at `design-mode.dev` loads Google Fonts and (when configured
  via `NEXT_PUBLIC_GA_ID`) Google Analytics. Forks ship without analytics by default.
- Vulnerability reports: [SECURITY.md](./SECURITY.md).

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the build/run flow,
hard rules (no outbound network, no inline-style writes for tracked changes),
and where to file issues vs. security reports.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](./LICENSE). Fork it, extend it, ship it.
[Get in touch](mailto:hello@sandeepbaskaran.com) for custom integrations.
