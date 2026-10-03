# Privacy

Design Mode's editor runs in your browser. Configured Cloud or Self-hosted MCP
connections can transmit page data, edits and tool results through the selected
relay; Local MCP uses your machine. Optional extension analytics is a separate,
off-by-default opt-in and never includes page content or edits. The flows and
exceptions are described below.

## What the extension stores, and where

Editor data and preferences live on **your machine**, in the browser's extension storage. Optional usage analytics is described below.

| Storage area              | What's there                                                                        | Lifetime                       |
| ------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| `chrome.storage.local`    | UI preferences: `dm-theme`, `dm-color-format`, `dm-capture-mode`, active Tokens-panel tab (`dm-tokens-tab`), inspector overlay colours (`dm-inspector-hover-color`, `dm-inspector-select-color`, `dm-overlay-margin-color`, `dm-overlay-padding-color`), contrast-checker settings (`dm-a11y-category`, `dm-a11y-level`), nudge-amount (`dm-nudge-amount`), page-cursor toggle (`dm-custom-cursor`), Chrome launch surface (`dm-launch-surface`: `side-panel` / `floating` / `picture-in-picture`), pop-out window bounds (`dm-popout-bounds`), pinned PiP window size + support flag (`dm-pip-size`, `dm-pip-unsupported`) | Until you uninstall the ext.   |
| `chrome.storage.sync`     | User-saved presets you opt to sync across devices                                   | Synced via your browser's sync account (Chrome Sync / Firefox Sync) |
| `chrome.storage.session`  | Per-page edit sessions (style/text/DOM changes), keyed by `origin + path + search`  | Until tab/browser closes       |

Site-wide change review reads saved routes only for the current exact origin
(scheme, host and port). Edits remain route-specific, and route grouping uses
existing session storage without extending its lifetime. Session reads and writes
are brokered by the extension background in both browsers; read responses contain
only the requesting page’s site-scoped sessions and clear-generation markers.
Firefox content scripts do not fall back to a different local-storage copy.
Delete route removes
that route's saved records; Clear all removes the current origin's saved
records. Copy as Prompt and Send to Agent include all saved routes for that
origin, including route URLs and their recorded changes, not just the visible
route or filter. Send uses the already-configured MCP transport; route review
adds no service, permission or automatic upload. Open route is restricted to
the bound tab's current exact HTTP(S) origin.

Session storage also holds `dm_site_clear:`, `dm_site_generation:` and
`dm_route_generation:` markers to invalidate saves already in flight when a
route or site is cleared. These contain route/origin identifiers and random
generation values, not copies of cleared edits; they share session lifetime.

Comment reads and mutations use the extension background's serial queue to
prevent concurrent tabs from overwriting or resurrecting each other's records.
They remain in the existing local `dm-comments` storage. Local
`dm-comment-owners` records hold route URLs and random import ownership markers
so failed imports cannot restore comments over a newer clear or edit. A later
comment mutation removes that route's marker; site clear removes the site's
markers. Neither record is uploaded.

The extension never reads password values or framework props/state. It reads
CSS, geometry and DOM structure for elements you inspect. For component-grouped
change review, a bounded read-only probe also reads React/Vue component names
and source-file hints for changed elements. These hints stay in the local
review UI; production builds may omit them. The grouping choice is in memory,
not a new stored preference.

## What leaves your machine

Guided Local setup only reads/writes the project configuration files selected
in its preview after explicit apply confirmation. Backups stay beside the
changed files; they may contain other tools' credentials, so do not commit
them. Doctor probes only the configured localhost bridge. Live feedback
rounds reuse that Local connection and retain snapshots/session state only
in process memory. No new external service or stored browser preference is
introduced by these features.

Apart from the optional usage analytics described below, the extension sends data through the MCP mode you configure. Fresh
installs select Cloud; existing installs retain their saved mode. Cloud and
Self-hosted need a configured relay and bearer token. Local mode talks only to
your machine.

Local browser operations:

- A token-authenticated WebSocket connection to `ws://127.0.0.1:9960` (or the
  Local port you configure) if you've opted in by starting the companion MCP
  server (`npm start`). The server runs on your machine; nothing is uploaded.
