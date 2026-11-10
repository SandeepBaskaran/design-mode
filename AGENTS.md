# Agent notes

Release process lives in [RELEASING.md](RELEASING.md). Keep this file
short; if a rule grows, move the detail there.

## Release

Releases are never automatic. Cut one only with explicit maintainer
consent. Versioning, the file list for a bump, and the pre-tag
checklist are in RELEASING.md.

After `npm run verify` is green on the commit you intend to ship:

1. Merge into `main` and push `origin/main` with a normal (non-force)
   push.
2. Create and push the annotated tag `vMAJOR.MINOR.PATCH`. **That tag
   push is what publishes the GitHub Release.** The workflow builds and
   attaches `design-mode-extension.zip` (Chrome),
   `design-mode-addon.zip` (Firefox) and `designmode-for-safari.zip`.
   It does not publish npm and it does not submit to any browser store.
3. **npm (maintainer):** `npm whoami`, then
   `npm publish /path/to/designmode-app-cli-<version>.tgz --access public`
   (npm prompts for a 2FA OTP), or `cd packages/cli && npm publish --access public`.
   Confirm with `npm view @designmode-app/cli version`. Prefer the
   tarball you already installed and tested. See
   [packages/cli/PUBLISHING.md](packages/cli/PUBLISHING.md).
4. **Firefox AMO:** upload `packages/extension/design-mode-addon.zip`
   and the reviewer source zip. Create the source zip with
   `npm run package:firefox-source`, which writes
   `~/Downloads/design-mode-firefox-source-<version>.zip`. Reviewer
   build steps are in `SOURCE-BUILD-README.md` inside that archive.
5. **Chrome Web Store:** upload `packages/extension/design-mode-extension.zip`.
6. **Safari:** use `packages/extension/designmode-for-safari.zip` from
   the GitHub Release; Apple distribution is a separate maintainer step.
