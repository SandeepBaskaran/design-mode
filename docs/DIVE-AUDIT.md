# DIVE audit — baseline

Audit date: 2026-10-29. Branch `feat/dive-rebrand` at `a0afd5d`, identical to
`fork/feat/dive-rebrand` (PR #4 into the fork's `main`, open, mergeable, GitHub
`verify` check passed on `a0afd5d`). Nothing was pushed to `origin`.

This document records what was verified, how, and what is still unverified. It
deliberately separates **automated tests**, **live tests with the real extension
build**, **simulated integrations** (a scripted MCP client standing in for an
agent), and **untested** behaviour.

## 1. Repository state

| Item | State |
|---|---|
| Audited worktree | `.hermes/worktrees/dive-rebrand`, branch `feat/dive-rebrand`, clean |
| HEAD | `a0afd5d fix(mcp-cloud): evict a dead stream that still holds the owner lease` |
| Remotes | `fork` → `samsadrashid/design-mode` (yours), `origin` → `SandeepBaskaran/design-mode` (upstream) |
| Ahead of `fork/main` | 13 commits: earlier handoff/sourcemap/Code-view work, Next 16.4.1 bump, design-system page, DIVE rebrand, Cloud MCP reliability (`db99ceb`, `55b5992`, `a0afd5d`) |
| **Discrepancy** | The primary checkout is on `fix/handoff-reliability` with uncommitted changes in `packages/extension/src/sidepanel/agent-workflow.ts`, `packages/mcp-local/src/feedback-session.ts`, `packages/mcp-local/src/setup-workflow.ts`, `packages/mcp-local/test/wait-for-handoff.test.ts`, `website/public/design-mode.md`, plus untracked `packages/mcp-cloud/.agents/` and `packages/mcp-cloud/skills-lock.json`. Left untouched; they are not part of this audit's branch. |

## 2. Architecture overview

npm-workspaces monorepo (`package.json`, single root `package-lock.json`):

| Package | Role | Key files |
|---|---|---|
| `packages/extension` | MV3 extension, one build for Chrome (side panel) and Firefox (sidebar). Content script does inspection/editing; side panel is the UI; background forwards messages. | `src/content/index.ts`, `src/content/change-tracker.ts`, `src/sidepanel/sidepanel.ts`, `src/background/index.ts`, `public/manifest.json`, `src/platform/target.ts` |
| `packages/shared` | Types, message schema, constants | `src/types.ts` (`StyleChange`, `Comment`, `ChangeStatus`), `src/messages.ts`, `src/constants.ts` |
| `packages/mcp-local` | Local MCP server (stdio for the agent) + loopback WebSocket bridge (port 9960) for the extension | `src/mcp-server.ts`, `src/tools.ts`, `src/websocket-server.ts`, `src/feedback-session.ts`, `src/owner-bridge.ts`, `src/setup.ts` |
| `packages/cli` | `@designmode-app/cli` installer/setup | `src/` |
| `packages/mcp-cloud` | Hosted relay (Vercel functions + Redis): anonymous device tokens, SSE to the extension, Streamable-HTTP MCP for the agent | `api/mcp.ts`, `api/extension/stream.ts`, `api/extension/inbox.ts`, `api/auth/{register,revoke}.ts`, `lib/store.ts`, `lib/auth.ts`, `lib/quota.ts` |
| `website` | Next.js marketing/docs/demo site, hidden `/design-system` page | `website/src/app/*` |

Data flow (local mode): page → content script → background → side panel (UI);
Send to Agent → content script → WebSocket `ws://127.0.0.1:<dm-mcp-port>` →
`mcp-local` → agent via MCP tools (`wait_for_handoff`, `get_changes`, …).
Cloud mode replaces the WebSocket with SSE (`/api/extension/stream`) +
`/api/extension/inbox`, and the agent talks to `/mcp`.

**There is no application database.** The only server-side store is the cloud
relay's Redis (tokens, 60 s request queues, presence, quota). No SQL, no
migrations, no user/team/org/project tables exist anywhere in the repository.

