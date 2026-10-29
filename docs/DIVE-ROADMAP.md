# DIVE roadmap

Built from `docs/DIVE-AUDIT.md` (baseline `a0afd5d`). Phases are ordered by
dependency. Work that already functions (visual editing, change capture, local
MCP handoff, cloud relay ownership) is extended, not rebuilt.

The biggest architectural gap: **DIVE has no backend database and no user
identity.** Phases 3 and 5–8 all depend on introducing one. That decision
(provider, hosting, region, cost) is made once, in Phase 5a, before any account,
team or project work starts. Phases 1, 2 and 4 do not need it.

Status legend: Done · In progress · Not started.

---

## Phase 1 — Stabilize the extension and MCP

**Status:** Implementation complete and verified; **acceptance blocked** on two owner decisions: merging PR #4 and the upstream relay decision. Not complete until both are recorded. Details and evidence: `docs/DIVE-AUDIT.md` §8.

| Scope item | State | Evidence |
|---|---|---|
| Deterministic local `verify` on macOS | Done (workaround; the Node crash itself is **not** fixed) | Cause: Node 24.14.1's CommonJS export lexer (`lexer::CJSLexer::tryBacktrackAddStarExportBinding`) faults with SIGBUS while web-ext loads; ~30–40% of runs; no Node flag avoids it. `scripts/web-ext-lint-retry.mjs` retries **only SIGBUS**, up to 8 attempts; other signals and real lint failures fail immediately (9 tests in `scripts/web-ext-lint-retry.test.mjs`, run by the gate). Three consecutive passing runs are recorded in the audit. |
| README analytics contradiction | Done | `README.md` now matches `PRIVACY.md` and `src/platform/analytics.ts`: release builds send bounded usage events without an in-app opt-in (Firefox honours its data-collection permission); source builds send none. |
| Cloud Redis polling cost | Done (measured, documented; no behaviour change) | 12 commands/s per idle open stream: per 250 ms poll, one consume script + token-liveness `GET` + `EXISTS`. Asserted by "an idle stream costs a bounded number of Redis commands per second". Documented in `CLAUDE.md`. Reducing it (idle backoff) would trade agent latency and revocation speed, and is left as a future decision. |
| Older tab shows "Connected" | Done | Relay sends `STREAM_OWNERSHIP`; the extension shows a fourth state, **Standby**. Verified live 3/3 with the real extension, real Redis and the relay's own handlers: older tab Standby, newer Connected, takeover to Connected in 0.56–0.64 s after the newer tab closed. |
| Merge PR #4 | **Blocked: needs your approval** | PR open, clean, 0 behind `main`, GitHub `verify` green on `a0afd5d`. It does **not** yet contain the Phase 1 changes (uncommitted). |
| Upstream relay decision | **Blocked: needs your decision** | Options: (a) ask the `mcp.designmode.app` owner to verify their Redis topology and deploy the fix; (b) run your own relay with your own Redis (approved cost). Recommendation in the audit. |

- **Dependencies:** none.
- **Files changed in Phase 1:**
  - `scripts/prepublish-check.mjs`, `scripts/web-ext-lint-retry.mjs`, `scripts/web-ext-lint-retry.test.mjs`, `README.md`, `CLAUDE.md`
  - `packages/mcp-cloud/{lib/store.ts,api/extension/stream.ts,test/stream-ownership.test.cjs}`
  - `packages/extension/src/{content/change-tracker.ts,content/index.ts,sidepanel/sidepanel.ts,sidepanel/mcp-standby.test.ts}`
- **Database changes:** none.
- **Acceptance:**
  - [x] `npm run verify` passes three consecutive local runs.
  - [x] The cloud relay's idle Redis usage is measured and documented.
  - [x] The older tab shows a distinct "Standby" state.
  - [ ] The upstream deploy decision is recorded (blocked: yours to make).
  - [ ] PR #4 merged with the Phase 1 changes (blocked: the changes are not yet committed, and the merge needs your approval).
- **Automated tests added:**
  - Gate retry tests: only SIGBUS is retried; real lint failures and other signals fail at once.
  - Relay ownership-event test.
  - Idle poll-rate test.
  - Panel Standby label and Send-hint tests (`mcp-standby.test.ts`).
- **Manual / live:**
  - Real extension: edit, undo, send and persist.
  - Real **Claude Code** end-to-end (implemented the change in source).
  - Cloud Standby with two tabs.

  See audit §8 and `DIVE-MANUAL-TESTS.md`.
- **Security:**
  - Relay logs are still metadata-only.
  - `STREAM_OWNERSHIP` carries only a boolean.
  - No bypass secrets in the repo.

## Phase 2 — Persistent, visual change history

**Status:** Planned, not started. Phase 2 may begin only after Phase 1 is accepted.

**Design rule:** every recorded change keeps its visual snapshot and annotation as part of its persistent history. A change is never stored without them, and they are not discarded when the change is exported, resolved or migrated.

