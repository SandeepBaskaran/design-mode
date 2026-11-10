# CLI distribution and release contract

## Confirmed naming

The maintainer reports ownership of the npm organisation `designmode-app`.
The confirmed package name is exactly `@designmode-app/cli` and the installed executable is `designmode-app`. Do not use the earlier provisional `@designmode/cli` name or `design-mode` executable for this CLI.

The package is already initialised with package.json; do not run npm init over existing metadata. For a new package, initialise it first (for example with npm init) and then set the confirmed scoped name.

Required release metadata:

- `name`: `@designmode-app/cli`
- `bin`: `designmode-app` pointing to the built CLI entry
- `publishConfig.access`: `public`

`private` is false. The package is already published; do not set it back to true.

## Publication

Pushing the annotated tag `vMAJOR.MINOR.PATCH` is the maintainer's
approval to publish. `.github/workflows/release.yml` runs `npm run verify`
on that commit, creates the GitHub Release, and then the `publish-npm`
job publishes this package. The job does not use an npm token.

Trusted publishing requirements, checked on 10 November 2026 against
<https://docs.npmjs.com/trusted-publishers>:

- Node.js ≥ 22.14.0 and npm CLI ≥ 11.5.1. The job installs npm 11.21.2
  on Node 22.
- `permissions: id-token: write` on the publish job, and
  `environment: release`.
- `npm publish --workspace @designmode-app/cli --access public --provenance`.
  Provenance is also generated automatically for a public package
  published from a public repository over GitHub Actions OIDC.
- `repository.url` in this package must identify
  `github.com/SandeepBaskaran/design-mode`. It is
  `git+https://github.com/SandeepBaskaran/design-mode.git`.

On npmjs.com → `@designmode-app/cli` → Settings → Trusted Publisher,
add a GitHub Actions publisher with:

| Field | Value |
| --- | --- |
| Organization or user | `SandeepBaskaran` |
| Repository | `design-mode` |
| Workflow filename | `release.yml` |
| Environment name | `release` |

Enable **`npm publish`**. A publisher created after 3 September 2026
allows only `npm stage publish` until direct publish is enabled, and
this workflow does not call `npm stage`. The first successful publish
must happen within two days of creating the publisher or the
configuration expires. There is no GitHub secret for npm; until this
publisher exists, the npm job fails authentication and the store jobs
still run.

`publishConfig.access` stays `public`. Do not set `private` back to
true. Do not add an `NPM_TOKEN` or paste a 2FA code into the
repository, the workflow, or chat.

Before the tag: run the repository verification and CLI tests, pack
this package, and inspect the tarball for secrets and extra files.
Confirm version, README, licence, supported Node versions and
extension/relay compatibility. After the npm job succeeds, read
`npm view @designmode-app/cli version` and smoke-test that version.
Then run `npm run release:postcheck -- --tarball <verified tarball>`
from the repository root.

If the trusted-publishing job fails, a maintainer can still publish
the same verified tarball (prefer that over a fresh rebuild) from a
checkout of the same tag:

1. Confirm scope access, version, README, licence, supported Node versions and extension/relay compatibility.
2. Authenticate in the maintainer's terminal with `npm login --auth-type=web` (browser approval). Credentials, tokens and verification codes must not enter chat, source or logs.
3. The maintainer runs `npm publish <verified tarball> --access public` (or `npm publish --access public` from this package directory) in his own interactive terminal, without `--otp`, and approves in the browser with his passkey.
4. Read the published registry metadata back and smoke-test that exact released version, then run `npm run release:postcheck -- --tarball <verified tarball>`.

Agents cannot complete the fallback themselves: without a TTY,
`npm publish` fails with `EOTP` even with `--auth-type=web`. This
fallback is not the release path. The tag remains the gate.

## User-facing usage after publication

- One-off: `npx @designmode-app/cli@latest status`
- Installed: `npm install -g @designmode-app/cli`, then `designmode-app status`
- Durable agent/team setups: pin a tested package version rather than automatically following latest.

npx runs the same npm package from a local installation or npm cache; it is not a separate package type and does not promise zero download or installation into the cache.

## Product direction

Cloud is the primary CLI audience. Support Cloud, Local and Self-hosted using the existing MCP contracts, not three separate tool engines. The previous local-only CLI requires an existing local bridge; that limitation must not be advertised as the finished cross-mode design.

Use `https://mcp.designmode.app` as the canonical cloud relay origin, with the actual MCP endpoint derived from the server implementation. Keep credentials out of arguments and logs; validate endpoints and never forward authentication through arbitrary redirects. Do not configure production accounts, issue production tool calls or publish without explicit authorisation.

PostHog project configuration and activation remain deferred by the maintainer. No analytics identity expansion is authorised.
