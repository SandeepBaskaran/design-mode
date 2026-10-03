# Exact-current local security closeout

## Result

**Scoped #3 remediation passes locally; the full extended suite is NOT zero-finding.** Fresh official CodeQL `js/xss-through-dom`: **0 results**. Unmodified official `javascript-security-extended`: **8 results**, all reviewed below. Both SARIF invocations report `executionSuccessful: true`. No production-source finding was returned. The current hardened acceptance harness returned no finding; archived historical harness copies still do.

GitHub alert **#3 remains OPEN** on `refs/heads/main`, most-recent-instance commit `184be9e5baa40665fe9c0e4d5ab1e630d17591ab`, retrieved read-only using `gh api repos/SandeepBaskaran/design-mode/code-scanning/alerts/3`. Local results do not close or supersede that remote alert. No push, upload, publication, alert mutation, source exclusions, query alteration, custom model or suppression was performed.

## Exact source and tools

Working directory throughout: `/Users/sandeepbaskaran/Documents/design-mode/.worktrees/feat-next-release/.worktrees/subagent-sa-0-e03b5b8c`.

Origin: `/Users/sandeepbaskaran/Documents/design-mode/.worktrees/feat-next-release`, dirty HEAD `3fa2859a5f1fbb4ce9e8d9298cfdc5f5a0cf01bf`. Copied **2748** tracked/nonignored-untracked files byte-for-byte, preserving the origin deletion of `website/src/components/blocks/hero-image.tsx`. This includes preserved evidence, not only active source. `seed-manifest.json` gives every SHA-256; no source edits were made by this worker. The report-only commit must not incorporate the uncommitted seed changes.

`verification.json` verifies all seeded files unchanged in child and origin at read-back, and **312** database archive files matching seed hashes with **0 mismatches**. The database archive has 422 entries in total; do not infer that every archive entry is an extracted source file. `source-manifest.json` is the runner's additional pre-analysis manifest. `summary.json` confirms no pre-existing files in that manifest changed during the successful scan.

Official CodeQL **2.27.0**, bundled JavaScript queries **2.4.5**. Durable executable: `/Users/sandeepbaskaran/Documents/design-mode-recovery/security-tooling/codeql/codeql`. Durable portable runner: `/Users/sandeepbaskaran/Documents/design-mode-recovery/security-tooling/requery.py` (also committed beside this report).

Initial restoration of individually archived tool files verified 21144 hashes but omitted bundled `node_modules`; database creation failed with `Cannot find module 'typescript'`. `failed-create.log` is retained; that attempt produced no usable clean result. Recovered the original official bundle from the recovery archive and checked its SHA-256 against GitHub's release checksum: `33144291ddcf14ca969a658dfdda679f5dc8c8fee630c9c8251dc7a8dab5719c`. Fully extracting that bundle restored the parser dependencies. A fresh database then created and analyzed successfully. No substitute query implementation or dependency shim was used.

Successful database: `.security-closeout-run-2/database` in this child. Parent should preserve it if desired before deleting the child; tooling and runner already survive child deletion.

## Coverage qualification

CodeQL reports **252/267 JavaScript/TypeScript files** and **4/4 GitHub Actions files**. `coverage.json` enumerates all 15 baseline entries absent from extraction: all are historical evidence in hidden `.certification-local` / `.security-review-scratch` paths under worker-preservation. No custom exclusion was set. All active `packages/` and `website/` JS/TS source files in the seed have successful-extraction diagnostics (SARIF URL-encoded paths decoded for comparison). This is the complete official suite with its default extractor behavior, not a claim of literal extraction of every archived file.

## Findings reviewed individually

Paths below beginning `worker-preservation/` are under `docs/certification/`.

