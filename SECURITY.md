# Security policy

## Reporting a vulnerability

Please **do not** file public GitHub issues for security problems.

Email the maintainer privately at `hello@sandeepbaskaran.com` and include:

- A description of the issue and the impact you observed.
- Steps to reproduce (a minimal HTML page or extension trigger is best).
- Affected version (commit SHA or release tag).

You'll get an acknowledgement within a few days. Coordinated disclosure is
preferred — please give a reasonable window for a fix before any public write-up.

## Scope

In scope:

- The browser extension (`packages/extension`).
- The MCP / WebSocket companion server (`packages/mcp-local`).
- The cloud relay (`packages/mcp-cloud`, deployed at `mcp.designmode.app`).
- The CLI (`packages/cli`).
- The website (`website/`).

Out of scope:

- Vulnerabilities in third-party dependencies that already have published
  advisories — open an upstream issue and let us know once a fix is available.
- Issues that require an attacker to already control the user's machine
  (the extension is local-first; localhost is part of the trust boundary).

## Threat model

### Why the extension asks for `<all_urls>`

Design Mode is a visual editor for whatever page you are looking at, so
the content script must run on any origin the user opens — there is no
fixed list of sites to declare. The manifest therefore requests
`<all_urls>` as a host permission and content-script match. The
mitigations are:

- The content script is inert until the user opens the panel on that tab;
  it does not read, send or persist page content on its own. Saved edits
  live in extension storage keyed by origin and route and never leave the
  browser unless the user runs Send to Agent, Copy as Prompt, export or
  screenshot.
- The extension never injects remote code. CSP is `script-src 'self'`,
  there is no `eval`/`new Function`, and all bundles ship inside the zip.
- `file://` pages fail closed on Safari and require the user to enable
  file access on Chrome/Firefox.
- Analytics (when enabled in release builds) carries feature names and the
  browser family only — never URLs, selectors, text or screenshots. See
  [PRIVACY.md](./PRIVACY.md).

If a future feature could work with the narrower `activeTab` permission,
prefer it; broadening host access beyond `<all_urls>` is not possible, so
the review focus is on what the content script does with page data.

### Cloud relay: wildcard CORS and anonymous tokens

`packages/mcp-cloud` answers `Access-Control-Allow-Origin: *`. This is
deliberate: the extension calls the relay from the extension origin
(`chrome-extension://`, `moz-extension://`, `safari-web-extension://`)
and from arbitrary page origins, none of which can be enumerated. The
wildcard does **not** weaken authentication because:

- Every data route requires a bearer token (`Authorization: Bearer dm_…`).
  Browsers never attach that header cross-origin without explicit
  JavaScript, and wildcard CORS forbids credentials (cookies) entirely, so
  a hostile page cannot ride on an existing session. There are no cookies.
- Tokens are 24 random bytes minted by `/api/auth/register` and stored
  server-side only as a SHA-256 hash; the plaintext exists in the
  extension's `chrome.storage.local` and the agent's MCP config.
- A leaked token is scoped to one anonymous tenant and can be revoked from
  the panel (`/api/auth/revoke`); it grants no access to any other tenant.

Anonymous registration is the main abuse surface, so it is throttled:

- `/api/auth/register` is limited per client address (first
  `x-forwarded-for` hop, then `x-real-ip`) to `DM_REGISTER_LIMIT` mints per
  `DM_REGISTER_WINDOW_S` seconds (defaults: 5 per hour). Excess requests
  get `429` with `Retry-After` and no row is written.
- Each tenant has a daily request quota (`DM_DAILY_QUOTA`, default 25) and
  a burst limit of 15 requests per 10 seconds on `/api/mcp`.
- Relay payloads (hand-off requests and agent replies) are Redis keys with
  a 60-second TTL; only the token hash and quota counters outlive a
  request. Self-hosters get the same limits against their own Redis.

Reports that bypass the register throttle, read another tenant's data, or
recover a plaintext token from the relay are in scope and high priority.

## Hardening notes for contributors

- Local MCP binds its owner bridge to `127.0.0.1` and requires the ephemeral
  owner token for both WebSocket and HTTP tool-proxy requests. Concurrent
  Design Mode clients attach to that owner; a foreign port occupant is never
  killed. Cloud mode talks to `https://mcp.designmode.app` (or a configured
  self-hosted deployment) over HTTPS with a bearer token stored in
  `chrome.storage.local`. Don't introduce a new outbound service without an
  explicit setting and a note in [PRIVACY.md](./PRIVACY.md).
- Treat the side panel context as privileged. The contenteditable
  rich-text editor sanitises the inspected page's `innerHTML` via a
  strict tag/attribute allow-list (see `sanitizeRichTextHtml` in
  `packages/extension/src/sidepanel/sidepanel.ts`) before rendering.
  Any code path that interpolates page-derived values into HTML or
  CSS contexts must use `escapeAttr` / `safeCssColor` accordingly.
  Two CSS-generation surfaces added for 1.9.0 need the same scrutiny:
  the `dm-token-overrides` stylesheet (`packages/extension/src/content/root-var-store.ts`),
  which interpolates page-derived scope selectors and token values into
  `scope { --token: value !important }`, and the state-variant override
  sheet (`packages/extension/src/content/change-tracker.ts`), which emits
  `[data-dm-id]:hover { }` / `@starting-style { }` blocks.
- Don't commit secrets — `.env*` is gitignored. The website's `NEXT_PUBLIC_*`
  vars ship in HTML and are not secrets, but treat anything else as sensitive.
- Never add `eval`, `new Function`, or inline event-handler injection in the
  extension. Manifest V3 service workers reject most of this anyway, but
  reviewers should flag it on sight.