- **Scope**
  - Persistent history: style, text and DOM edits survive browser restarts. Today they are in `chrome.storage.session`; move them to durable storage with retention, plus a migration.
  - Automatic screenshot snapshots: each recorded change captures before and after snapshots of the affected element (reusing the existing `CAPTURE_SCREENSHOT` / `captureVisibleTab` path), linked by change ID.
  - Element-level visual annotations: an annotation (outline, label, note) is anchored to the element's selector and drawn on the snapshot, so the history shows what changed where.
  - Before/after values and comparisons: the existing `oldValue`/`newValue` per property, plus side-by-side and overlay snapshot comparison in the Changes view.
  - Attribution and workflow fields on every change: author, created and updated timestamps, assignee, and implementation status. The status extends today's `todo` / `in_progress` / `resolved`. The author is a local display name until Phase 5, then the account ID; `Comment.author` exists but is never set today.
  - Snapshot storage design: local blob storage first (IndexedDB, with size caps and pruning). The backend object-store design (Phase 5a) defines how snapshots sync, how long they are kept and who may read them.
  - Access controls: snapshots can contain page content, so they inherit the change's visibility. Personal now; project, team and organization access in Phases 3b and 6–8. Never sent to analytics; documented in `PRIVACY.md`.
  - Designed for future team and organization collaboration: IDs, authorship and history are shaped so Phases 6–8 can share them without migration.
  - Verify and harden SPA re-renders, cross-origin iframes and shadow DOM; document the unsupported cases.
- **Dependencies:** Phase 1 accepted. Backend sync of snapshots depends on Phase 5a.
- **Files:**
  - `packages/extension/src/content/change-tracker.ts` (`RouteSessionStore`)
  - `packages/shared/src/types.ts`
  - `packages/extension/src/background/comment-store.ts`
  - screenshot capture in `packages/extension/src/background/index.ts` (`captureVisibleTab`) and `packages/extension/src/content/screenshots.ts`
  - Changes view in `packages/extension/src/sidepanel/sidepanel.ts`
  - `PRIVACY.md`, `CHANGES.md`
- **Database changes:**
  - Phase 2: none (browser storage).
  - Later: `changes`, `change_snapshots`, `annotations`, `change_events` tables plus an object store for snapshot images.
- **Acceptance:**
  - Edits, snapshots and annotations survive a full browser restart.
  - Every change shows its author, timestamps, status and its before/after snapshot.
  - Storage stays within its caps.
- **Automated tests:**
  - Persistence and migration (session → durable).
  - Snapshot capture and linking per change ID.
  - Annotation anchoring.
  - Storage caps and pruning.
  - Author propagation through `get_changes`.
- **Manual:** `DIVE-MANUAL-TESTS.md` §§2–5, 9.
- **Security:**
  - Snapshots are page content: treat them as sensitive and store them locally only until access controls exist.
  - Never put them in logs or analytics.
  - Keep page-derived values sanitized.

## Phase 3 — Project management and change history

**Status:** Not started.

- **Scope**
  - A local-first "project" entity (name, allowed origins/routes, linked repository path).
  - Group changes by project.
  - A history view across sessions.
  - Status timeline (todo → in_progress → resolved, with who and when).
  - Local-first is possible now; cloud sync waits for Phase 5.
- **Dependencies:** Phase 2 persistence.
- **Files:** new `packages/shared/src/project.ts`, side panel project picker, `mcp-local` tools (scope `get_changes` by project).
- **Database changes:**
  - Phase 3a: browser storage only.
  - Phase 3b (after Phase 5): `projects`, `changes`, `change_events` tables.
- **Acceptance:**
  - Create, rename and delete a project.
  - Changes are filtered by project.
  - History survives restarts.
  - The agent receives the project context.
- **Automated tests:**
  - Project CRUD.
  - Route-to-project mapping.
  - MCP tool scoping.
- **Manual:** §10.
- **Security:** project-scoped data must never be returned for another project (enforce in the tool layer now, in DB policies later).

## Phase 4 — Agent selection and routing

**Status:** Partial (Claude Code and Cursor setup; transport choice only).

- **Scope**
  - Show which agent/client is attached (MCP `clientInfo`).
  - Let the user target a named connected agent when several are attached.
  - Add setup recipes for other MCP clients only after verifying each end to end.
  - Add `wait_for_handoff` (or an equivalent push) for cloud mode.
- **Dependencies:** Phase 1.
- **Files:** `packages/mcp-local/src/setup.ts` (`AgentId`), `packages/mcp-cloud/api/mcp.ts`, side panel MCP page.
- **Database changes:** none.
- **Acceptance:**
  - The panel names the connected agent.
  - Routing to a chosen agent is verified with two real clients.
  - Cloud handoff parity with local.
- **Automated tests:**
  - `clientInfo` capture.
  - Routing tests.
  - Cloud handoff tests on real Redis.
- **Manual:** §§7–8 with each agent claimed as supported.
- **Security:**
  - Never forward page data to an agent the user did not select.
  - Agent identity from `clientInfo` is self-reported, so do not use it for authorization.