1. **`js/bad-code-sanitization`**, `worker-preservation/subagent-sa-1-5dd737d0/chrome-richtext-certification/acceptance-installed.cjs:64`. Historical panel evaluator compiles strings; related flows interpolate JSON at lines 71, 91 and 98. Genuine risky harness construction pattern, but this is preserved historical evidence, not the current runner. Do not execute this archived harness with untrusted arguments. The current runner uses fixed functions plus structured arguments.
2. **`js/bad-code-sanitization`**, same file **:65**. Historical page evaluator compiles a string, including JSON interpolation at line 114. Same disposition; retained verbatim rather than rewriting provenance evidence to silence findings.
3. **`js/incomplete-url-scheme-check`**, `worker-preservation/subagent-sa-0-ecab6491/certification-artifacts/certified-evidence/panel-final.html:1306:91594`. Captured injected accessibility-audit code checks `data:` and `javascript:` but not `vbscript:` in URL processing. This is captured third-party audit runtime, not the current production sanitizer. No production execution path or exploit was established. Preserve evidence; do not serve/reuse the capture as trusted application code.
4. **`js/file-system-race`**, `packages/mcp-local/test/setup.test.ts:268`, related check **:267**. Test asserts the backup's permission bits and then its contents in a test-owned `mkdtemp` directory. The stat assertion is an expected-output check, not an authorization decision protecting an attacker-selected read. This is a bounded fixture TOCTOU warning, not an established production vulnerability. No test weakening or gratuitous sibling-owned source edit was made.
5. **`js/remote-property-injection`**, same captured `panel-final.html:1306:269335`. Injected accessibility runtime writes channel-ID keys to its reply-handler table from message data. Review identifies axe messaging code in preserved HTML, not extension production source. No exploit reproduced; don't promote the saved snapshot into trusted executable code.
6. **`js/remote-property-injection`**, same captured HTML **:1306:270192**. Companion deletion of a message-controlled channel key in the same table. Same scope and disposition, counted separately and retained in SARIF.
7. **`js/log-injection`**, `worker-preservation/subagent-sa-0-1875866a/packages/extension/tests/reliability-installed-firefox.mjs:84`. HTTP fixture POST JSON reaches `received.checks.length`, concatenated into a PASS log; unvalidated object data could inject log text if an adversary reaches the local fixture server. Historical harness risk, not shipped production. Do not use archived harnesses with untrusted result sources.
8. **`js/http-to-file-access`**, `worker-preservation/subagent-sa-1-b2064419/firefox-cert/reproduce-persistence.cjs:23`. JSON from the fixed local `http://127.0.0.1:3133` harness is persisted as JSON at fixed `__dirname + '/persistence-repro.json'`. File content is intentionally remote-derived evidence; attacker data does not choose the path here. Historical harness trust/size assumptions remain; no arbitrary-path write was established.

These are eight real analyzer results, not suppressed results or a blanket assertion of false positives. No new genuinely unsafe active-source flow requiring a corrective source patch was established. Historical evidence was deliberately not rewritten. A claim that the entire working tree is security-clean would be unsupported.

## Behavioral verification

All commands below exited 0:

- `npm run test:extension`: **186 passed, 0 failed, 0 skipped**.
- `node --test packages/extension/tests/certification/browser-evaluators.test.cjs`: **4 passed**. Exercises function/argument separation, hostile quote/backtick/interpolation payloads as data, Firefox allowlisted dispatcher/reply cleanup, and absence of string evaluation callsites.
- `node packages/extension/tests/rich-text-browser.mjs`: Chromium native DOM sanitizer vectors and guarded href round trips PASS. This is not installed-extension UI certification.
- `npm run build:extension`: PASS.
- Follow-up `npm run build`: PASS for extension and website, including website TypeScript and 68 generated pages. First attempt failed because Turbopack cannot resolve parent-worktree dependencies outside its filesystem root. Copied the existing dependency tree into this isolated child using APFS copy-on-write (`cp -cR ../../node_modules ./node_modules`), without installs or source changes; retry exited 0. Both logs retained. Nonfatal warning: missing fallback override values for Google Sans Flex.
- `git diff --check`: PASS on seeded source. Raw logs retain their original whitespace.

The current harness was manually reviewed: Chrome forwards functions and structured arguments directly to Playwright; Firefox rejects unregistered functions and transmits fixed action names and structured data through its dispatcher. Existing regression tests cover both boundaries. No current harness correction was necessary.

## Reproduction and final integration gate

Run with a fresh output directory, explicit final source root, and unchanged official tools:

```sh
python3 /Users/sandeepbaskaran/Documents/design-mode-recovery/security-tooling/requery.py \
  --codeql /Users/sandeepbaskaran/Documents/design-mode-recovery/security-tooling/codeql/codeql \
  --source /absolute/path/to/final/isolated/source \
  --output /absolute/path/to/new/security-run
```

The runner creates a fresh database and invokes the official `Security/CWE-079/XssThroughDom.ql` and `codeql-suites/javascript-security-extended.qls` with `--threads=4 --ram=4096`, retaining command output and unmodified SARIF. It checks invocation success, counts every result, retains every result, and rejects changed hashed files. Exit 0 means the analysis ran successfully, NOT that the suite returned zero findings. Inspect `summary.json` and all findings.

This run used output `.security-closeout-run-2` under the explicit child source root. No CodeGraph/hooks were installed or shared configuration mutated for this read-only security assessment/report-only delivery. Later parent/browser-worker production edits invalidate exact-source currency; compare the seed hashes and repeat the fresh database run after reconciliation. Remote closure still requires an explicitly authorized push and fresh GitHub analysis, neither performed here.