## 3. Feature status

Legend: **Works** (verified), **Partial**, **Missing**, **Broken**. "Live" means
exercised with the real current extension build in an isolated headless
Chromium profile on a disposable local page.

### A. Browser extension and visual editor

| Capability | Status | Evidence |
|---|---|---|
| Open in sidebar (Chrome side panel / Firefox sidebar), pop-out & PiP on Chrome | Works (Chrome live; Firefox **untested**) | manifest keys; panel loaded via `sidepanel/index.html?tab=<id>` in live runs; Firefox not installed on audit machine |
| Inspect / select elements | Works (live) | Live: clicking `h1#t` selected it, Design tab populated |
| Edit font size, color, padding, border radius | Works (live) | Live: 32→48px, black→#ff0000, 0→16px padding, 0→8px radius; computed styles changed immediately |
| Typography family/weight/line-height/letter-spacing, margin, gap, borders, text content | Present in UI; **not individually exercised live** | Controls observed (`fontFamily`, `fontWeight`, `lineHeight`, `letterSpacing`, `margin`, `border*Width`); extension unit suite (601 tests) |
| Undo / redo | Works (live) | Live: undo reverted radius 8px→0px, redo restored 8px |
| Before/after values captured | Works (live) | `get_changes`: `oldValue`/`newValue` per property, e.g. `fontSize '32px' -> '48px'` |
| Element context | Works (live) | Each change carries `selector`, `elementId`, `cssRule`, `pageUrl`, `routeKey`, `viewportWidth`, `breakpoint`, `label` |
| Local dev sites, staging, production sites | Works on ordinary `http(s)` pages (`<all_urls>`); local `http://127.0.0.1` verified live | `file://` needs the browser's file-access toggle (`docs/e2e-testcases.md` Phase 16) |
| Restricted pages | Limited by browser | Panel shows "DIVE cannot inspect this page" on extension/`chrome://` pages (observed live); Web Store and similar pages are blocked by browsers |
| Cross-origin iframes, closed shadow DOM, canvas/WebGL content | **Untested** in this audit | Not exercised; treat as limitations until tested |
| Visual change updates source code | **No** — by design | DIVE records a specification; an agent or developer edits the source |

### B. Change capture and history

| Capability | Status | Evidence |
|---|---|---|
| Element, property, original/new value, page context | Works (live) | see above |
| Timestamps and change IDs | Works (live) | `id`, `timestamp` on every `StyleChange` |
| **User who made the change** | **Missing** | `Comment.author` exists in `packages/shared/src/types.ts` but nothing in `packages/extension/src` ever sets it; style/text/DOM changes have no author field |
| Implementation status | Partial | `ChangeStatus = 'todo' \| 'in_progress' \| 'resolved'` (`types.ts:178`), set by the agent via `set_change_status`; no human review/approval flow |
| Assignment and review history | **Missing** | no assignee or history model |
| Survives page reload | Works (live) | edits re-applied after `page.reload()` |
| Survives browser restart | **Partial** | style/text/DOM edits live in `chrome.storage.session` (lost when the browser closes, `PRIVACY.md`); comments persist in `storage.local` (`src/background/comment-store.ts`); un-acked local Sends persist (`change-tracker.ts` pending-handoff marker); manual JSON Export/Import exists (`CHANGES.md`) |

### C. MCP and agent integrations