- `chrome.tabs.captureVisibleTab` for screenshots — captured locally, never
  uploaded. The capture-mode setting (clipboard / download / both) controls
  what happens to the PNG.
- `fetch(media.src)` when you click "Download" on an inspected `<img>` /
  `<video>` / `<audio>` / SVG — this is a normal browser request to whatever
  URL the page already references; nothing is added by the extension.

Configured Cloud or Self-hosted mode:

- An HTTPS connection to `https://mcp.designmode.app` (or any
  self-hosted deployment URL you configure) authenticated with a bearer
  token stored in `chrome.storage.local`. The cloud server (open
  source at `packages/mcp-cloud`) acts as a relay between the
  extension and a remote MCP agent. Requests and responses are temporarily
  queued in Redis with a requested 60-second expiry; responses are normally
  deleted when consumed. Queue insertion and expiry are separate operations,
  so the 60-second lifetime is best-effort rather than a guaranteed maximum.
  The service retains the credential's SHA-256 hash, anonymous tenant ID, and
  created/last-seen timestamps until revocation. Operational logs contain
  bounded metadata, not selectors, screenshots, or payload bodies.
  Switch to Local mode on the MCP page to keep MCP traffic on your machine.

When you're connected to a coding agent (via any of the modes above), the edit
set it reads (`get_changes`) carries, per change, the page's **viewport width**
at edit time and the derived breakpoint (mobile / tablet / desktop) so the agent
can scope edits to a media query. This is window-size metadata, not personal
data, and it only travels over the connection you've already opted into.

### Extension usage analytics (on when the build is configured)

A release build sends usage events to PostHog without a separate opt-in. It is not a paid feature and it does not change what the editor can do. The event names the browser package as `chrome`, `firefox` or `safari`.

Release builds include the PostHog project and send these events without a settings opt-in. An ordinary source build with no project configuration still sends nothing. Project 629592 is the extension-only destination. The public project token is embedded in the release packages, not printed in documentation. See [ANALYTICS.md](packages/extension/ANALYTICS.md). This source does not verify the receiver's billing or retention settings.

The extension sends only a fixed event schema: bounded feature names,
attempt/command_acknowledged/failure or MCP-state outcomes, bounded friction
reasons, MCP mode and state when applicable, and the browser package (`chrome`, `firefox` or `safari`; Edge, Brave and Arc use the Chrome package), validated
browser language and Intl timezone when available (which may suggest a region),
extension version, schema version 2, `extension` surface, and a best-effort distribution label.
Event names describe the action (for example `dm_style_edit`, `dm_send_to_agent`)
rather than the generic `dm_feature`; outcomes remain separate. No raw user agent,
browser version, OS or certain Brave identification is collected. Language is
bounded to 35 characters with no private-use subtags; timezone to 64 and validated
by Intl. Invalid/unavailable metadata is omitted.
`command_acknowledged` means only a command returned without a reported error,
including empty/no-op responses; it is not feature or agent completion. Screenshot
clipboard outcomes follow the actual clipboard promise. Download outcomes mean
only initiation or failure to initiate, never verified save-to-disk completion.
Distribution labels (`published_hint`, `unpublished_hint`, `fork`, `unknown`)
are unverified signals or distributor declarations, **not proof of an official
installation**. No extra browser permission is requested to classify installs.

There is **no autocapture, session replay, pageview tracking, remote SDK code,
feature-flag fetching, or exception reporting**. Events cannot include page URLs,
selectors, comments, text, edits, design/authentication tokens, screenshots, raw
errors, MCP payloads, account IDs or extension IDs. PostHog requires a distinct ID;
we generate a new random ID for every event, never persist it or correlate devices,
and disable person profiles and GeoIP enrichment. This deliberately cannot measure
unique users, retention cohorts, sessions or user-level funnels: aggregate-only
measurement, with no persistent or session tracking identity. As with any HTTPS request, the receiver still
sees your IP address and ordinary transport metadata. This is not a promise of
network-level anonymity. Cookies and referrers are omitted; redirects are rejected.

