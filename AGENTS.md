# Agent notes

Release process lives in [RELEASING.md](RELEASING.md). Keep this file
short; if a rule grows, move the detail there.

## Release

Merging to `main` is the release when that push changes root
`package.json` to a version newer than the latest `v*` tag.
Versioning and the file list for a bump are in RELEASING.md. Agents
do not merge, tag, or run the Release workflow unless the maintainer
asks.

Pull-request extension zips are built by the `extension-zip` job in
`.github/workflows/ci.yml`. How to sideload a PR build is in RELEASING.md.

When creating a worktree, set `git config user.name "Sandeep Baskaran"`
and `git config user.email 29013187+SandeepBaskaran@users.noreply.github.com`
in it.

Run `npm run release:preflight` before `npm run verify`. After the
tagged release's npm and store jobs (or a manual fallback publish)
finish, run `npm run release:postcheck` (add `-- --tarball <path>` to
confirm the registry shasum). It retries a stale npm `latest` tag and
confirms the Chrome and Firefox jobs submitted this version. Detail
is in RELEASING.md.

After preflight and `npm run verify` are green on the commit you intend to ship:

1. Merge into `main` and push `origin/main` with a normal (non-force)
   push. If this push changes the version and that version is newer
   than the latest `v*` tag, `.github/workflows/release.yml` creates
   the annotated tag and publishes in that same run. **That run is
   the release.** A push that does not change the version publishes
   nothing. Agents do not push tags. The workflow builds and attaches
   `design-mode-extension.zip` (Chrome), `design-mode-addon.zip`
   (Firefox) and `designmode-for-safari.zip`. After that release job
   succeeds, three separate jobs on the `release` environment submit
   the Chrome zip, submit the Firefox zip plus the reviewer source
   archive, and publish `@designmode-app/cli` with npm trusted
   publishing (OIDC, no npm token). A missing store secret skips that
   job. One publish job failing does not cancel the others. Credential
   names and the npmjs.com trusted-publisher fields are in RELEASING.md.
   See [packages/cli/PUBLISHING.md](packages/cli/PUBLISHING.md).
2. **Safari:** use `packages/extension/designmode-for-safari.zip` from
   the GitHub Release; Apple distribution is a separate maintainer step.
2. **Manual fallback:** if a store job is skipped or fails, upload the
   zips from the GitHub Release as documented in RELEASING.md. If the
   npm job fails, the maintainer publishes the verified tarball in his
   own interactive Terminal. If `npm whoami` returns 401, the agent may
   run `npm login --auth-type=web` in the background and hand him the
   printed `https://www.npmjs.com/login?next=/login/cli/...` link. Give
   him this exact command (no `--otp` flag):
   `cd <dir of verified tarball> && npm publish designmode-app-cli-<version>.tgz --access public`.
   He approves in the browser with his passkey (Apple Passwords). Do
   not ask for an authenticator code, and never put credentials, codes
   or tokens in chat, source or logs. Agents cannot complete this step:
   without a TTY, `npm publish` fails with `EOTP` even with
   `--auth-type=web`. The registry can take 1 to 2 minutes to list the
   version; then run postcheck.
