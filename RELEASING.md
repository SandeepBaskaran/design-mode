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
  `packages/extension`, `packages/cli`, `packages/mcp-local`, `packages/mcp-cloud`,
  `packages/shared`, `website` if relevant).
- `packages/extension/public/manifest.json` → `version` field (the
  single merged manifest that serves both Chrome and Firefox).
- `packages/shared/src/constants.ts` → `APP_VERSION`.
- `packages/cli/src/remote.ts` and `packages/mcp-local/src/agent-cli.ts` → MCP client metadata.
- Root `package-lock.json` → root and every workspace version; keep dependency resolutions unchanged.
- `packages/mcp-local/src/bin/cli.ts`, `mcp-server.ts`, `owner-bridge.ts`,
  `websocket-server.ts` → any embedded version constants.
- `packages/mcp-cloud/api/mcp.ts`, `api/extension/stream.ts`, and
  `website/src/components/site/json-ld.tsx` → embedded public versions.
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
  (Chrome Web Store), `design-mode-addon.zip` (Firefox / AMO) and
  `designmode-for-safari.zip` (Safari, GitHub Releases only).
  The Chrome and Firefox zips are **byte-for-byte identical** — the
  single `dist/` + merged `manifest.json` are valid Chrome and Firefox
  at once; the two names exist only so each store gets a recognisable
  file. The Safari zip is a separate `dist-safari/` build (Web Inspector
  tab, no side panel). `.github/workflows/release.yml` builds and
  attaches **all three** automatically when the tag is pushed. Never
  produce per-version filenames; replace the existing assets.
- The release workflow first runs `npm run verify` on the tagged commit
  and checks that the tag matches the `version` in root `package.json`
  and `packages/extension/public/manifest.json`. A tag on a commit that
  fails either check publishes nothing — fix on `main`, delete the tag,
  and re-tag the fixed commit.
- **Before any push that includes extension changes (or any push
  preceding a release tag), regenerate the local zips:**
  `npm run package:extension:all` from repo root. This rebuilds the
  extension and overwrites all three of
  `packages/extension/design-mode-extension.zip`,
  `packages/extension/design-mode-addon.zip` and
  `packages/extension/designmode-for-safari.zip`. The zips are gitignored
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
   (Firefox confirming it uses `background.scripts`), and any other warnings only after reviewing them against Firefox 140 support.
   Do not pre-accept a consent-key/minimum-version warning.
2. Upload `packages/extension/design-mode-addon.zip` at
   <https://addons.mozilla.org/developers/> → "Submit a New Version".
   (Identical content to the Chrome zip; the `-addon` name is just for
   clarity. The same file loads locally via `about:debugging` →
   "Load Temporary Add-on".)
3. AMO also asks for the source used to produce that zip. From a clean
   checkout of the tagged commit run `npm run package:firefox-source`.
   That writes `~/Downloads/design-mode-firefox-source-<version>.zip`
   (version taken from root `package.json`). Upload that file as the
   reviewer source alongside `design-mode-addon.zip`. Build steps for
   reviewers are in `SOURCE-BUILD-README.md` inside the archive
   (`npm ci && npm run package:extension:firefox`).
4. The Gecko id is `sandeepbaskaran98@gmail.com`
   (`browser_specific_settings.gecko.id`) with `strict_min_version`
   `140.0` (native data-collection consent + MV3 sidebar). Firefox 139 and
   earlier cannot install or run 3.2.0. Keep the id stable
   across versions — it is the add-on's identity.
5. Review the manifest's `browser_specific_settings.gecko.data_collection_permissions`
   and store disclosures against [PRIVACY.md](PRIVACY.md) for the exact artifact.
   Required `locationInfo` covers the disclosed IP-derived location; optional
   `technicalAndInteraction` covers technical/interaction analytics and unknown-only
   fixed diagnostic descriptions. The sender requires the optional grant, fails closed when
   native permissions are absent/unavailable, and stops on revocation. Core editing
   and clipboard export still work when optional analytics is denied. Firefox's
   native install/update consent and the real optional-denial/re-grant flow must be
   verified on the exact artefact; required location alone must never enable analytics.
   Configured MCP page/tool transfer is a separate disclosure review, not authorised
   by an analytics category. Confirm its native/store disclosure before publication.
   The source no longer supports Firefox 139 or earlier and has no fallback opt-in UI.
   See [ANALYTICS.md](packages/extension/ANALYTICS.md). Normal packaging commands do not
   load `.env.analytics.local`; configured release packaging is a distinct gate.
6. Expect **manual review**: `<all_urls>` host access + `scripting`
   are broad permissions and trigger human review. AMO may request the
   build steps (`npm ci && npm run build:extension`).
7. Firefox has no `sidePanel` API — the extension uses `sidebar_action`
   (toolbar button + View menu toggle the sidebar; `Alt+D` opens it via
   `sidebarAction.open()` in the command handler). Pop-out window and
   Picture-in-Picture are Chrome-only and absent on Firefox by design.


### Safari (manual, GitHub Releases plus Apple)

Upload `packages/extension/designmode-for-safari.zip` from the same
tagged build. Safari loads a temporary extension from
`packages/extension/dist-safari` (Settings → Developer → Add Temporary
Extension). App Store / Developer ID distribution remains a separate
maintainer step; the GitHub Release is the canonical zip.

### npm CLI (manual; the tag does not publish)

The release workflow does not publish `@designmode-app/cli`. After the
GitHub Release exists, publish the verified tarball yourself:

```sh
npm whoami
# Must be an account that can publish under the designmode-app scope.
# npm will prompt for a 2FA OTP; do not paste the OTP into chat or commit it.

npm publish /path/to/designmode-app-cli-<version>.tgz --access public
# Example for 3.2.0, after a local pack or the verified release tarball:
#   npm publish ./designmode-app-cli-3.2.0.tgz --access public

# Alternative, from a clean checkout of the tagged commit (runs prepack/build):
#   cd packages/cli && npm publish --access public
```

Then confirm the registry:

```sh
npm view @designmode-app/cli version
```

See [packages/cli/PUBLISHING.md](packages/cli/PUBLISHING.md) for the
package contract. Prefer `npm publish <tarball>` of the tarball you
already installed and tested, rather than publishing a fresh rebuild.

## Publication checklist (after `npm run verify` is green)

Do not push a `v*.*.*` tag until the maintainer has confirmed the
version and the pre-tag checklist above is complete.

1. Merge the release branch into `main` with a normal (non-force) push
   of `main` to `origin`.
2. Create an annotated tag `vMAJOR.MINOR.PATCH` on that `main` commit
   and push the tag. **(a)** The tag push is what triggers
   `.github/workflows/release.yml`. That workflow runs `npm run verify`,
   checks that the tag matches root `package.json` and
   `packages/extension/public/manifest.json`, builds the three browser
   zips, and opens a GitHub Release named for the tag with
   `design-mode-extension.zip`, `design-mode-addon.zip`,
   `designmode-for-safari.zip`, and the CHANGELOG section for that
   version.
3. **(b)** Publish the CLI to npm yourself, as documented above:
   `npm whoami`, then `npm publish <verified-tarball> --access public`
   (2FA OTP), then `npm view @designmode-app/cli version`.
4. **(c)** Firefox AMO: upload `design-mode-addon.zip` plus the source
   archive from `npm run package:firefox-source`
   (`~/Downloads/design-mode-firefox-source-<version>.zip`).
5. **(d)** Chrome Web Store: upload `design-mode-extension.zip`. Safari:
   use `designmode-for-safari.zip` (GitHub Release) and complete any
   Apple distribution steps separately.
