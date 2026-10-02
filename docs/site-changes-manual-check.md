# Site-wide Changes — manual acceptance

Use synthetic edits only. Do not clear changes on a site containing work you want to keep.

## Load the tested build

The build is `packages/extension/dist/` in the main checkout, not a task worktree.

- **Chrome:** open `chrome://extensions`, reload the existing unpacked Design Mode extension (or Load unpacked → that directory), then reload your fixture tabs.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, Load Temporary Add-on → `packages/extension/dist/manifest.json`. Reload if already loaded; permit access to the fixture if prompted.
- Keep MCP disconnected for this round. No real agent or external service is needed.

The local synthetic fixture, when running, is http://127.0.0.1:43179/ with Home, About and Contact links. The assistant's fixture server is temporary; ask to restart it if the link stops working.

## One acceptance round

1. **Record different route edits.** On Home, change the first card's colour to red and add a comment. On About, change the same card's colour to blue and edit its text. On Contact, delete the second card. Use the normal navigation links for these steps.
2. **Review all routes.** Current route appears first and always expanded, with a blue Current badge in the Open route position. Other routes show only their path, count, delete button and Open route action, without expansion or a full-URL subrow. Deleting requires confirmation for that route. Check the panel at a narrow width: controls and text remain usable without horizontal scrolling.
3. **Replay and undo.** Use Open route to revisit Home/About/Contact, then reload each. Colours, text, deletion and comments stay on their own routes. Make a fresh edit, undo it and redo it: both the page and Changes rows follow correctly. Undo history itself is route-specific and does not survive navigation.
4. **URL boundaries.** Try `/about?view=one` and `/about?view=two`: edits are separate. An ordinary `#details` anchor does not create another record; `/about#details` and `/contact#details` remain different routes. A different port, scheme or subdomain is a different site.
5. **Copy and restore.** Select a filter. Copy as Prompt must still include all recorded route URLs and edits, including inactive routes whose details are not displayed. Export JSON, then Clear all on this synthetic origin. All its records disappear. Import that same JSON: every route returns, but only the current route applies to the visible DOM. Revisit the other routes to confirm their edits and comments restore.
6. **Delete separately.** While on About, delete Home's route group. About remains unchanged; Home no longer replays edits on reload. Clear all removes the remaining groups for this origin.
7. **SPA safety.** The fixture's “SPA contact” button deliberately reuses DOM nodes. Editing may pause with a notice because the destination DOM cannot be confirmed. Saved records remain reviewable/exportable; reload Contact to resume editing. On a real application that replaces its route targets, replay resumes after replacement. Never accept edits applied to the departing page as a pass.
8. **Firefox repeat.** Repeat steps 1, 3 and 5 in Firefox, including the actual sidebar. Automated Firefox checks exercise the installed application scripts through a test-only background probe, not the sidebar's physical interactions.

## Report the result

Reply with **pass** or the failed step, browser, route, expected/actual result and a screenshot if useful. A passing manual check does not itself authorise a commit: explicitly approve a **local commit on main only** when ready. No push, release, tag or remote change is included.

## Automated coverage and known limits

- Chrome installed-extension coverage includes style edit, undo/redo, comments, delayed-render mutation blocking/replay, route grouping, real panel JSON export/file import and per-route deletion.
- Firefox installed-script coverage includes exact-origin aggregation, replay, clear, multi-route import and rejection of foreign-origin imports.
- Unit tests cover comment writes across origins, in-flight saves versus clear, route identity, preserved move destinations and Local/Cloud MCP report route identity.
- An isolated Chrome run exercised actual clipboard write/read-back under a comments-only filter, and panel JSON export → clear → file import → navigation with distinct route-owned styles, text, links, deletions, moves and comments. Query strings and hash-router paths were retained.
- Local MCP was exercised through the real companion process, WebSocket and an SDK stdio client: the panel's Send to Agent action reached `wait_for_handoff`, `get_changes` retained both routes, all four `export_changes` formats retained route labels, and `apply_changes` changed the active fixture DOM. This verifies the transport and tools, not an autonomous coding agent editing project source or production Cloud delivery.
- The repository's standalone extension typecheck has existing failures. Baseline comparison is used to check this feature adds no new diagnostics; the repository's normal verify gate remains the build/release gate.

## Cloud preview safety

Cloud/Self-hosted `apply_changes` requires the exact `routeKey` from `get_changes` for one batch. Navigate to that route before calling it; a missing or different route is rejected without applying styles to the visible page. Refresh the agent's tool catalogue after updating the relay. Browser-side tool failures return MCP `isError: true`, not a successful empty-export message.
