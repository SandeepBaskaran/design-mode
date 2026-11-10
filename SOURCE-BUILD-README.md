# Building the Firefox add-on from this source archive

This archive is the minimum source needed to reproduce the Firefox
add-on (`design-mode-addon.zip`) for [AMO](https://addons.mozilla.org/)
review. It is produced from a clean git tree with
`npm run package:firefox-source`.

## Requirements

- Node.js 20.x (the GitHub release workflow uses Node 20; Node 18 or
  newer is supported)
- npm 10.x (the version bundled with Node 20 is fine)

## Build

From the root of this archive:

```sh
npm ci
npm run package:extension:firefox
```

`npm ci` verifies the included `package-lock.json`. The archive ships
`package.json` for the other monorepo workspaces so that lockfile stays
valid, but only `packages/extension` and `packages/shared` contain
source. `npm run package:extension:firefox` builds the add-on and
writes `packages/extension/design-mode-addon.zip`. You can also load
`packages/extension/dist` as a temporary add-on from
`about:debugging` → This Firefox → Load Temporary Add-on
(`manifest.json`).

Equivalent step-by-step command, if you prefer to zip by hand:

```sh
npm ci
npm run build:extension
cd packages/extension/dist
zip -rq ../design-mode-addon.zip . -x '*.DS_Store' -x '*.map'
```

## Matching the GitHub / AMO artefact

The default commands above produce a production build with analytics
left unconfigured (`distribution: "unknown"`, empty host and key).
That is the reviewable source build.

The zip attached to the GitHub Release and uploaded to AMO is produced
by the release workflow with:

```sh
DM_DISTRIBUTION=published_hint \
  DM_POSTHOG_HOST=<https-ingestion-origin> \
  DM_POSTHOG_KEY=<public-posthog-project-token> \
  npm run package:extension:release
```

Those values are injected at build time and are intentionally not in
this archive. A source build without them will not be byte-identical
to the published zip; the difference is the compiled analytics
configuration in the JavaScript bundles. Chrome and Firefox release
zips are otherwise identical. Ignore the Safari zip that the release
command also writes.

## Contents

Included:

- Root `package.json`, `package-lock.json`, and `LICENSE`
- `icons/` (copied into the add-on at build time)
- `packages/extension` build inputs (`src/`, `public/`, `build.mjs`,
  Vite/TypeScript config, `analytics-build-config.mjs`)
- `packages/shared` (the extension aliases this as `@shared`)
- Workspace `package.json` files for `packages/cli`,
  `packages/mcp-cloud`, `packages/mcp-local`, and `website`, only so
  `npm ci` can satisfy the lockfile

Excluded: website and MCP source, tests and fixtures, `node_modules`,
`dist`, caches, git metadata, environment files, and secrets.
