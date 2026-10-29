# DIVE manual tests

A practical checklist for verifying DIVE yourself. Mark each item **PASS**,
**FAIL**, **BLOCKED** or **NOT TESTED**. Items marked *(free)* need no paid
infrastructure. For exhaustive per-control coverage see `docs/e2e-testcases.md`;
this list is the short path through the product.

Current statuses come from `docs/DIVE-AUDIT.md`. "PASS (automated live)" means
it passed with the real extension build in a headless browser driven by a
script, not by a person. Re-mark them as PASS only when you have done them
yourself.

## Setup (free)

```bash
npm ci
cd packages/extension && node build.mjs
```

- Chrome: `chrome://extensions` → Developer mode → **Load unpacked** →
  `packages/extension/dist`. Use a separate Chrome profile for testing.
- Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
  `packages/extension/dist/manifest.json`.
- A test page: any local dev server, or `python3 -m http.server 8000` in a folder
  with a simple `index.html`.

## 1. Install and open *(free)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 1.1 | Load unpacked in Chrome | Card shows **DIVE**, description mentions Design Intelligence & Visual Engineering, no errors | PASS (automated live) |
| 1.2 | Open a normal web page, click the toolbar icon (or Alt+D) | Side panel opens with DIVE header | NOT TESTED |
| 1.3 | Open `chrome://extensions` in a tab and open the panel | Panel says DIVE cannot inspect this page | PASS (automated live) |
| 1.4 | Firefox: load temporary add-on, open sidebar | Sidebar titled DIVE, no console errors (`about:debugging` → Inspect) | NOT TESTED |
| 1.5 | `chrome://extensions/shortcuts` | "Toggle DIVE", "Capture with DIVE" | NOT TESTED |

## 2. Select and edit *(free)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 2.1 | Hover elements, click a heading | Orange outline, Design tab shows the element | PASS (automated live) |
| 2.2 | Change font size, color, padding, border radius | Page updates immediately | PASS (automated live) |
| 2.3 | Change font family, weight, line height, letter spacing, margin, gap, border width | Page updates immediately | NOT TESTED |
| 2.4 | Double-click text, edit content | Text changes; appears in Changes tab | NOT TESTED |
| 2.5 | Undo, then redo | Last change reverts, then reapplies | PASS (automated live) |
| 2.6 | Changes tab | Each change lists property, old → new | NOT TESTED (data verified via MCP) |

## 3. Persistence *(free)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 3.1 | Make edits, reload the page | Edits re-applied | PASS (automated live) |
| 3.2 | Make edits, quit the browser fully, reopen the page | **Known gap:** edits are lost (session storage); comments remain | NOT TESTED (expected FAIL) |
| 3.3 | Export changes (JSON), Clear All, Import | Changes restored | NOT TESTED |

## 4. Site types *(free unless noted)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 4.1 | Local dev server (`localhost`) | Works | PASS (automated live, `127.0.0.1`) |
| 4.2 | Any public production site | Works; edits are local previews only | NOT TESTED |
| 4.3 | A page with a cross-origin iframe | Document what can and cannot be selected | NOT TESTED |
| 4.4 | A React/Next SPA: edit, then navigate client-side and back | Edits re-apply or are clearly scoped per route | NOT TESTED |
| 4.5 | `file://` page with "Allow access to file URLs" off, then on | Guidance shown when off; works when on | NOT TESTED |

## 5. Comments *(free)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 5.1 | Select element → Comment → type → Enter | Comment pinned and listed | PASS (automated live) |
| 5.2 | Restart the browser | Comment still present | NOT TESTED |

## 6. Local MCP with a real agent *(free; needs Claude Code or Cursor)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 6.1 | Build (`npm run build -w packages/mcp-local`), then `node packages/mcp-local/dist/bin/cli.js setup --project /abs/path/to/test-app --agent claude-code` (dry run), repeat with `--apply`; restart the agent (see `docs/agent-setup.md`) | Agent lists DIVE tools; server log shows `DIVE MCP READY` | NOT TESTED (guided setup command). Claude Code connected through an equivalent MCP config: PASS (automated live) |
| 6.2 | Panel → MCP → Local | Status goes offline → Connected | PASS (automated live, scripted client) |
| 6.3 | Make edits + a comment, **Send to your AI agent** | Agent's `wait_for_handoff` receives the changes with old/new values and selectors | PASS (automated live, real Claude Code 2.1.311) |
| 6.4 | Ask the agent to implement them | Source files change; page matches after reload; agent marks the changes resolved | PASS (automated live, real Claude Code: edited `index.html`, followed the comment, "Marked 3 items as resolved") |
| 6.5 | Repeat 6.1–6.4 with Cursor | Same | NOT TESTED |
| 6.6 | Run another process on port 9960, start DIVE | Error says the port is not DIVE; other process left running | PASS (automated, spare port) |

## 7. Cloud MCP *(needs a relay with Redis; the upstream relay runs older code)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 7.1 | Panel → MCP → Cloud → Connect to Cloud | Token created; status Running | PASS (automated live, relay run locally with real Redis); BLOCKED on a hosted relay |
| 7.2 | Add the copied config to a temporary agent config, start the agent | Status Connected | PASS (automated live, scripted MCP client, local relay) |
| 7.3 | Comment, then ask the agent to call `get_changes` | Changes from the owning tab returned | PASS (automated live, local relay) |
| 7.4 | Open DIVE in a second tab, then close it | Older tab shows **Standby** while the newer one is open, newer shows Connected; after closing, older tab shows Connected and receives requests | PASS 3/3 (automated live, local relay: takeover 0.56–0.64 s). NOT TESTED on Vercel (expect ~14 s via eviction) |
| 7.5 | Revoke token in the panel | Agent calls fail with 401 | BLOCKED |

## 8. Upgrade *(free)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 8.1 | Install the previous build, set a setting and make a change, replace the folder with the DIVE build, reload | Same extension ID; setting and change kept | PASS (automated live, earlier) |

## 9. Accessibility and keyboard *(free)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 9.1 | Operate panel with keyboard only (Tab/Enter/Escape) | All primary actions reachable, focus visible | NOT TESTED |

## 10. Projects and history

| # | Steps | Expected | Status |
|---|---|---|---|
| 10.1 | Create a project and view its history | — | BLOCKED (feature not implemented) |

## 11. Accounts, teams, organizations

| # | Steps | Expected | Status |
|---|---|---|---|
| 11.1 | Google sign-in | — | BLOCKED (not implemented) |
| 11.2 | Teams, invites, CSV import | — | BLOCKED (not implemented) |
| 11.3 | Organizations, SSO | — | BLOCKED (not implemented) |

## 12. Website *(free)*

| # | Steps | Expected | Status |
|---|---|---|---|
| 12.1 | `npm run dev:website`, open `/`, `/about`, `/mcp` | DIVE branding; About page credits Design Mode by Sandeep Baskaran (MIT) | NOT TESTED (build verified) |
| 12.2 | `/design-system` in dev | Style guide, Components, Pages tabs; edits preview; Copy changes exports valid CSS | PASS (automated live, earlier) |
