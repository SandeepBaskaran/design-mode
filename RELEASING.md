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
- `website/public/llms.txt` and `website/public/llms-full.txt` → current
  repository version (and the review date if you update it).
- `packages/mcp-local/src/bin/cli.ts`, `mcp-server.ts`, `owner-bridge.ts`,
  `websocket-server.ts` → any embedded version constants.
- `packages/mcp-cloud/api/mcp.ts`, `api/extension/stream.ts`, and
  `website/src/components/site/json-ld.tsx` → embedded public versions.
- `CHANGELOG.md` → new `## [x.y.z] — YYYY-MM-DD` section at the top
  with Added / Changed / Fixed / Security / Internal subsections.
- `README.md` — only if install instructions or feature list
  changed; not for routine bumps.

## Pre-tag checklist (before `git tag v*.*.*`)

1. `npm run release:preflight` then `npm run verify`, both from repo
   root and both exiting 0. Preflight is the fast identity, version,
   leftover-string, tag, npm and dirty-tree check. Leftover previous-version
   hits in CHANGELOG history, lockfiles, the website changelog, and listed
   fixtures are ignored; see `scripts/release-preflight.mjs`.
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
- Local copies of the three zips are optional. The release workflow
  builds them on the tagged commit. `npm run package:extension:all`
  from the repo root still overwrites
  `packages/extension/design-mode-extension.zip`,
  `packages/extension/design-mode-addon.zip` and
  `packages/extension/designmode-for-safari.zip` when you want to
  inspect a package before tagging. The zips are gitignored.
- The tag push is the maintainer's explicit consent; the workflow
  only fires after it. After the GitHub Release is created, three
  independent jobs on the `release` environment upload to the Chrome
  Web Store, submit to addons.mozilla.org, and publish
  `@designmode-app/cli`. One of those jobs failing does not cancel the
  others. Safari stays manual.

### Chrome Web Store

The `publish-chrome` job uploads
`packages/extension/design-mode-extension.zip` from the release job
and submits it for review with the Chrome Web Store API **v2**. The
v1.1 API stopped accepting requests on 15 October 2026. Chrome reads
`side_panel` / `service_worker` / the `sidePanel` permission and
ignores the Firefox-only keys (`sidebar_action`, `background.scripts`,
`browser_specific_settings`).

The item id in the workflow is `ighgobegfcmjagombgnfhgioflinojih`. The
API cannot create a new store item; the listing must already exist.
Review still happens in the dashboard after the API accepts the
upload. If the secrets below are unset, the job logs the missing
names and exits successfully.

### addons.mozilla.org / AMO

Live listing: <https://addons.mozilla.org/firefox/addon/design-mode-add-on/>
(slug `design-mode-add-on`; the same URL is linked from the extension's
Contribute panel and README on Firefox).

The `publish-firefox` job submits the release job's
`design-mode-addon.zip` to the listed channel with `web-ext` 10
(`web-ext sign`, AMO API v5). Firefox reads `sidebar_action` /
`background.scripts` / `browser_specific_settings` and ignores the
Chrome-only `side_panel` key + `sidePanel` permission. The same zip
loads locally via `about:debugging` → "Load Temporary Add-on".

The job also builds the reviewer source archive with
`npm run package:firefox-source` and passes it as
`--upload-source-code`. In CI the archive path is
`DM_FIREFOX_SOURCE_ZIP` (a workspace file). A local run without that
variable still writes
`~/Downloads/design-mode-firefox-source-<version>.zip`. Reviewer build
steps are in `SOURCE-BUILD-README.md` inside the archive
(`npm ci && npm run package:extension:firefox`). `--approval-timeout 0`
returns after AMO accepts the upload and validation. It does not wait
for the human review below. If the AMO secrets are unset, the job
logs the missing names and exits successfully.

`npm run verify` already runs `web-ext lint`, which must show **0
errors**. ~30 warnings are expected and benign: `innerHTML`
(`UNSAFE_VAR_ASSIGNMENT`, sanitized via `sanitizeRichTextHtml`),
Chrome-only `UNSUPPORTED_API` refs (runtime-gated, dormant on
Firefox), the ignored `sidePanel` permission
(`MANIFEST_PERMISSIONS`), `BACKGROUND_SERVICE_WORKER_IGNORED`
(Firefox confirming it uses `background.scripts`), and any other
warnings only after reviewing them against Firefox 140 support.
Do not pre-accept a consent-key/minimum-version warning.

