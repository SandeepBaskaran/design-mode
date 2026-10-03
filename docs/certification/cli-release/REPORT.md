# CLI / MCP local release verification

## Outcome

Local verification passes. Two reproduced transport defects are fixed:

1. `packages/mcp-cloud/api/mcp.ts` discarded the browser's error state. A real installed browser returned a missing-selector screenshot error, but the packaged CLI exited 0. The relay now returns MCP `isError: true` and preserves screenshot candidate details. Errors from clear/read/apply operations cannot become success messages. `redis-browser-before.log` preserves the failing assertion; the final browser run and cloud regression tests pass.
2. `packages/extension/src/content/change-tracker.ts` read the *replacement* global AbortController after a transport reconfiguration. An aborted SSE worker restarted alongside its successor (two authenticated streams after one reconfiguration). Each worker now captures its own controller, token and endpoint. `sse-before.log` records `2 !== 1`; the real-browser suite now asserts one SSE worker after mode changes and passes.

No website or analytics source changes are included. Authentication, tenant isolation, credential redaction, setup consent and `private: true` are preserved. There was no publication, push, deployment or production relay access.

## Evidence and boundaries

- CLI declares Node `>=18`; root declares `>=18.0.0`. Tested the actual minimum **18.0.0**, not the latest 18.x patch, and current available LTS **24.21.0**, selected from the official Node distribution index. Downloads were SHA256-checked against official `SHASUMS256.txt`; exact checksums are in `runtime-downloads.json`.
- CLI subprocesses and exact extracted npm tarballs run under each version. The TypeScript test harness runs under host Node 26.7.0: Node 18.0.0 does not support the harness's `--import` option. `DM_TEST_NODE` makes this distinction explicit. The tarball's standalone-dependency guard now uses the builtin module list available at the declared minimum. Only Node 18's exact experimental-fetch warning is accepted on stderr; credential-leak checks remain unchanged.
- `cli-min.log` and `cli-v24.21.0.log`: **11/11 tests pass each**, including exact tarball metadata/content, all modes, cloud default, auth rejection, protected config, redirects, malformed responses, tool errors, timeouts, disconnects, no mutation retry and standalone execution.
- `redis-browser-results.json`: **23 passing evidence rows**, including **six mode × runtime flows**. This is a real installed unpacked Chrome extension, real local HTTP route handlers and **Redis 7.2.7**, not the in-memory Redis fixture. Redis was built locally from official source and its SHA256 matched `redis/redis-hashes`. Redis persistence was disabled and the process bound to loopback. All temporary processes/profiles were closed.
- Actual browser → SSE/inbox → Redis → MCP → packaged CLI round trips: discovery, session state, applying a style, independently reading computed DOM color and fetching the recorded changes. Browser screenshot failures exit 1 in all modes. Remote auth rejection, forced TCP disconnect, bounded HTTP timeout and SSE reconnection are tested. Local request timeout is produced by pausing the real page with CDP; navigation disconnect then produces `EXTENSION_OFFLINE` / exit 4.
- Cloud-compatible mode maps the CLI's canonical cloud URL to the loopback relay using a test-only preload; extension Cloud mode is configured with the same loopback relay URL. The shipped executable and extension bundle are not patched for this mapping. Browser external traffic is blocked by proxy and request routing. No production credential or endpoint is used. The relay/owner hosting this browser suite runs on Node 26.7.0; this is not a claim that the hosted relay ran on Node 18.
- `setup-v18.0.0.log`, `setup-v24.21.0.log`: actual setup preview, decline/accept prompts, backups, permissions, idempotency, conflict/force, malformed files, symlink rejection, diagnostics and owner behavior pass with synthetic fixtures.
- `lifecycle-min.log`, `lifecycle-lts.log`: local MCP starts under both runtimes; immediate stdin EOF, /dev/null, SIGINT, SIGTERM, released ports and foreign-server preservation pass.
- `mcp-cloud.log`: **9/9** tests pass, including the new browser-error regression across four tools and existing auth/tenant tests.
- `verify-final.log`: **all 15 repository automated checks pass**, after a clean isolated `npm ci --offline --ignore-scripts --no-audit --no-fund`. This includes the website build as a repository gate, but no website source change. No Turbopack retry workaround was needed.

## Repeat locally

Prerequisites: repository dependencies, built CLI/local MCP/extension, a locally installed Playwright accessible to `require`, a Chrome-for-Testing executable that supports unpacked extension loading, a Redis server binary and adjacent redis-cli. Do not use a personal browser profile.

```sh
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run verify
DM_TEST_NODE=/absolute/path/to/node-18.0.0/bin/node \
  node --import tsx --test --test-concurrency=1 \
  packages/cli/test/cli.test.ts packages/cli/test/remote.test.ts
CHROME_BINARY=/absolute/path/to/chrome-for-testing \
DM_REDIS_SERVER=/absolute/path/to/redis-server \
DM_TEST_NODES=/absolute/path/to/node18,/absolute/path/to/node24 \
  node --import tsx packages/cli/test/redis-browser-certification.mjs
PATH=/absolute/path/to/node/bin:$PATH python3 packages/cli/test/setup-certification.py
PATH=/absolute/path/to/node/bin:$PATH python3 packages/extension/tests/mcp-lifecycle.py
```

The browser harness defaults to the task-local Redis build path if `DM_REDIS_SERVER` is absent. Node and Redis downloads are test prerequisites, not package dependencies. Real-browser tests are opt-in rather than adding large browser/Redis dependencies to normal package tests.

## Remaining release / production-only checks

1. With separate explicit approval, verify production TLS/DNS, hosting/proxy SSE behavior, real Redis availability/quotas, deployment environment and agent authentication against the deployed relay. Loopback tests cannot certify these.
2. Confirm the final reconciled revision in the maintainer's browsers, including the Firefox-specific browser work owned by the separate browser verification stream. This report's transport browser is Chrome, not Firefox.
3. Verify organisation access/version and authenticate in the maintainer's terminal. Keep `private: true` until publication is explicitly approved. Then follow `packages/cli/PUBLISHING.md`, including `npm publish --access public` for `@designmode-app/cli`, and verify the exact published artifact. Nothing has been published here.

## Integration and environment notes

Only cherry-pick the correction commit, **not** its seed parent `a2ee07f`. The seed intentionally snapshots the origin's dirty authoritative source; `seed-manifest.json` records those hashes. Parent reconciliation must preserve concurrent edits.

The existing shared Git post-checkout behavior relinked extension dist to the primary checkout when a generated website file was restored. That link was removed immediately and the extension rebuilt into this isolated directory before further builds; no build was run through that new link. Do not preserve the task-local `.release-local` downloads in source.

Review was direct (recursive delegation prohibited). CodeGraph 1.6.0 is installed, but shared hooks/configuration were not modified from this isolated worker; a parent-owned graph refresh remains separate. No independent second reviewer or production certification is implied.
