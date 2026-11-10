# Agent notes

Release process lives in [RELEASING.md](RELEASING.md). Keep this file
short; if a rule grows, move the detail there.

## Release

Releases are never automatic. Cut one only with explicit maintainer
consent. Versioning, the file list for a bump, and the pre-tag
checklist are in RELEASING.md.

When creating a worktree, set `git config user.name "Sandeep Baskaran"`
and `git config user.email 29013187+SandeepBaskaran@users.noreply.github.com`
in it.

Run `npm run release:preflight` before `npm run verify`. After the
tagged release's npm job (or a manual fallback publish) succeeds, run
`npm run release:postcheck` (add `-- --tarball <path>` to confirm the
registry shasum matches the tested tarball).

After preflight and `npm run verify` are green on the commit you intend to ship:

1. Merge into `main` and push `origin/main` with a normal (non-force)
   push.
2. Create and push the annotated tag `vMAJOR.MINOR.PATCH`. **That tag
   push is the release.** The workflow builds and attaches
   `design-mode-extension.zip` (Chrome), `design-mode-addon.zip`
   (Firefox) and `designmode-for-safari.zip`. After that release job
   succeeds, three separate jobs on the `release` environment submit
   the Chrome zip, submit the Firefox zip plus the reviewer source
   archive, and publish `@designmode-app/cli` with npm trusted
   publishing (OIDC, no npm token). A missing store secret skips that
   job. One publish job failing does not cancel the others. Credential
   names and the npmjs.com trusted-publisher fields are in RELEASING.md.
   See [packages/cli/PUBLISHING.md](packages/cli/PUBLISHING.md).
3. **Safari:** use `packages/extension/designmode-for-safari.zip` from
   the GitHub Release; Apple distribution is a separate maintainer step.
4. **Manual fallback:** if a store job is skipped or fails, upload the
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