| Question | Finding |
|---|---|
| Agents with automated setup | **Claude Code and Cursor only**: `AgentId = 'claude-code' \| 'cursor'` (`packages/mcp-local/src/setup.ts:12`). Any other MCP client can be configured by hand (stdio `mcp-local`, or the cloud `/mcp` Streamable-HTTP URL), but **no other agent (Codex, Gemini, …) is demonstrated** in code or tests. |
| Extension registration/auth | Local: extension fetches `http://127.0.0.1:<port>/.design-mode/health` for a per-run WebSocket token (`background/index.ts` `GET_LOCAL_MCP_TOKEN`). Cloud: anonymous device token from `POST /api/auth/register`, stored in `chrome.storage.local` (`dm-mcp-cloud-token`), sent as `Bearer`. |
| Request path | Agent tool call → (local) WebSocket request/response, or (cloud) Redis queue → owning SSE stream → content script → reply via `POST /api/extension/inbox` → agent |
| User chooses an agent | **Partial**: user picks a *transport* (Cloud / Local / Self-hosted, `sidepanel.ts:625`), not an agent; whichever MCP client is attached receives the work |
| Agent can modify the project | Only through the agent's own file access; DIVE never writes source |
| Review implemented changes in DIVE | Partial: agent marks status/resolves comments; no diff review UI |
| Real-agent end-to-end | **Not tested** in this audit (no live Claude Code/Cursor run). The handoff was verified with a scripted MCP client. |

### D. Cloud MCP reliability (`db99ceb`, `55b5992`, `a0afd5d`)

| Area | Status | Evidence |
|---|---|---|
| Request/response matching | Works | live staging T1 (correlated request ID); `security.test.cjs` "an authenticated tenant cannot satisfy another tenant tool call with a known request ID" |
| Multiple streams, newest owns | Works | live staging T3 10/10 to newest; `stream-ownership.test.cjs` |
| Owner closes → older takes over | Works with bounded loss | live staging T4: 1 request lost (the one that timed out), takeover 14.2 s. Before `a0afd5d`: 24/24 lost over 330 s |
| Frozen/unresponsive owner | Works with bounded loss | live staging T5: 1 lost, takeover 14.2 s (an earlier run: 2 lost, 27.5 s) |
| Timeout eviction | Works | `EVICT_SCRIPT` in `lib/store.ts`; tests "regression (live staging): a closed newest stream…" |
| Failed delivery / requeue | Works (tests) | "a stream that dies right after taking a request puts it back"; requeue failures logged |
| Redis failure/recovery | Works (tests only) | "Redis errors while polling lose nothing, are logged once per outage"; **not tested live** |
| Auth and tenant isolation | Works | live staging T9 (401 on bad token, per-tenant routing); security suite |
| Rate limits / quota | Present | `lib/quota.ts`: 25 tool calls/day/tenant, burst 15/10 s, 5 registrations/hour/IP (env-configurable) |
| Logging / secrets | Works | metadata-only `logEvent`; live staging log scan: no tokens, payloads, bypass secret or Redis URL |
| Redis Cluster compatibility | Works | all script keys hash-tagged into `{inbound:<tenant>}`; real cluster-mode Redis 7.4 test passes; `db99ceb`'s scheme proven to fail with CROSSSLOT |
| `wait_for_handoff` over cloud | **Missing** | cloud relay exposes 8 tools; `wait_for_handoff` is local-only |
| Live staging today | **Not available** | staging Upstash database deleted after testing; project `dive-mcp-staging` has no Redis |
| Upstream relay `mcp.designmode.app` | **Runs older code** | not deployable by us; its Redis topology is unknown |

### E. Projects and dashboard

| Capability | Status |
|---|---|
| Create/manage projects | **Missing** — changes are keyed by route (`origin + path + search`); no project entity |
| Organize changes by project | Missing (implicit per-site grouping via route groups only) |
| Change history view | Partial — Changes tab for the current browser session; no long-term history |
| Status tracking | Partial — `todo/in_progress/resolved` per change |
| Cross-project activity / overview dashboard | **Missing** — the website has no app/dashboard routes (`website/src/app`: marketing, docs, demo, design-system) |

## 4. Authentication and collaboration (target requirements)

