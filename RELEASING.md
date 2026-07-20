# Releasing Design Mode

Releases are gated on the maintainer's explicit consent — never
auto-trigger a tag or release. When asked to "cut a release":

## Recommending the next version

Design Mode follows semver (`MAJOR.MINOR.PATCH`). Recommend the
bump based on the diff since the last `v*.*.*` tag:

- **PATCH** — bug fixes only, no new features, no API/behaviour
  changes that contributors would notice.
- **MINOR** — new features, new shortcuts, new tabs/sections, new
  MCP tools, new settings — backwards-compatible additions.
- **MAJOR** — anything that breaks existing user flows (removed
  shortcuts, removed Design tab sections, changed message-routing
  protocol, removed MCP tools, breaking PRIVACY.md changes).

Always present the recommendation **with reasoning** (one line per
notable diff item) before the maintainer confirms.

## What gets pushed with a new version

A version bump touches multiple files — list them explicitly when
recommending the bump:

- `package.json` (root + every workspace that ships an artifact:
  `packages/extension`, `packages/mcp-local`, `packages/mcp-cloud`,
  `packages/shared`, `website` if relevant).
- `packages/extension/manifest.json` → `version` field.
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
- Release zip filename: **always** `design-mode-extension.zip`.
  `.github/workflows/release.yml` builds and attaches it
  automatically when the tag is pushed. Never produce per-version
  filenames; replace the existing asset.
- **Before any push that includes extension changes (or any push
  preceding a release tag), regenerate the local zip:**
  `npm run package:extension` from repo root. This rebuilds the
  extension and overwrites
  `packages/extension/design-mode-extension.zip`. The zip itself is
  gitignored (it never lands in the repo history), but a fresh
  local copy is required so the maintainer can upload it to the
  Chrome Web Store immediately after the GitHub Release fires.
  Verify the file's mtime is newer than the latest commit touching
  `packages/extension/` before pushing.
- The tag push is the maintainer's explicit consent; the workflow
  only fires after it.
- Chrome Web Store upload is **manual** — there is no automation
  API. Upload the freshly-built local
  `packages/extension/design-mode-extension.zip` through the
  developer dashboard. (It is byte-identical to the asset on the
  GitHub Release page, but uploading the local copy avoids a
  download round-trip.)
