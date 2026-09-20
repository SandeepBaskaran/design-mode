# Privacy

Design Mode runs locally. The browser extension does not send your browsing
activity, page contents, or edits to any server controlled by us.

## What the extension stores, and where

All extension data lives on **your machine**, in the browser's extension storage.

| Storage area              | What's there                                                                        | Lifetime                       |
| ------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| `chrome.storage.local`    | UI preferences: `dm-theme`, `dm-color-format`, `dm-capture-mode`, active Tokens-panel tab (`dm-tokens-tab`), inspector overlay colours (`dm-inspector-hover-color`, `dm-inspector-select-color`, `dm-overlay-margin-color`, `dm-overlay-padding-color`), contrast-checker settings (`dm-a11y-category`, `dm-a11y-level`), nudge-amount (`dm-nudge-amount`), page-cursor toggle (`dm-custom-cursor`), Chrome launch surface (`dm-launch-surface`: `side-panel` / `floating` / `picture-in-picture`), pop-out window bounds (`dm-popout-bounds`), pinned PiP window size + support flag (`dm-pip-size`, `dm-pip-unsupported`) | Until you uninstall the ext.   |
| `chrome.storage.sync`     | User-saved presets you opt to sync across devices                                   | Synced via your browser's sync account (Chrome Sync / Firefox Sync) |
| `chrome.storage.session`  | Per-page edit sessions (style/text/DOM changes), keyed by `origin + path + search`  | Until tab/browser closes       |

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

The extension sends data only through the MCP mode you configure. Fresh
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

There are **no analytics, no telemetry, and no error reporting** in the
extension or the MCP server. There is no remote update channel beyond the
standard store mechanism — the Chrome Web Store for Chromium browsers and
addons.mozilla.org (AMO) for Firefox.

## What the website (designmode.app) does

The marketing/docs site is a separate concern from the extension. The site:

- Uses Google Sans Flex fetched at build time and self-hosted by Next.js; a
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