None of the following exists in the repository today: Google sign-in, user
accounts, sessions, personal projects, teams, invitations, CSV member import,
roles, organizations, organization roles, Google Workspace / Microsoft Entra ID /
SAML 2.0 / OIDC SSO, verified domains, SSO enforcement. The only identity is an
**anonymous cloud device token** (`packages/mcp-cloud/lib/auth.ts`: "No email,
no account. The token IS the credential.").

### Security observations

| Risk | Current state |
|---|---|
| Cross-user / cross-team / cross-org data access | No server-side user data exists, so there is nothing to leak across users today; relay tenant isolation is tested (security suite, live T9). **All of this becomes the main risk area once accounts and a database are added.** |
| Insecure invitations | N/A (no invitations) |
| Unauthorized project access | N/A (no projects) |
| Exposed tokens/secrets | Device token in `chrome.storage.local` (normal for extensions); relay logs are metadata-only; no secrets in repo (`.env*` ignored). Note: `vercel link` writes a `.env.local` with a Vercel OIDC token into `packages/mcp-cloud`, which is ignored only after the CLI edits `.gitignore` — contributors should not commit that edit or the file. |
| Missing server-side permission checks | Relay checks token on every route (`authenticate`) and re-checks during long streams (`isTokenActive`) |
| Anonymous registration | Anyone can mint relay tokens (rate-limited 5/hour/IP). Acceptable for anonymous relay; must be replaced by account-bound tokens when auth lands. |
| Older tab shows "Connected" | Fixed in Phase 1: the older tab now shows **Standby** (§8) |
| README inconsistency | `README.md` says "Opt-in anonymous analytics" (line ~39) and "No extension telemetry or analytics" (line ~396). `PRIVACY.md` documents an opt-in analytics ID. Needs one accurate statement. |

## 5. Tests executed (this audit)

| Command | Result |
|---|---|
| `npm run verify` | 20/21 checks pass; **`web-ext lint` crashed twice with SIGBUS** on this Mac (tooling crash, no lint result). GitHub CI `verify` on `a0afd5d` (Ubuntu): **SUCCESS** |
| `npx web-ext lint -s packages/extension/dist` (direct, twice) | 0 errors, 0 notices, 35 warnings (expected set) |
| `npm run test:extension` | 601/601 |
| `npm test -w packages/mcp-local` | 105/105 |
| `npm test -w packages/mcp-cloud` (CI mode) | 28 pass, 2 skipped (real-Redis suites) |
| mcp-cloud with real Redis 7.4 standalone + cluster-mode (Docker) | 42/42, none skipped |
| `npm test -w packages/cli` | 16/16 |
| `npm run test:analytics-build` | 6/6 |
| `npm run test:website` | 4/4 |
| `npm run typecheck:extension` | clean |
| Website build (inside `verify`) | pass |
| Database migrations | none exist |

### Live workflow (real extension build, headless Chromium, disposable repo, port 9977, scripted MCP client)

| Step | Result |
|---|---|
| Open DIVE panel bound to a local page | PASS |
| Select element | PASS |
| Modify font size, color, padding, radius | PASS — page updated immediately |
| Undo / redo | PASS |
| Add comment | PASS |
| Send to Agent → `wait_for_handoff` | PASS — `status: feedback`, 10 style changes + 1 comment, correct old/new values |
| `get_changes` context | PASS — selector, cssRule, ids, timestamps, viewport, breakpoint, status |
| Reload page, edits persist | PASS |
| Real agent implements change in source | **NOT TESTED** (no real agent run) |
| Project history | **N/A** (no projects) |

Earlier this session (same branch lineage, not re-run today): live Cloud staging
matrix T1–T10 against `a0afd5d` on Vercel + Upstash (results in §3D); Chrome
extension upgrade from the pre-rebrand build kept the extension ID and storage.

## 6. Deployment and infrastructure limitations

- Upstream relay `mcp.designmode.app` and its Redis are owned by another account; they still run pre-fix code with the request-loss race.
- `dive-mcp-staging` Vercel project exists with Vercel Authentication on all deployments, the public `dive-mcp-staging.vercel.app` alias removed, and **no Redis** (deleted). Hobby plan auto-assigns a public production alias on every production deploy — remove it each time or deploy as preview.
- Upstash on the Vercel Marketplace lists no free plan via CLI; each open stream polls Redis ~8 commands/s (≈$1.40/day per continuously open stream at pay-as-you-go).
- Chrome Web Store / AMO listings and `designmode.app` belong to the upstream author.

## 7. Manual tests still required

See `docs/DIVE-MANUAL-TESTS.md`. Highest priority: real Claude Code and Cursor
end-to-end, Firefox, the real extension in Cloud mode, cross-origin iframes and
SPA re-render behaviour, browser-restart persistence.

## 8. Phase 1 verification (2026-10-29)

All work is uncommitted in the working tree on top of `a0afd5d`. "Live" runs used the real current extension build in isolated headless Chromium profiles, disposable repositories and spare ports; nothing touched `mcp.designmode.app` or your own MCP server on port 9960.

### Changes
| Area | Change |
|---|---|
| `scripts/prepublish-check.mjs`, `scripts/web-ext-lint-retry.mjs`, `scripts/web-ext-lint-retry.test.mjs` | `web-ext lint` retries **only SIGBUS** deaths, up to 8 attempts; any other signal (SIGSEGV, SIGKILL, SIGINT, …) and any real lint failure fail immediately (9 gate-script tests, added to `verify` as "Gate script tests"). This works around the Node crash; it does not fix it. Root cause recorded: Node 24.14.1's CommonJS export lexer (`lexer::CJSLexer::tryBacktrackAddStarExportBinding`, from the macOS crash report) faults with SIGBUS while web-ext loads; measured 3/10 crashes with plain Node, and 3/10, 7/10 and 4/10 with `--jitless`, a 4 GB heap and `--no-experimental-require-module`. A real lint failure (non-zero exit without a signal) still fails immediately. |
| `README.md` | Analytics statements now match `PRIVACY.md` and `packages/extension/src/platform/analytics.ts`. |
| `packages/mcp-cloud/lib/store.ts`, `api/extension/stream.ts` | `readInbound` reports ownership transitions; the stream forwards them as a `STREAM_OWNERSHIP {owner}` relay message (no `requestId`, so older extension builds ignore it at `content/index.ts` `if (!msg?.requestId) return`). |
| `packages/extension/src/content/change-tracker.ts`, `content/index.ts`, `sidepanel/sidepanel.ts` | New `standby` MCP state: status chip "Standby" (amber), takeover hint on Send, and a matching help popover and toast. |
| `CLAUDE.md` | Four-state `mcpState`; ownership events; measured polling cost. |
| Tests | `packages/mcp-cloud/test/stream-ownership.test.cjs` (ownership events, idle poll rate), `packages/extension/src/sidepanel/mcp-standby.test.ts`. |

### Automated results
Earlier runs during implementation (superseded; kept for the record):
- 3 × `verify` with a 5-attempt any-signal retry: pass, but one run needed 4 retries.
- 3 × `verify` with an 8-attempt any-signal retry: pass.

Acceptance review on the final code (SIGBUS-only retry plus gate tests):

| Command | Result |
|---|---|
| `npm run verify`, 3 consecutive runs | **3/3 pass**, 22/22 checks each (now includes "Gate script tests"); SIGBUS retries 0, 3, 0; no other signals |
| `npm run test:extension` | 603/603 (601 existing + 2 Standby) |
| `node --test test/stream-ownership.test.cjs` | 20/20 |
| `npm test -w packages/mcp-cloud` (CI mode, no Redis) | 30 pass, 2 skipped |
| mcp-cloud suite with real Redis 7.4, standalone + cluster-mode (Docker) | 44/44, none skipped |
| `node --test scripts/web-ext-lint-retry.test.mjs` | 9/9 |
| `npm run typecheck:extension`, `tsc --noEmit -p packages/mcp-cloud` | clean |
| `git diff --check` | clean |

**Defect found during the acceptance review and fixed:** the new `STREAM_OWNERSHIP` frame broke 4 real-Redis lifecycle tests (5 failures counting the parent). They read SSE frames in a fixed order and met the ownership frame where they expected a message or end-of-stream. The relay behaved correctly; the tests now skip ownership frames, which have their own tests. These tests skip in CI mode, so only the real-Redis run could catch this, and it was not run during the first Phase 1 pass.

### Measured relay cost
An idle open stream issues **12 Redis commands/s**: per 250 ms poll, one consume `EVAL` plus the token-liveness `GET` and `EXISTS`. The earlier "~8/s" estimate was wrong. At Upstash pay-as-you-go ($0.20 per 100K commands) that is about $2.07 per day per continuously open stream.

### Live workflow results
| Workflow | Result | Evidence |
|---|---|---|
| Edit (font size, color, padding, radius), undo/redo, comment, Send, `wait_for_handoff`, `get_changes`, reload persistence (scripted MCP client) | PASS | §5 |
| **Real Claude Code 2.1.311, Local mode** (`claude -p` with DIVE's `mcp-local` as its MCP server, port 9979) | **PASS** | Claude Code connected (`design-mode` status `connected`, 9 tools). The extension connected in 2 s; edits sent at 9 s. Claude Code's `wait_for_handoff` returned `feedback`; it read and edited `index.html` (`#t { font-size: 48px; color: #ff0000; letter-spacing: 2px; }`, the last from the comment) and called `set_change_status` → "Marked 3 items as resolved.". A clean browser with no extension rendered the edited **source** at 48px / red / 2px. Finished 21 s after Send. |
| Earlier attempt in the same session | Harness errors, not product | My field lookup missed `data-dm-prop`; when that run crashed, DIVE correctly reported `stopped` to Claude Code. |
| **Cloud Standby, two real tabs** (relay handlers run locally through a Node HTTP adapter, real Redis 7.4 in Docker) | **PASS 3/3** | A alone: Running → Connected once the agent attached. B opened: A **Standby**, B **Connected**, agent reached Page B. B closed: A **Connected after 0.56 / 0.64 / 0.57 s**, agent reached Page A. No page errors. One extra run failed in the harness (it read the token file before registration finished, so every agent call got 401) and was excluded. |
| Cloud on Vercel with Standby | **Not run** | No hosted Redis exists. On Vercel a closed tab's stream is often not detected, so takeover (and the chip turning Connected) relies on eviction, measured at ~14 s earlier. |
| Firefox | **Not run** | Not installed. |
| Real Cursor | **Not run** | Not installed/tested. |

### Phase 1 acceptance (reviewed against the final code)
| Criterion (`docs/DIVE-ROADMAP.md`) | Status | Evidence |
|---|---|---|
| `npm run verify` passes three consecutive local runs | **Met** | 3/3, 22/22 each, on the final code |
| Idle relay Redis usage measured and documented | **Met** | 12 commands/s per idle stream; asserted by test; `CLAUDE.md` |
| Older tab shows a distinct Standby state | **Met** | 2 panel tests + relay ownership test; live 3/3 against the relay code run locally with real Redis. Not run on Vercel. The live runs predate a copy-only change ("Reload this tab to take over"). |
| Upstream deploy decision recorded | **Not met: needs your decision** | Owner message drafted; nothing sent or decided |
| PR #4 merged | **Not met: needs your approval** | PR #4 (`a0afd5d`) does **not** contain the Phase 1 changes, which are uncommitted |

**Phase 1 is not complete.**

### Still untested
- Standby and takeover on an actual Vercel deployment (no hosted Redis exists).
- Firefox (not installed).
- Cursor (not installed).
- A person operating the panel by hand: all browser runs were scripted.

**Recommendation for the upstream relay decision:** ask the `mcp.designmode.app` owner to verify their Redis topology (`INFO cluster`) and deploy the fix commits to their own staging first, because the live relay still has the request-loss race reproduced in this session. If they decline or don't respond, run your own relay. That needs an approved Redis cost (see the measured cost above).