1. The Gecko id is `sandeepbaskaran98@gmail.com`
   (`browser_specific_settings.gecko.id`) with `strict_min_version`
   `140.0` (native data-collection consent + MV3 sidebar). Firefox 139 and
   earlier cannot install or run 3.2.0. Keep the id stable
   across versions — it is the add-on's identity.
2. Review the manifest's `browser_specific_settings.gecko.data_collection_permissions`
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
3. Expect **manual review**: `<all_urls>` host access + `scripting`
   are broad permissions and trigger human review. AMO may request the
   build steps (`npm ci && npm run package:extension:firefox`, also
   written in `SOURCE-BUILD-README.md`). The workflow submits the
   version; it does not mark the review complete.
4. Firefox has no `sidePanel` API — the extension uses `sidebar_action`
   (toolbar button + View menu toggle the sidebar; `Alt+D` opens it via
   `sidebarAction.open()` in the command handler). Pop-out window and
   Picture-in-Picture are Chrome-only and absent on Firefox by design.


### Safari (manual, GitHub Releases plus Apple)

Upload `packages/extension/designmode-for-safari.zip` from the same
tagged build. Safari loads a temporary extension from
`packages/extension/dist-safari` (Settings → Developer → Add Temporary
Extension). App Store / Developer ID distribution remains a separate
maintainer step; the GitHub Release is the canonical zip.

### npm CLI

The `publish-npm` job publishes `@designmode-app/cli` from the tagged
commit with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers).
There is no `NPM_TOKEN`. The job grants `id-token: write`, installs
npm 11.21.2 on Node 22 (trusted publishing needs npm ≥ 11.5.1 and
Node ≥ 22.14.0), and runs:

```sh
npm publish --workspace @designmode-app/cli --access public --provenance
```

Provenance is requested with `--provenance` and is also generated
automatically for a public package published from a public GitHub
repository over OIDC. The job has no secret of its own, so it does
not skip when store secrets are absent. Until the trusted publisher
below is saved on npmjs.com, this job fails with `ENEEDAUTH` and the
Chrome and Firefox jobs are unaffected.

Confirm after a successful run:

```sh
npm view @designmode-app/cli version
npm view @designmode-app/cli@<version> dist.shasum
```

Or run the bundled check, which also confirms the origin tag and the
GitHub release:

```sh
npm run release:postcheck -- --tarball /path/to/designmode-app-cli-<version>.tgz
```

See [packages/cli/PUBLISHING.md](packages/cli/PUBLISHING.md).

### npm CLI (manual fallback)

If the `publish-npm` job fails, publish the verified tarball of the
same tagged commit yourself. Prefer that tarball over a fresh rebuild.
Credentials, tokens and verification codes must never enter chat,
source or logs.

```sh
npm whoami
# Must be an account that can publish under the designmode-app scope.
# If it returns 401, sign in with browser approval: npm login --auth-type=web

npm publish /path/to/designmode-app-cli-<version>.tgz --access public
# Example, after a local pack or the verified release tarball:
#   npm publish ./designmode-app-cli-<version>.tgz --access public

# Alternative, from a clean checkout of the tagged commit (runs prepack/build):
#   cd packages/cli && npm publish --access public
```

Run `npm publish` in the maintainer's own interactive Terminal without
`--otp`. npm hands off to the browser and the maintainer approves with
his passkey (Apple Passwords); no authenticator code is used. A
non-interactive agent shell cannot finish this step (npm returns
`EOTP`). The registry can take 1 to 2 minutes to list the version.
Then run the same `npm view` and `release:postcheck` commands above.

## Publication checklist (after preflight and `npm run verify` are green)

Do not push a `v*.*.*` tag until the maintainer has confirmed the
version and the pre-tag checklist above is complete.

1. Merge the release branch into `main` with a normal (non-force) push
   of `main` to `origin`.
2. Create an annotated tag `vMAJOR.MINOR.PATCH` on that `main` commit
   and push the tag. **That tag push is the release.** It triggers
   `.github/workflows/release.yml`, which runs `npm run verify`,
   checks that the tag matches root `package.json` and
   `packages/extension/public/manifest.json`, builds the three browser
   zips, and opens a GitHub Release named for the tag with
   `design-mode-extension.zip`, `design-mode-addon.zip`,
   `designmode-for-safari.zip`, and the CHANGELOG section for that
   version.
