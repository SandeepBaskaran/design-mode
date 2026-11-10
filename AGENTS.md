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

Run `npm run release:preflight` before `npm run verify`. After npm
publish, run `npm run release:postcheck` (add `-- --tarball <path>` to
confirm the registry shasum matches the tested tarball).

After preflight and `npm run verify` are green on the commit you intend to ship:

1. Merge into `main` and push `origin/main` with a normal (non-force)
   push.
2. Create and push the annotated tag `vMAJOR.MINOR.PATCH`. **That tag
   push is what publishes the GitHub Release.** The workflow builds and
   attaches `design-mode-extension.zip` (Chrome),
   `design-mode-addon.zip` (Firefox) and `designmode-for-safari.zip`.
   It does not publish npm and it does not submit to any browser store.
3. **npm (maintainer, browser approval, no OTP):**
   - If `npm whoami` returns 401, the agent may run
     `npm login --auth-type=web` in the background and hand the
     maintainer the printed `https://www.npmjs.com/login?next=/login/cli/...`
     link to approve in the browser.
   - Give the maintainer this exact command to run in **his own
     interactive Terminal** (no `--otp` flag):
     `cd <dir of verified tarball> && npm publish designmode-app-cli-<version>.tgz --access public`.
     npm opens or prints a browser link; he approves with his passkey
     (Apple Passwords). Do not ask for an authenticator code, and never
     put any code in chat.
   - Agents cannot complete this step themselves: run without a TTY,
     `npm publish` fails with `EOTP` even with `--auth-type=web`.
   - The registry can take 1 to 2 minutes to list the new version. Then
     confirm `dist-tags.latest` and that `dist.shasum` matches the
     tested tarball (`npm view @designmode-app/cli@<version> dist.shasum`).
   - Publish the tarball you already installed and tested. See
     [packages/cli/PUBLISHING.md](packages/cli/PUBLISHING.md).
4. **Firefox AMO:** upload `packages/extension/design-mode-addon.zip`
   and the reviewer source zip. Create the source zip with
   `npm run package:firefox-source`, which writes
   `~/Downloads/design-mode-firefox-source-<version>.zip`. Reviewer
   build steps are in `SOURCE-BUILD-README.md` inside that archive.
5. **Chrome Web Store:** upload `packages/extension/design-mode-extension.zip`.
6. **Safari:** use `packages/extension/designmode-for-safari.zip` from
   the GitHub Release; Apple distribution is a separate maintainer step.
