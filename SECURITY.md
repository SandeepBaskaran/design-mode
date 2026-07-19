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
- The website (`website/`).

Out of scope:

- Vulnerabilities in third-party dependencies that already have published
  advisories — open an upstream issue and let us know once a fix is available.
- Issues that require an attacker to already control the user's machine
  (the extension is local-first; localhost is part of the trust boundary).

## Hardening notes for contributors

- The extension's default transport is `ws://localhost:<port>` (the
  MCP-local server). When the user opts into cloud mode it talks to
  `https://mcp.designmode.app` (or any user-configured self-hosted
  deployment) over HTTPS with a bearer token stored in
  `chrome.storage.local`. Don't introduce new outbound calls without
  an explicit, opt-in setting and a note in [PRIVACY.md](./PRIVACY.md).
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