## Phase 5 — Google authentication and accounts

**Status:** Not started.

- **5a — Backend decision.** Choose the database, auth service and hosting (cost and region approved by you). Define the schema and migrations tooling.
- **5b — Google-only sign-in.** OAuth 2.0 / OIDC with PKCE through the extension (`identity` API or a web sign-in page handing a session to the extension). No email/password. This adds an `identity` permission, which needs store justification.
- **5c — Session management.** Short-lived access tokens plus refresh, revoke on sign-out, device list.
- **5d — Bind cloud relay tokens to accounts.** Replace anonymous `/api/auth/register`.
- **Dependencies:** 5a before everything else in Phases 5–8.
- **Files:** new backend package; `packages/mcp-cloud/lib/auth.ts`; `manifest.json`; `PRIVACY.md`, `SECURITY.md`.
- **Database changes:** `users`, `identities` (provider, subject), `sessions`, `devices`.
- **Acceptance:**
  - Sign in and out with Google only.
  - Sessions expire and revoke.
  - Personal projects are visible only to their owner.
- **Automated tests:**
  - Auth flow with a mocked IdP.
  - Token expiry and revocation.
  - Row-level access tests.
- **Manual:** §11.
- **Security:**
  - PKCE, `state`/`nonce` validation, and the issuer (`iss`) and audience (`aud`) checks.
  - No tokens in URLs or logs.
  - Server-side authorization on every request.
  - Database row-level policies.

## Phase 6 — Teams, invitations, CSV import, permissions

**Status:** Not started.

- **Scope**
  - Teams with roles (owner, admin, member, viewer).
  - Manual invites.
  - CSV upload: validate the format, emails, duplicates and existing members; show a preview report before sending.
  - Invitation acceptance and expiry.
  - Share projects with a team.
- **Dependencies:** Phase 5.
- **Database changes:** `teams`, `team_members(role)`, `invitations(token_hash, expires_at, status)`, `project_shares`.
- **Acceptance:**
  - A CSV with invalid or duplicate rows is rejected per row, with nothing sent until confirmed.
  - Invites are single-use and expire.
  - Role checks are enforced server-side.
- **Automated tests:**
  - CSV parser edge cases (BOM, quoting, unicode, size cap).
  - Invite replay and expiry.
  - Role matrix tests.
- **Security:**
  - Hash invite tokens.
  - Rate-limit invites.
  - No user enumeration.
  - CSV injection safety on export.

## Phase 7 — Organizations and SSO

**Status:** Not started.

- **Scope**
  - Organizations containing teams.
  - Organization roles separate from team roles.
  - Organization admins.
  - Verified domains (DNS TXT).
  - SSO: Google Workspace and Microsoft Entra ID first, through a pluggable SAML 2.0 / OIDC layer.
  - Enforced SSO blocks ordinary Google sign-in for verified-domain users.
- **Dependencies:** Phase 6.
- **Database changes:** `organizations`, `org_members(role)`, `org_domains(verified_at)`, `sso_connections`.
- **Acceptance:**
  - With enforcement on, a verified-domain user cannot sign in except through the organization's IdP.
  - Admins manage members and teams.
- **Automated tests:**
  - SAML assertion validation (signature, audience, replay).
  - OIDC validation.
  - Enforcement bypass tests.
- **Security:**
  - Strict SAML XML handling (no XML external entities, no XML signature wrapping).
  - Just-in-time provisioning rules.
  - Audit logging of admin actions.

## Phase 8 — Collaboration dashboards and audit history

**Status:** Not started.

- **Scope**
  - A web dashboard: projects, changes, status, activity across projects and teams.
  - Assignment and review of changes.
  - An immutable audit log.
- **Dependencies:** Phases 3b, 6, 7.
- **Database changes:** `assignments`, `reviews`, `audit_events`.
- **Acceptance:**
  - Members see only authorized projects.
  - Assignment and review history is visible.
  - Audit events are append-only.
- **Automated tests:**
  - Authorization tests per view.
  - Audit immutability.
- **Security:** dashboard queries go through the same authorization layer as the API.

## Phase 9 — End-to-end verification and release

**Status:** Not started.

- **Scope**
  - Automate the live workflow from this audit: real extension, local and cloud, a real agent where licensable.
  - Firefox and Safari passes.
  - Run `docs/e2e-testcases.md` in full.
  - Staging relay with Redis (approved cost).
  - Store listings under your own accounts.
  - Version bump per `RELEASING.md`.
- **Dependencies:** all prior phases in scope for the release.
- **Acceptance:** all `DIVE-MANUAL-TESTS.md` items PASS; CI green; staging live matrix green.

## First recommended task

**Phase 2 persistence:** move session-scoped edits to durable storage with
retention and a migration, plus tests and a `PRIVACY.md` update. This is the
foundation that snapshots and annotations attach to. Start it only after Phase 1
is accepted.

- It is the most user-visible data-loss gap: closing the browser loses unsent edits.
- It needs no backend.
- Phase 3 project history builds on it.
