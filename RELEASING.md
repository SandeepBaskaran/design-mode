# Releasing Design Mode

Releases are gated on the maintainer's explicit consent — never
auto-trigger a tag or release. When asked to "cut a release":

## Recommending the next version

Design Mode follows [semver](https://semver.org) (`MAJOR.MINOR.PATCH`).
Pick the bump from the diff since the last `v*.*.*` tag:

- **MAJOR** (`a`) — a landmark release: a complete architecture
  overhaul or rewrite, **or** anything that breaks an existing user
  flow (removed shortcut, removed Design-tab section, changed
  message-routing protocol, removed MCP tool, breaking PRIVACY.md
  change). Reserve it for milestones — routine work is never a MAJOR.
- **MINOR** (`b`) — backwards-compatible additions: a new feature,
  shortcut, tab/section, MCP tool, setting, or browser target. The
  everyday "we shipped something new" bump.
- **PATCH** (`c`) — bug fixes and minor polish only; no new features,
  no behaviour changes a contributor would notice.

**Each component is an independent integer with no upper bound — they
do NOT roll over at 9.** Successive feature releases go
`1.9.0 → 1.10.0 → 1.11.0`, never `1.9.0 → 2.0.0`. A component resets to
`0` only when something to its left increments: a MAJOR bump zeroes
MINOR + PATCH (`1.7.3 → 2.0.0`), a MINOR bump zeroes PATCH
(`2.4.6 → 2.5.0`), a PATCH bump touches only itself (`2.5.0 → 2.5.1`).
Bump exactly one component per release.

Always present the recommendation **with reasoning** (one line per
notable diff item) before the maintainer confirms.

## What gets pushed with a new version

A version bump touches multiple files — list them explicitly when
recommending the bump:

- `package.json` (root + every workspace that ships an artifact:
  `packages/extension`, `packages/mcp-local`, `packages/mcp-cloud`,
  `packages/shared`, `website` if relevant).
- `packages/extension/public/manifest.json` → `version` field (the
  single merged manifest that serves both Chrome and Firefox).
- `packages/shared/src/constants.ts` → `APP_VERSION`.
- `packages/mcp-local/src/bin/cli.ts`, `mcp-server.ts`,
  `websocket-server.ts` → any embedded version constants.
- `CHANGELOG.md` → new `## [x.y.z] — YYYY-MM-DD` section at the top
  with Added / Changed / Fixed / Security / Internal subsections.
- `README.md` — only if install instructions or feature list
  changed; not for routine bumps.

## Pre-tag checklist (before `git tag v*.*.*`)

1. `npm run verify` exits 0 from repo root.
2. `docs/e2e-testcases.md` manual walk done (new features have new
   rows; new shortcuts have new Phase 0.10 rows).
3. `CHANGELOG.md` updated with the new version section.
4. All version constants in sync (see list above). Search the repo
   for the previous version string to catch stragglers.
5. PRIVACY.md updated if any new outbound call / new
   `chrome.storage` key / new external service was added.
6. SECURITY.md updated if the security model changed.
7. `git status` clean — no stray dist files, no `.DS_Store`, no
   secrets.

## Tagging + release zip

- Tag name: **always** `vMAJOR.MINOR.PATCH` (lowercase `v`, no
  pre-release suffix unless explicitly requested).
- Release zip filenames: **always** `design-mode-extension.zip`
  (Chrome Web Store) and `design-mode-addon.zip` (Firefox / AMO).
  **They are byte-for-byte identical** — the single `dist/` + merged
  `manifest.json` are valid Chrome and Firefox at once; the two names
  exist only so each store gets a recognisable file.
  `.github/workflows/release.yml` builds and attaches **both**
  automatically when the tag is pushed. Never produce per-version
  filenames; replace the existing assets.
- **Before any push that includes extension changes (or any push
  preceding a release tag), regenerate the local zips:**
  `npm run package:extension:all` from repo root. This rebuilds the
  extension once and overwrites both
  `packages/extension/design-mode-extension.zip` and
  `packages/extension/design-mode-addon.zip`. The zips are gitignored
  (they never land in the repo history), but fresh local copies are
  required so the maintainer can upload them to the stores immediately
  after the GitHub Release fires. Verify each file's mtime is newer
  than the latest commit touching `packages/extension/`.
- The tag push is the maintainer's explicit consent; the workflow
  only fires after it.

### Chrome Web Store (manual)

Upload the freshly-built local
`packages/extension/design-mode-extension.zip` through the developer
dashboard. Chrome reads `side_panel` / `service_worker` / the
`sidePanel` permission and ignores the Firefox-only keys
(`sidebar_action`, `background.scripts`, `browser_specific_settings`).

### addons.mozilla.org / AMO (manual)

Live listing: <https://addons.mozilla.org/firefox/addon/design-mode-add-on/>
(slug `design-mode-add-on`; the same URL is linked from the extension's
Contribute panel and README on Firefox).

Same zip, uploaded to AMO. Firefox reads `sidebar_action` /
`background.scripts` / `browser_specific_settings` and ignores the
Chrome-only `side_panel` key + `sidePanel` permission. Steps:

1. `npm run lint:extension` — `web-ext lint` must show **0 errors**.
   ~30 warnings are expected and benign: `innerHTML`
   (`UNSAFE_VAR_ASSIGNMENT`, sanitized via `sanitizeRichTextHtml`),
   Chrome-only `UNSUPPORTED_API` refs (runtime-gated, dormant on
   Firefox), the ignored `sidePanel` permission
   (`MANIFEST_PERMISSIONS`), `BACKGROUND_SERVICE_WORKER_IGNORED`
   (Firefox confirming it uses `background.scripts`), and
   `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VER` for `data_collection_permissions`
   (advisory — the key is required by AMO and ignored by older Firefox).
2. Upload `packages/extension/design-mode-addon.zip` at
   <https://addons.mozilla.org/developers/> → "Submit a New Version".
   (Identical content to the Chrome zip; the `-addon` name is just for
   clarity. The same file loads locally via `about:debugging` →
   "Load Temporary Add-on".)
3. The Gecko id is `sandeepbaskaran98@gmail.com`
   (`browser_specific_settings.gecko.id`) with `strict_min_version`
   `121.0` (MV3 background event page + sidebar). Keep the id stable
   across versions — it is the add-on's identity.
4. Data collection is declared **in the manifest** —
   `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]`
   (the extension collects nothing; localhost-only). AMO's server validator
   **rejects new submissions without this key** (hard error). Older Firefox
   ignores the key, so `strict_min_version` stays at `121.0`; the linter's
   `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VER` note about it is advisory only.
5. Expect **manual review**: `<all_urls>` host access + `scripting`
   are broad permissions and trigger human review. AMO may request the
   build steps (`npm ci && npm run build:extension`).
6. Firefox has no `sidePanel` API — the extension uses `sidebar_action`
   (toolbar button + View menu toggle the sidebar; `Alt+D` opens it via
   `sidebarAction.open()` in the command handler). Pop-out window and
   Picture-in-Picture are Chrome-only and absent on Firefox by design.
