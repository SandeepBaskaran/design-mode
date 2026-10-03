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

1. Run the repository verification and CLI tests; test the exact npm pack tarball and inspect its contents for secrets and unnecessary files.
2. Confirm scope access, version, README, licence, supported Node versions and extension/relay compatibility.
3. Authenticate in the maintainer's terminal with `npm login`; credentials and verification codes must not enter chat, source or logs.
4. With explicit publication approval, run `npm publish --access public` from this package directory.
5. Read the published registry metadata back and smoke-test that exact released version.

Future deployment scripts and release pipelines must preserve this scope and public access. Automated publishing requires a separately approved authentication/workflow setup; it does not replace the documented manual login procedure without agreement.

## User-facing usage after publication

- One-off: `npx @designmode-app/cli@latest status`
- Installed: `npm install -g @designmode-app/cli`, then `designmode-app status`
- Durable agent/team setups: pin a tested package version rather than automatically following latest.

npx runs the same npm package from a local installation or npm cache; it is not a separate package type and does not promise zero download or installation into the cache.

## Product direction

Cloud is the primary CLI audience. Support Cloud, Local and Self-hosted using the existing MCP contracts, not three separate tool engines. The previous local-only CLI requires an existing local bridge; that limitation must not be advertised as the finished cross-mode design.

Use `https://mcp.designmode.app` as the canonical cloud relay origin, with the actual MCP endpoint derived from the server implementation. Keep credentials out of arguments and logs; validate endpoints and never forward authentication through arbitrary redirects. Do not configure production accounts, issue production tool calls or publish without explicit authorisation.

PostHog project configuration and activation remain deferred by the maintainer. No analytics identity expansion is authorised.
