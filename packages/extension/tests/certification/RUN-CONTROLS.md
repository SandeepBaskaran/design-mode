# Installed-browser controls certification

Run from the repository root. Build the extension with `node build.mjs` with the working directory explicitly set to `packages/extension` first; `build.mjs` writes `dist` relative to its working directory.

## Runtime prerequisites

Supply these explicitly in the same shell as the runner (background launches must not rely on inherited `NODE_PATH`):

- `NODE_PATH`: directory containing the already installed `playwright` and `selenium-webdriver` packages.
- `CHROME_BINARY`: installed Google Chrome for Testing executable.
- `FIREFOX_BINARY`: installed native Firefox executable.
- `GECKODRIVER`: installed geckodriver executable.
- Build dependencies must resolve through the checkout's `node_modules`; do not point `packages/extension/dist` to another checkout.

Run `python3 packages/extension/tests/certification/current-run.py`, then `python3 packages/extension/tests/certification/current-matrix.py`. The first command attempts every configured suite, exits nonzero if any suite fails, and verifies source/dist hashes did not change. The second preserves every exact catalogue ID and outputs counts plus remaining rows. Suite success does not mean exhaustive catalogue certification. A partial assertion never becomes a full pass.

`current-run.py` replaces `current-evidence` at the start of a complete run. Preserve any diagnostic evidence first. `failed-startup-evidence` retains dependency-startup failures and `pilot-controls-evidence` retains the initial assertion-development run; neither directory is joined into the current matrix.

## Scope

The installed extension runs in task-owned disposable browser profiles against localhost fixtures. Chrome uses a bound extension panel tab, not branded Chrome's native side panel. Firefox uses the installed native browser and native sidebar. Inputs and clicks inside the panel are dispatched through fixed, allowlisted actions; this does not certify physical OS keyboard delivery. The harness's dead HTTP/HTTPS proxy blocks outbound requests, and Chrome also denies non-local page requests. No production analytics or remote Help destinations are opened.

`controls-current.cjs` exercises typography, rich-text blur handling, spacing, flex/grid controls, opacity/transform, shadows, disclosures, token edit/reset/scope/undo, mixed change filters, comment resolution, and footer geometry. Each catalogue assertion is persisted immediately, including failed assertions. Footer geometry is supplemental, not assigned a fabricated catalogue ID. Explicit limitations remain partial. Controls not exercised remain not-run in the full 429-ID matrix.

Help Security disclosure is an email contract: `mailto:hello@sandeepbaskaran.com`, matching `SECURITY.md`. It must not be converted to an HTTPS endpoint to satisfy a test.
