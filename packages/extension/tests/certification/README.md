# Certification correction regressions

Run from the repository root with existing workspace dependencies, Playwright and selenium-webdriver available (or supplied through NODE_PATH). Browser binaries may be selected through CHROME_BINARY, FIREFOX_BINARY and GECKODRIVER. No personal browser profile is used; browsers use disposable profiles and block non-loopback network access.

```sh
npm run build:extension
npm run build --workspace=@design-mode/mcp-local
npm run build --workspace=@designmode-app/cli
npm run test:extension
npm test --workspace=@design-mode/mcp-local
node --test packages/extension/tests/certification/browser-evaluators.test.cjs
node packages/extension/tests/certification/run.cjs chrome
node packages/extension/tests/certification/run.cjs firefox
node packages/extension/tests/certification/run.cjs mcp
python3 packages/cli/test/setup-certification.py
python3 packages/extension/tests/mcp-lifecycle.py
```

The suite runner resolves fixtures, the extension build and output inside its own repository, overriding inherited DM_CERTIFICATION_* / DM_EXTENSION_DIST / DM_ACCEPTANCE_OUT values. Evidence goes to `.correction-evidence/{chrome,firefox,mcp}`; setup/lifecycle evidence also stays under `.correction-evidence`. Python PTY checks require macOS/Linux. MCP requires both companion and agent CLI builds.

## Source and overlap decisions

Integration seed commit: `92f3d60` (tree `da2f8c585597706b42168646b08765e6703ed4ff`). This is the exact source snapshot, including nonignored untracked files, of the integration worktree at HEAD `184be9e5baa40665fe9c0e4d5ab1e630d17591ab`. Do not apply the seed commit: apply only its following correction commit. A read-only final comparison found no seed-file drift in the integration source.

Production changes were extracted from actual diffs of `ff86ac7`, `35d9fcd`, and `332a684`, not cherry-picked wholesale. Reset overlap uses the existing OVERLAY_MARGIN_DEFAULT / OVERLAY_PADDING_DEFAULT constants from the Firefox correction, plus nudge/unit reset; duplicate Chrome literals were not added. Chrome outline/picker changes and Firefox token rerender/background download changes remain. Local MCP token synchronization, edit-time viewport metadata and setup symlink/permission guards remain. No website file changed. Existing rich-text URL encoding and broker/revocation guards from `7b60a3b` and `311ef98` were preserved, not reintroduced from older baselines.

The reused MCP region test previously required literal selector `region`; the integration's anchored-region implementation returns `#empty`. The regression now asserts that exact anchor **and** all four rectangle coordinates, alongside the element comment. This is an explicit correction of a stale expectation, not a change to production anchoring or a claim that the old catalogue's literal requirement passes.

## Harness security

Chrome receives function objects and structured arguments, never interpolated executable strings. Firefox loads one fixed local dispatcher (base64 transport of the unchanged source, no argument substitution), then receives allowlisted action names and structured-cloned data. Unknown actions and string functions are rejected. No eval/new Function, CodeQL suppression or custom query/model is used. The harness unit tests include quote/backtick/interpolation payloads.

## Observed verification

- Extension build passed; extension unit suite: 186/186.
- MCP build passed; MCP unit suite: 55/55.
- Agent CLI build passed.
- Harness security tests: 4/4.
- Real installed Chrome corrections: 3/3; Firefox native-sidebar corrections: 4/4.
- Real installed extension plus local MCP/CLI: 33/33 assertions.
- Original installed acceptance suite after harness rewrite: Chrome 14/14, Firefox 16/16.
- Setup CLI: 22 evidence records; private config and backup modes, existing/dangling symlink rejection, PTY approve/decline, repeat/conflict/force, diagnostics and local CLI checked.
- Lifecycle: 5 records, including EOF, SIGINT/SIGTERM and foreign port preservation.
- Cloud security unit suite: 8/8; native Chromium rich-text regression passed.
- Official CodeQL 2.27.0 / javascript-queries 2.4.5 `Security/CWE-094/ImproperCodeSanitization.ql` (`js/bad-code-sanitization`): fresh database, exit 0, zero SARIF results. Exact local commands/logs and hashes are in the task's `.correction-evidence`; this is not a full security suite or remote alert closure.

The initial MCP test run needed the missing local build; later native MCP needed the agent CLI build. Both were built and rerun successfully. The initial Firefox dispatcher file URL did not initialize; fixed-source data transport passed the actual native sidebar. An inherited worker environment initially pointed Chrome at another worker's dist/output; that run is excluded from evidence and the runner now fixes these paths to its own repository. All final combined runs use this worktree's build.

No production relay, personal profile, push, install or website dependency setup was performed. A delegated harness worker unnecessarily attempted the general root build and hit website dependency resolution; website verification is explicitly not claimed. Shared hooks / CodeGraph setup were not modified because this task permits only isolated correction work.
