# Privacy

Design Mode runs locally. The browser extension does not send your browsing
activity, page contents, or edits to any server controlled by us.

## What the extension stores, and where

All extension data lives on **your machine**, in Chrome's extension storage.

| Storage area              | What's there                                                                        | Lifetime                       |
| ------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| `chrome.storage.local`    | UI preferences: `dm-theme`, `dm-color-format`, `dm-capture-mode`, inspector overlay colours (`dm-inspector-hover-color`, `dm-inspector-select-color`, `dm-overlay-margin-color`, `dm-overlay-padding-color`), contrast-checker settings (`dm-a11y-category`, `dm-a11y-level`) | Until you uninstall the ext.   |
| `chrome.storage.sync`     | User-saved presets you opt to sync across devices                                   | Synced via your Chrome account |
| `chrome.storage.session`  | Per-page edit sessions (style/text/DOM changes), keyed by `origin + path + search`  | Until tab/browser closes       |

The extension never reads form contents, passwords, or page-script data.
It only reads computed CSS, geometry, and DOM structure for elements you
actively inspect.

## What leaves your machine

By default the extension talks to **`localhost`** only. There is one
optional cloud mode the user explicitly turns on; otherwise nothing
leaves the machine.

Default (no opt-in needed):

- A WebSocket connection to `ws://localhost:9960` if you've opted in by
  starting the companion MCP server (`npm start`). The server runs on your
  machine; nothing is uploaded.
- `chrome.tabs.captureVisibleTab` for screenshots — captured locally, never
  uploaded. The capture-mode setting (clipboard / download / both) controls
  what happens to the PNG.
- `fetch(media.src)` when you click "Download" on an inspected `<img>` /
  `<video>` / `<audio>` / SVG — this is a normal browser request to whatever
  URL the page already references; nothing is added by the extension.

Optional cloud mode (you turn it on explicitly in Settings):

- An HTTPS connection to `https://mcp.designmode.app` (or any
  self-hosted deployment URL you configure) authenticated with a bearer
  token stored in `chrome.storage.local`. The cloud server (open
  source at `packages/mcp-cloud`) acts as a relay between the
  extension and a remote MCP agent — it doesn't store your edits;
  messages flow through and are dropped when the connection closes.
  Disable cloud mode in Settings to revert to localhost-only.

There are **no analytics, no telemetry, and no error reporting** in the
extension or the MCP server. There is no remote update channel beyond the
Chrome Web Store's standard mechanism.

## What the website (designmode.app) does

The marketing/docs site is a separate concern from the extension. The site:

- Loads **Google Fonts** (Manrope, Cascadia Code) from `fonts.googleapis.com`.
  Visiting the site sends your IP to Google's CDN as part of the font fetch.
- Loads **Google Analytics (gtag.js)** if the deployment sets the
  `NEXT_PUBLIC_GA_ID` environment variable. The upstream production deploy
  does so; forks and self-hosts opt in by setting their own ID. If unset, no
  analytics script is rendered.

GA collects standard pageview/session data per Google's policy. We don't
configure custom user IDs, custom events, or PII. To opt out, use a tracker
blocker — the site degrades gracefully without GA.

## Permissions explained

The extension requests:

- `activeTab`, `tabs` — open the side panel against your current tab and
  re-attach after navigations/reloads.
- `scripting` — inject the inspector script when you open the panel.
- `storage` — see the storage table above.
- `sidePanel` — render the editor in Chrome's side panel.
- `<all_urls>` — so the editor works on any site you choose to inspect.
  The extension does nothing until you open the panel on a tab.

## Reporting concerns

If you find behavior that contradicts the above, please open an issue or
follow the disclosure process in [SECURITY.md](./SECURITY.md).