The sole sender is the background context. Events are best-effort, capped at 60
per minute per live background context and four in flight; there is no disk queue,
retry, beacon, or saved analytics identifier. Closing/restarting that context can
lose events and resets its in-memory rate limit. An acknowledged opt-out stop blocks
new sends in the live sender, invalidates pending checks and aborts in-flight
requests. Opt-out removes `dm-analytics-consent-v1` from `storage.local`; on removal
failure it attempts a durable disabled record under the same key. If both writes
fail, the UI warns that old consent may resume sending after a worker restart.
Browser storage failure means a permanent stop cannot be guaranteed. Already
received requests cannot be recalled. Reset settings also opts out. Removing Firefox data
permission stops the live sender and attempts the same durable opt-out. Once
persisted, regranting native permission alone cannot enable analytics. If storage
writes fail, old local consent may survive and become usable on a later restart
with native permission granted.

Firefox 140+ uses optional `technicalAndInteraction` and `locationInfo` permissions
(the latter conservatively covers timezone/region) **in addition
to** our explicit opt-in. Firefox 121–139 uses the same in-extension disclosure and
unchecked/off consent control, detected via the absence of `data_collection` in
`permissions.getAll()`. The minimum supported version remains 121. This declaration
covers optional analytics, not a new authorization to transmit page/MCP content.

No account, project, retention settings or billing plan is provisioned by this
code. Before distributing an enabled build, its operator must verify free-only
billing, publish the receiver/operator and retention/deletion policy, and update
store disclosures. See [analytics activation and verification](packages/extension/ANALYTICS.md).
MCP servers and CLI do not emit analytics. There is no remote update channel beyond
the standard Chrome Web Store / addons.mozilla.org mechanisms.

## Agent CLI

The optional `@designmode-app/cli` executable (`designmode-app`) defaults to
Cloud. After you configure that mode's credential, `tools`, `schema`, `status`
and `call` contact `https://mcp.designmode.app/api/mcp`. Self-hosted sends those
requests to your explicitly configured `/api/mcp` endpoint. HTTPS is required
except for a relay on literal localhost / 127.0.0.1 / [::1]; redirects are not
followed. Requests carry the selected mode's bearer token, and tool calls/results
may include page edits, comments, screenshots and session metadata. Relay
retention and logging are as described above. Discovery/status also update
relay presence and credential last-seen metadata without verifying the browser.

CLI credentials come from mode-specific environment variables or an explicitly
selected user-owned 0600 JSON file (`DM_CONFIG`), never argv. The CLI does not
persist credentials or read a default credential file. Help/no-argument usage
reads no config and makes no network requests. Local mode reuses the existing
loopback bridge; its tool/schema discovery is offline. CLI stdout can contain
sensitive tool results; take care where you store it. No CLI telemetry is added.

## What the website (designmode.app) does

The marketing/docs site is a separate concern from the extension. The site:

- Uses Inter fetched at build time and self-hosted by Next.js; a
  visit to the deployed site does not request the font from Google Fonts.
- Loads **Google Analytics (gtag.js)** if the deployment sets the
  `NEXT_PUBLIC_GA_ID` environment variable. The upstream production deploy
  does so; forks and self-hosts opt in by setting their own ID. If unset, no
  analytics script is rendered.

When enabled, GA receives page views plus `cta_click`, `contact_click`, and
`outbound_click` events. CTA events include the store/browser label; contact
events include the clicked `mailto:` or `tel:` target; outbound events include
the destination URL and link text. We do not configure a custom user ID or
send extension edits or MCP payloads. A tracker blocker can stop the script;
the site degrades gracefully without it.

## Permissions explained

The extension requests:

- `activeTab`, `tabs` — open the side panel against your current tab and
  re-attach after navigations/reloads.
- `scripting` — inject the inspector script when you open the panel.
- `storage` — see the storage table above.
- `sidePanel` (Chrome) / `sidebar_action` (Firefox) — render the editor in the browser's side panel / sidebar.
- `<all_urls>` — so the editor works on any site you choose to inspect.
  The extension does nothing until you open the panel on a tab.

## Reporting concerns

If you find behavior that contradicts the above, please open an issue or
follow the disclosure process in [SECURITY.md](./SECURITY.md).