3. The same workflow then runs three jobs that depend only on the
   release job. Chrome Web Store and Firefox AMO submit the zips from
   that job. npm publishes `@designmode-app/cli` with trusted
   publishing. Confirm `npm view @designmode-app/cli version` after
   the npm job is green, then run
   `npm run release:postcheck -- --tarball <verified-tarball>`. A
   store job whose secrets are not configured logs a skip and
   succeeds. If a store or npm job fails, use the manual fallback
   documented above (store zips from the GitHub Release; npm via
   `npm login --auth-type=web` and `npm publish` without `--otp`).
4. Safari: use `designmode-for-safari.zip` from the GitHub Release and
   complete any Apple distribution steps separately.

## Maintainer setup (once)

Do this before the first tag you want published to the stores and
npm. Nothing in this list is committed. Put the secrets on the
`release` GitHub environment (Settings → Environments → `release` →
Environment secrets). Repository secrets also work; the workflow
reads whichever is visible to that environment. The publish jobs
already set `environment: release`, so required reviewers can be
added on that environment later without editing the workflow.

A secret that is missing makes its job print the missing names and
exit 0. A secret that is present but rejected fails that job only.

### Chrome Web Store

Official guide: <https://developer.chrome.com/docs/webstore/using-api>.
The publishing Google account must own the existing item
`ighgobegfcmjagombgnfhgioflinojih` and have 2-Step Verification on.

1. In Google Cloud Console, create or select a project and enable the
   Chrome Web Store API.
2. Configure the OAuth consent screen (External is fine). Add the
   publishing account as a test user only long enough to mint the
   token, then **publish the consent screen**. A refresh token minted
   while the app is in Testing expires after 7 days.
3. Create an OAuth client ID of type Web application. Add
   `https://developers.google.com/oauthplayground` as an authorized
   redirect URI.
4. Open the OAuth Playground, use your own client id and secret, and
   authorize the scope `https://www.googleapis.com/auth/chromewebstore`
   as the account that owns the store item. Exchange the code and
   copy the refresh token.
5. Copy the publisher id from the Chrome Web Store Developer
   Dashboard → Publisher → Settings.

Secret names:

| Secret | Value |
| --- | --- |
| `CWS_CLIENT_ID` | OAuth client id |
| `CWS_CLIENT_SECRET` | OAuth client secret |
| `CWS_REFRESH_TOKEN` | Refresh token from the playground |
| `CWS_PUBLISHER_ID` | Publisher id from the dashboard |

### Firefox / AMO

1. Sign in at <https://addons.mozilla.org/developers/> and accept the
   distribution agreement if that page asks for it.
2. Open <https://addons.mozilla.org/developers/addon/api/key/> and
   generate credentials. The JWT secret is shown once. Generating a
   new pair revokes the previous pair. These credentials can submit
   every add-on on the account.

Secret names:

| Secret | Value |
| --- | --- |
| `AMO_JWT_ISSUER` | JWT issuer (`user:…:…`), passed to `web-ext` as the API key |
| `AMO_JWT_SECRET` | JWT secret, passed to `web-ext` as the API secret |

The add-on id is already in the manifest
(`sandeepbaskaran98@gmail.com`). The first listing was created in the
dashboard; this job only submits later versions.

### npm trusted publisher

No npm token is stored in GitHub.

1. Open <https://www.npmjs.com/package/@designmode-app/cli> → Settings
   → Trusted Publisher → GitHub Actions.
2. Enter exactly:

   | Field | Value |
   | --- | --- |
   | Organization or user | `SandeepBaskaran` |
   | Repository | `design-mode` |
   | Workflow filename | `release.yml` |
   | Environment name | `release` |

   The filename is only `release.yml`, not a path. The environment
   name must be `release` because the publish job sets
   `environment: release`. Leave it blank and the OIDC token will not
   match.
3. Allow **`npm publish`**. A trusted publisher created after
   3 September 2026 allows only `npm stage publish` until you also
   enable direct `npm publish`. This workflow runs `npm publish`, not
   `npm stage publish`.
4. Save it within two days of the next tag. A new trusted publisher
   expires if it does not complete a successful publish within two
   days; delete the expired row and create it again.
5. `packages/cli/package.json` `repository.url` is
   `git+https://github.com/SandeepBaskaran/design-mode.git`. npm
   rejects the publish when that field does not identify this
   repository.

After the first green npm job, package settings → Publishing access
can be set to "Require two-factor authentication and disallow tokens".
Trusted publishing keeps working. That setting is optional and is not
required for the workflow.
