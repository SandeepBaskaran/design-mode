# Contributing to Design Mode

Thanks for taking the time. This is a small, focused project — most useful
contributions are bug fixes, small UX polish, and CSS-property coverage gaps.
Larger changes are welcome but please open an issue first to talk through scope.

## Repo layout

```
design-mode/
├── packages/
│   ├── extension/    Chrome extension (Manifest V3 side panel, Vite, TypeScript)
│   ├── mcp-local/    MCP companion + WebSocket bridge (Node, TypeScript, tsx)
│   ├── mcp-cloud/    Hosted MCP relay (Vercel-deployable)
│   └── shared/       Shared types, message schemas, constants
├── website/          Marketing + docs + interactive demo (Next.js 14)
├── docs/             Project docs (e2e-testcases.md)
├── scripts/          Repo helpers (pre-publish check)
└── icons/            Extension icons
```

## Getting started

```bash
# 1. Clone + install
git clone https://github.com/SandeepBaskaran/design-mode.git
cd design-mode
npm install

# 2. Build the extension
cd packages/extension && node build.mjs

# 3. Load it unpacked
#    chrome://extensions  →  Developer mode  →  "Load unpacked"
#    pick: packages/extension/dist

# 4. Open the test fixture and walk the e2e checklist
#    packages/extension/test-fixtures/index.html  (file:// URL)
#    Checklist: packages/extension/test-fixtures/README.md
```

To run the optional MCP companion server:

```bash
npm start          # from repo root — boots ws://localhost:9960 + MCP stdio
```

## What kinds of PRs are welcome

- **Bug fixes** with steps to reproduce against the test fixture or a public URL.
- **CSS-property coverage gaps** — missing things in DevTools' Styles panel that
  the side panel doesn't expose yet (e.g. multi-shadow array UI, gradient builder,
  per-component animation triggers, drag-to-scrub on numeric inputs, EyeDropper
  API on color inputs). The plan file at `/.claude/plans/` lists known gaps.
- **Lucide-icon swaps** — anywhere we still ship a serif-text glyph (B/I/U/S
  used to be one; the typography toggles now use lucide). Same kind of swap is
  welcome elsewhere.
- **Test-fixture additions** — more shapes to cover (inputs, video, SVG icons,
  flexbox edge cases).

## Hard rules

- **Do not introduce outbound network calls.** The extension talks to
  `ws://localhost:<port>` and nothing else. Anything else needs an explicit
  setting + a note in `PRIVACY.md`. See the privacy doc for the list of
  user-initiated requests that are already there (media downloads, screenshot
  capture).
- **Do not write inline `el.style[prop] = value`** for tracked changes. Go
  through `applyStyleChange()` in `packages/extension/src/content/change-tracker.ts`
  so the override stylesheet stays the single source of truth and the change
  shows up in the Changes tab and replays after reload. Inline styles are fine
  for transient effects (hover overlay, preview animations) — just not for
  things the user is "saving".
- **Do not amend or force-push to `main`.** Open a PR with a fresh commit.
- **Do not skip pre-commit hooks** (no `--no-verify`). If a hook fails, fix
  the underlying issue.
- **Do not commit secrets.** `.env*` is gitignored. The website's
  `NEXT_PUBLIC_GA_ID` is build-time-public and lives in deployment env
  (Vercel), not in code or the repo.

## Code style

- TypeScript everywhere. The shared package has a known typecheck quirk
  (it lacks `composite: true`); ignore it unless the shape changes.
- No new dependencies without a clear reason. The bundle stays small (≈100 KB
  content, ≈120 KB sidepanel gzipped to ~30 KB each). Adding a 200 KB lib for
  a small feature is a no.
- Comments only when the *why* is non-obvious. Don't narrate what the code
  already says.

## Reporting bugs

Open a GitHub issue with:
- Browser + Chrome version
- Steps to reproduce (ideally against `packages/extension/test-fixtures/index.html`)
- Expected vs. actual
- DevTools console output (`__dm.dump()` and `__dm.applied()` are useful here)

For security issues, follow [SECURITY.md](./SECURITY.md) instead — don't open
a public issue.

## License

By contributing, you agree your contributions are licensed under the project's
MIT license. See [LICENSE](./LICENSE).
